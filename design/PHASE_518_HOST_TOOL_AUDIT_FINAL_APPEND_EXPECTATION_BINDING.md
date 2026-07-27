# Phase518 Host Tool Audit Final Append Expectation Binding

## 状态

代码、测试与文档已完成。

## 审计结论

Phase517绑定了path inspection与rotation preparation descriptor，但最终`appendAuditLine`会再次以`O_APPEND|O_CREAT`打开current path。Preparation之后若existing target被替换为另一个合法single-link regular file，final descriptor validation仍会通过并把record写入replacement；若准备时target missing，另一个entry可以在open前抢占路径，通用O_CREAT也会直接打开它。

## 目标

- Rotation preparation显式返回final append expectation。
- Existing generation expectation携带已验证dev/ino identity。
- Existing append不允许隐式创建新文件。
- Existing append在write前重新验证descriptor identity。
- Missing或完成rotation后的append使用atomic exclusive create。
- Unexpected replacement、disappearance和appearance稳定拒绝。
- 所有拒绝发生在write前。
- 新创建文件继续使用0600 mode。
- Append descriptor继续验证regular/single-link约束。
- 不改变正常append、rotation、capacity或audit warning contract。

## Append Expectation State

`JsonlAuditAppendExpectation`是内部discriminated union：

- `{kind:"existing", identity}`：Phase517 descriptor确认current generation存在且未rotation。
- `{kind:"missing"}`：current原本不存在、mode-open期间消失，或已被成功rename为`.1`。

`rotateIfNeeded`不再只返回void，而是把这个状态传递给`appendAuditLine`。Expectation只在同一serialized record pipeline中使用，不持久化、不跨进程共享。

## Existing Append

Existing expectation使用：

```text
O_APPEND | O_WRONLY | O_NOFOLLOW
```

不加入O_CREAT。Open ENOENT转换为稳定`Audit file disappeared before append.`。Descriptor通过regular/single-link检查后，dev/ino必须匹配expectation，否则抛出`Audit file changed before append.`。Identity通过后才执行fchmod和write。

## Missing Append

Missing expectation使用：

```text
O_APPEND | O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW
```

O_EXCL保证本次open拥有从missing到created的原子转换。若路径在准备后出现，EEXIST转换为稳定`Audit file appeared before append.`；existing entry不会被打开、chmod或写入。

## Replacement Tests

- Existing路径测试让rotation preparation完成第一次descriptor open，然后在final open前把current rename并复制出新inode replacement。Final descriptor合法但identity mismatch，record拒绝且两个文件内容保持。
- Missing路径测试在exclusive open前原子rename一个预置文件占用current path。O_EXCL拒绝，预置内容保持。

## 边界

- Expectation覆盖preparation到final descriptor open之间的current path state drift。
- Descriptor open成功后的path replacement不会改变已打开descriptor的write target。
- Rotation rename本身的parent-entry竞态仍保持Phase517边界。
- Cross-process writer serialization仍需外部ownership或locking。

## 验收标准

- Normal existing append保持。
- Normal missing creation保持并使用0600。
- Rotation后新current exclusive creation保持。
- Existing replacement为安全regular file时也拒绝且不写入。
- Existing disappearance返回稳定错误。
- Missing path appearance返回稳定错误且entry内容保持。
- Symlink、hard-link、capacity和rotation tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增内部`JsonlAuditAppendExpectation`状态。
- `rotateIfNeeded`返回existing identity或missing expectation。
- Final append按expectation选择non-create open或exclusive create。
- Existing descriptor执行identity revalidation。
- ENOENT/EEXIST映射为稳定path-drift错误。
- Tests覆盖existing replacement和missing appearance窗口。
- README、SECURITY、protocol、architecture和extension docs同步final append gate。

## Phase548 加固

Phase548让existing non-create open与missing O_EXCL create都从transaction parent anchor解析current basename。ENOENT/EEXIST和existing identity error保持；actual procfd path不进入public error或report。

## Phase552 后续加固

Phase552继续把`missing` expectation作为本次exclusive creation authority。只有O_EXCL创建从0 bytes开始且record尚未成功提交时，runtime才可能清理same empty entry；`existing` expectation即使size为0也不会被删除。Unexpected appearance、replacement和public error contract保持。
