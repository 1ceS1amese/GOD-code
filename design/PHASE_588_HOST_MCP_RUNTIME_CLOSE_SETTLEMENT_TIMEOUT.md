# Phase588：Host MCP runtime close settlement timeout

## 背景

`SdkMcpStdioRuntime.close()`当前按LIFO顺序逐个关闭connected MCP server：先`await client.close()`，只有reject后才尝试`transport.close()`。该实现没有settlement deadline，也没有共享close lifecycle：

- 一个server的client close Promise永久pending时，后续server永远不会开始close；
- client reject后的transport fallback也可能永久pending；
- concurrent/repeated `close()`会各自消费剩余`servers`数组，部分caller可能提前返回，无法观察同一shutdown lifecycle；
- `connect()`在重连前和connect/list-tools失败后都会`await close()`，cleanup永久pending会无限延迟原始diagnostic error；
- `PreparedGodCodeHost.close()`、headless run、doctor、MCP CLI与test teardown都可能永久阻塞，进而阻断engine stop或进程退出；
- late close rejection没有统一owned observer contract。

Phase588用三条red probe冻结multi-server concurrency/repeated close、transport fallback和connect primary行为。所有probe让selected close返回受控pending Promise；推进60秒虚拟时间时旧实现均未settle。

## Close Contract

Phase588新增module-private deadline：

```text
MCP_RUNTIME_CLOSE_SETTLEMENT_TIMEOUT_MS = 5000
```

`McpRuntime.close(): Promise<void>`的public签名和best-effort语义保持不变：close failure或timeout不向caller抛出，也不新增CLI warning/schema。内部遵守：

1. close开始时立即清空tool map并snapshot当前connected servers；
2. snapshot中的所有server并发进入shutdown，不因一个server pending阻断其他server；
3. 每个client close single-attempt调用并等待最多5000ms event-loop deadline；
4. client reject或timeout后，existing transport fallback single-attempt调用并同样等待最多5000ms；
5. client fulfilled时不额外调用transport close；
6. timeout不cancel底层Promise，也不推断child process/socket/HTTP session是否已经closed；
7. late resolve/reject由owned settlement observer消费，不产生unhandled rejection或二次fallback；
8. 同一active close lifecycle由memoized Promise表示；concurrent/repeated caller必须等待同一settlement，不重复close或提前报告完成；
9. lifecycle settle后清除memoized Promise，允许后续connect/close cycle管理新server snapshot。

单个server最坏关闭时间为client 5000ms加fallback transport 5000ms；多个server并发，因此总时间不随server数量线性累积。

## Connect Primary Continuity

`connect()`保持现有顺序：

- 新连接前等待previous close lifecycle；
- server connect或list-tools失败后执行best-effort cleanup；
- cleanup client/transport timeout在bounded lifecycle后完成；
- 原始`McpRuntimeDiagnosticError`及其`code`、`server_id`和`cause_message`保持；
- close timeout或late reason不覆盖、拼接或泄漏到primary diagnostic。

旧server的late settlement只能作用于其捕获的client/transport object，不得清空或关闭后续connect cycle新增的server/tool state。

## Host与CLI边界

- `PreparedGodCodeHost.close()`继续只await `McpRuntime.close()`，无需新增timeout option或warning field。
- Headless run、RPC smoke、doctor和MCP CLI teardown在最多bounded MCP cleanup后继续执行后续engine/process cleanup。
- CLI中现有`.catch(() => undefined)`保持兼容，但不再需要防御永久pending。
- Plugin runtime close、engine shutdown、JSON-RPC peer、resource update timeout和tool execution cancellation不在本阶段修改。

## Tests

- Pending client位于server snapshot中时，其他server client close必须并发启动。
- Concurrent/repeated `close()`必须等待同一lifecycle，client/transport invocation保持single-attempt。
- Client pending timeout后transport fallback执行；late client reject无unhandled rejection。
- Client reject后transport fallback永久pending时，runtime仍在fallback deadline后resolve；late transport reject无unhandled rejection。
- List-tools primary叠加pending cleanup时，原始typed diagnostic保持且在deadline后返回。
- Existing stdio、streamable HTTP、HostToolRegistry、permission和headless integration tests全部回归。
- Compiled smoke从`dist/`注入两个fake connected servers，验证并发、memoization、fallback、deadline和late rejection consumption。

## 接口与安全边界

