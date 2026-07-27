# Phase507 Host Tool Audit Path Identity Coordination

## 状态

代码、测试与文档已完成。

## 审计结论

JsonlAuditSink此前保留constructor收到的path并使用instance-local `writeTail`。直接传入relative path时，进程cwd在后续record前变化会让同一sink指向不同文件。两个sink实例即使指向同一文件，也会各自并发执行lstat、capacity check、rotation和append，可能同时判断current未超限后写入，破坏Phase500的bounded generation语义。

## 目标

- Constructor立即把target解析为absolute path。
- Sink生命周期内path identity不受process cwd变化影响。
- 同进程同absolute path的所有sink共享write serialization。
- Capacity check、permission normalization、rotation和append位于共享tail内。
- 前一write失败不阻止后续实例恢复写入。
- Latest pending write完成后清理coordination map entry。
- 不同absolute path保持并行能力。
- 明确不实现跨进程file lock或distributed coordination。
- 不改变event snapshot、redaction、capacity和tool result语义。

## Path Identity

Constructor使用`path.resolve(filePath)`生成公开`filePath`和内部coordination key。配置入口原本已按运行cwd解析显式环境路径，因此行为保持；直接构造sink的relative path现在也在构造时冻结，不会因后续`process.chdir()`漂移。

## Shared Tail

Module-level map从absolute path映射到latest write Promise。每次合法prepared record读取前一tail，以failure-recovering chain追加完整filesystem transaction，再把新Promise登记为latest。Preparation failure仍在加入tail前拒绝，不影响已排队writer。

Completion handler只在map仍指向当前Promise时删除entry，避免较早write完成时误删后续pending tail。Cleanup rejection被内部吸收，不制造unhandled Promise。

## 跨进程边界

共享map只覆盖同一个Node.js isolate。多个CLI进程、worker process或其他程序同时写同一路径仍可能在capacity/rotation之间竞争。生产部署应保证单进程writer ownership，或在外部提供文件锁、日志代理或集中式audit sink。

## 验收标准

- Direct relative path在constructor后公开为resolved absolute path。
- 两个sink使用同一路径和单record容量上限并发写入。
- 结果形成一个current和一个 `.1`，各包含一条完整record。
- 两条marker均保留，无current双写超限。
- 单实例ordering、failure recovery、rotation、path和mode tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 移除instance-local write tail，新增module-level per-path coordination map。
- Constructor固定absolute file path和coordination key。
- Conditional latest-tail cleanup避免map entry泄漏和错误删除。
- tests覆盖relative identity和two-sink concurrent rotation。
- README、SECURITY、protocol和audit env example同步cross-process boundary。
