# Phase580：Host tool audit maintenance descriptor close settlement timeout

## 背景

Phase576-579已经保证maintenance-owned `FileHandle`和`Dir` resource的close同步throw、async rejection与成功settlement都会被normalized、all-settled并投影为result-preserving lifecycle evidence。Shared finalizer当前仍直接等待每个returned close Promise：

```text
invoke close once
await returned Promise without deadline
aggregate after every Promise settles
```

如果某个close Promise永久pending，整个maintenance control flow永久pending：

- successful candidate scan无法进入namespace transaction；
- scan primary error无法返回typed maintenance error；
- 已提交cleanup/recovery无法返回resolved result；
- 其他resource即使已经完成close，也无法形成最终aggregate report；
- CLI human/JSON command没有ERROR、WARN或exit settlement。

Phase580 red probe在active candidate第一条directory stream上调用真实close后返回受控pending Promise。虚拟时间推进60秒后，`cleanupJsonlAuditFileLock(...)`仍未settle；只有测试主动resolve该Promise后operation才继续。这证明Phase579的single-attempt invocation normalization仍缺少settlement上界。

## Settlement Contract

新增module-private maintenance descriptor close settlement deadline：

```text
JSONL_AUDIT_LOCK_MAINTENANCE_CLOSE_TIMEOUT_MS = 5000
```

每个maintenance-owned resource遵守：

1. `close()`只调用一次，不重试；
2. sync throw、async rejection与resolve保持Phase560/576语义；
3. returned Promise在5000ms event-loop timer deadline前未settle时，该resource形成timeout failure；
4. timeout不取消、重复调用或推断underlying close/kernel descriptor状态；
5. late resolve/reject继续由attached observer消费，但不得改变已经返回的operation result，也不得产生unhandled rejection；
6. 所有resource close与timer并发启动，operation总finalization wait约束为一个deadline，而不是resource count乘以deadline。

Timer bound不是hard real-time guarantee：event loop被同步阻塞时timer只能在重新获得调度后触发。本阶段只消除正常异步Promise永久pending造成的无界等待。

## Runtime Design

`invokeJsonlAuditLockMaintenanceResourceClose(...)`拆分为三个步骤：

1. 通过Promise normalization启动一次`resource.close()`；
2. 立即为其安装fulfilled/rejected observer，把raw rejection转换为owned settlement record；
3. 与module-private timeout settlement执行`Promise.race(...)`。

结果处理：

- fulfilled：helper resolve；
- rejected：重新throw原reason，由现有all-settled aggregate formatter处理；
- timed out：throw固定safe `Error`，message为`maintenance descriptor close timed out after 5000 ms`。

`finalizeJsonlAuditLockMaintenanceResources(...)`继续按resource identity去重并调用`Promise.allSettled(...)`。因此一个resource timeout不会阻止其余resource获得close invocation；timeout与普通close rejection可共同进入single-line、512-character bounded warning。

Phase579 immediate stream finalization同样使用该helper。Stream在deadline前close成功时行为完全不变；超时时scan成功结果继续返回、scan primary error继续rethrow，context记录`closed:false`和timeout warning。后续namespace mutation仍由既有descriptor/path/generation gates决定，timeout本身既不是mutation success也不是mutation failure证据。

## Result与CLI Projection

Phase580不新增public fields。Resolved result或typed rejection继续复用：

- cleanup：`cleanupHandlesClosed`、`cleanupHandleWarning`；
- recovery：`recoveryHandlesClosed`、`recoveryHandleWarning`；
- CLI：对应既有snake_case fields。

Branch语义：

- successful cleanup/recovery加timeout：保留operation outcome并返回WARN；
- primary operation/read failure加timeout：保留primary message/cause并返回ERROR，同时附加false/warning；
- 全部close在deadline前成功：closed true且省略warning；
- candidate missing或未取得maintenance descriptor：继续省略lifecycle fields。

Warning中的5000ms是Host-local operational evidence，不进入fingerprint、confirmation、owner metadata或persistent state。

## Covered Graph

- Phase579 maintenance-aware `Dir` stream close。
- 六个top-level active/quarantine/disposal cleanup与quarantine recovery finalizers。
- 五个candidate reader及Phase578 failed-open handoff handles。
- Private temporary root/parent、mutation parent、recovery reservation与empty assertion handles。

本阶段不修改：

- read-only inspection的direct stream close；
- rotation staging scanner；
- Phase559-562 rotation recovery专用handle finalizer；
- normal writer、lock acquisition/release与shared throwing closer。

这些graph仍保持各自既有settlement contract，可由后续阶段单独审计，避免一次改变多个operation family的timing语义。

## Tests

- Successful active candidate scan的stream close永久pending：deadline后cleanup提交，resolved result为false/timeout warning。
- Scan read primary failure叠加pending close：deadline后typed error保持primary message/cause并附加timeout evidence。
- Committed cleanup的candidate `FileHandle.close()` pending：operation在deadline后返回，其他handles仍各close一次。
- Pending close与普通close rejection并存：aggregate warning同时包含timeout与rejection，保持single-line和512字符上界。
- Timeout后close Promise late resolve/reject：returned result不变，无unhandled rejection或二次projection。
- CLI human/JSON覆盖resolved WARN与primary ERROR，不泄漏owner token。
- Compiled smoke直接验证dist timeout guard、filesystem result和CLI projection。

## 接口与安全边界