- 不新增public MCP method、config field、environment variable、CLI flag、command、exit code或report field。
- 不修改JSON-RPC、Engine event、provider/tool result、transcript、plugin manifest或persistent schema。
- 不输出server URL、header、bearer token、command、cwd、process handle、transport object或late reason。
- Timeout只表示returned close Promise未按期settle，不证明MCP server process、socket或HTTP session仍存活或已经退出。
- Transport fallback不得因late client settlement再次触发；new connect cycle不得复用old snapshot或close Promise。

## 验收标准

- 任一MCP client或transport close Promise永久pending时，runtime close在对应5000ms deadline后继续settle。
- Multi-server shutdown并发且same-resource single-attempt。
- Concurrent/repeated close caller等待同一active lifecycle。
- Connect/list-tools primary不被cleanup timeout覆盖或无限延迟。
- Late resolve/reject无unhandled rejection、二次fallback或new-cycle state mutation。
- Public TypeScript、CLI、protocol、environment和persistent interfaces保持。
- Python、TypeScript、build、built integration和CLI smoke全部通过。
- Workspace与`/tmp`无probe、MCP fixture、smoke、integration或patch残留，无相关test、MCP server、engine或CLI进程。

## Red Baseline

- `test/mcpRuntime.test.ts`新增三条probe后共12项；定向执行中三条Phase588 probe失败，其余9项跳过。
- 三项失败均为`settlement.settled:false`：multi-server pending client、pending transport fallback和connect failure cleanup在60秒虚拟时间后仍未settle。
- Multi-server probe同时记录旧实现首个pending server阻断后续server，repeated close单独消费剩余数组并可提前返回，证明缺少共享close lifecycle。

## 实现结果

- `mcp/runtime.ts`新增module-private 5000ms close constant、owned settlement wrapper、per-server closer和memoized runtime lifecycle。Close立即清空tools并`splice(0)` snapshot connected servers，所有server通过`Promise.allSettled`并发关闭。
- Client close fulfilled时直接完成；reject、sync throw或timeout后single-attempt执行transport fallback，fallback同样bounded。Underlying Promise的late resolve/reject由attached observer消费，不重试、不cancel、不输出reason，public close继续best-effort resolve。
- Concurrent/repeated `close()`复用同一active Promise，不再各自消费`servers`或提前返回；lifecycle settle后只在identity仍匹配时清除memoized Promise，后续connect cycle可管理新的snapshot。
- Runtime新增3项测试并全部通过：pending client下其他server并发启动且repeated caller等待同一lifecycle；client reject后的pending transport在deadline后settle；list-tools typed primary跨pending cleanup保持。`test/mcpRuntime.test.ts`共12项通过。
- MCP、CLI/plugin和platform相关回归共66项通过，真实stdio、Streamable HTTP、legacy SSE、HostToolRegistry permission/audit与headless RPC smoke行为保持。
- Compiled smoke从`dist/mcp/runtime.js`注入两个fake connected servers和placeholder tool，验证并发启动、repeated-close共享、client timeout后的transport fallback、state清空、late rejection consumption与无unhandled rejection；完整CLI smoke通过。
- 全量`tools/check.sh`通过：Python 422项；TypeScript 43个test files、934项；TypeScript build、built integration与完整CLI smoke全部成功。
- 静态接口校验通过：source/dist各只有一个MCP close timeout constant、一个memoized close field、一个per-server closer和一个owned settlement wrapper；old serial `while/pop/await client.close()`路径已删除。Helpers/constant/field均未export，public `McpRuntime.close(): Promise<void>`、config、CLI、protocol、environment和persistent schema未变化。
- 主README、项目计划、内部设计、架构、扩展点、安全与protocol文档已同步到Phase588；Phase8记录runtime foundation衔接，Phase587记录audit close ownership审计完成后转向下一处live gap。
- 残留审计完成：6个全量测试遗留audit lock/quarantine fixture的owner PID 761388与762652均已退出，随后清理exact test prefix。最终`/tmp`无Phase588、audit、MCP fixture、smoke或integration残留；workspace无`.tmp`、`.bak`、`.orig`或`.rej`，也无check、Vitest、pytest、MCP server、engine或CLI进程。

## Phase589 后续衔接

Phase589在Phase588 bounded MCP runtime之上补齐prepared-host ownership。`prepareGodCodeHost()`的plugin/tool catalog/context failure现在并发回滚全部已创建runtime并保持setup primary；成功host把plugin和MCP close汇合到永久terminal Promise，concurrent与post-settlement repeated caller都不会重复finalize。Host层不增加早于Phase588 client加transport fallback窗口的第二套timeout，外层host+engine复合finalizer另留后续阶段。