- Timeout不是descriptor已关闭或仍打开的证明；public boolean必须为false。
- 不调用第二次close，不尝试强制cancel native I/O，不保存pending Promise或raw resource到public state。
- Late settlement observer只承担rejection consumption，不写回result、context、log或filesystem。
- 不修改scan budget、truncation、fingerprint、mutation ordering、commit/rollback、residual locator或terminal existence semantics。
- 不新增CLI flags、commands、exit code、human/JSON field names、environment variables或public runtime option。
- 不修改JSON-RPC、agent event、provider、tool result、transcript、owner metadata或persistent schema。

## 验收标准

- 任一maintenance resource returned close Promise永久pending时，operation必须在一个5000ms timer deadline后settle。
- 所有resource仍只调用close一次，且并发启动；一个timeout不能阻止其他close invocation。
- Successful result与primary error均不得被timeout替换。
- Late resolve/reject不得产生unhandled rejection或改变已发布evidence。
- Stable、missing、inspection、rotation、mutation与跨层contracts保持。
- Python、TypeScript、build、built integration和CLI smoke全部通过。
- Workspace及`/tmp`无probe、smoke、integration、audit lock或patch残留，无相关test/engine/CLI进程和FileHandle/Dir GC warning。

## 实现结果

Phase580已按上述settlement、late-observation和compatibility边界完成实现。

### Red probe与修复结论

- Active candidate第一条`Dir.close()`调用真实close后返回受控pending Promise；旧实现即使虚拟时间推进60秒仍未settle，只有测试主动resolve后才继续cleanup。
- 新实现到5000ms timer deadline后把该resource记为timeout failure，successful scan继续transaction并返回resolved WARN；pending Promise不再无限阻塞operation。
- Scan read primary failure叠加pending close时，deadline后typed maintenance error保持read message/cause，timeout仅进入false/warning details。

### Runtime实现

- 新增module-private `JSONL_AUDIT_LOCK_MAINTENANCE_CLOSE_SETTLEMENT_TIMEOUT_MS = 5_000`，没有导出runtime option、environment override或CLI配置面。
- `invokeJsonlAuditLockMaintenanceResourceClose(...)`先通过Promise normalization启动一次close，再立即安装fulfilled/rejected observer，并与timeout settlement执行`Promise.race(...)`。
- Deadline前rejection重新throw原reason；timeout产生固定safe message。`finally`清除timer，全部resources仍由outer `Promise.allSettled(...)`并发消费。
- Timer胜出后underlying close settlement仍由owned observer消费。Runtime回归在operation返回后主动late-reject pending `FileHandle` Promise，未产生unhandled rejection，已发布warning也未被late reason改写。
- Phase579 stream immediate finalization和Phase576-578 `FileHandle` graph自动获得相同deadline；candidate/operation contexts、resource identity dedupe和bounded aggregate warning保持。

### CLI与自动化验证

- Runtime audit suite新增4项回归，累计268 tests passed，覆盖successful stream timeout、primary-error timeout、pending `FileHandle`加其他close continuity、timeout与普通rejection聚合及late rejection observation。
- CLI audit suite新增2项回归，累计108 tests passed，覆盖active cleanup resolved WARN与scan-primary ERROR的human/JSON timeout projection及owner-token non-disclosure。
- TypeScript全量为43 test files、890 tests passed。
- `bash tools/check.sh`通过：Python 422 tests、TypeScript 43 files/890 tests、TypeScript build、built integration和完整CLI smoke全部成功，最终输出`CLI smoke ok`。
- Compiled smoke新增`built audit maintenance descriptor close settlement timeout`场景，通过缩短测试进程内timer调度验证dist 5000ms evidence、committed cleanup、late rejection consumption、filesystem state与CLI projection。

### 静态、接口、文档与残留审计

- Source与compiled dist均仅包含一个module-private 5000ms maintenance timeout constant和同构observer/race/clear逻辑；六个operation contexts、五个candidate contexts及Phase579 stream context数量保持。
- Phase559-562 rotation recovery finalizer仍调用原`invokeJsonlAuditFileHandleClose(...)`，inspection与rotation staging direct-close graph未接入本阶段timer。
- CLI和protocol未出现`close_timeout`、`settlement_timeout`或新增public field/option；existing lifecycle boolean/warning、mutation、fingerprint、wire和persistent contracts保持。
- `README.md`、`PROJECT_PLAN.md`、`INTERNAL_DESIGN.md`、`ARCHITECTURE.md`、`EXTENSION_POINTS.md`、`SECURITY.md`和`protocol/README.md`已同步到Phase580，project item 569与extension item 495已登记完成，Phase579延期边界已回链本阶段。
- Workspace未发现`.tmp`、`.bak`、`.orig`或`.rej`残留。Full check留下的8个`/tmp/god-code-audit-0-*.lock`目录经owner PID核验均无存活进程后已逐项清理；Phase580、smoke、integration与audit相关`/tmp`复核为空。
- 未发现残留vitest、pytest、check、smoke、integration、engine或CLI进程，也未观察到FileHandle/Dir GC warning。

Phase580只约束maintenance-owned descriptor close Promise的异步settlement，不改变normal writer、lock acquisition/release、read-only inspection、rotation staging或Phase559-562 rotation recovery finalizer。其延期的read-only inspection direct-close永久pending边界已由Phase581闭合；mutating rotation recovery、acquisition与writer仍可独立审计。
