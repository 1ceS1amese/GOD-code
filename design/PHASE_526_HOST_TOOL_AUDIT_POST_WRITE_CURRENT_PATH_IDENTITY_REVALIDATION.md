# Phase526 Host Tool Audit Post-Write Current Path Identity Revalidation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase525在record write前把current path重新绑定到final descriptor，但write、datasync/fsync或parent metadata sync期间仍可能发生entry rename、replacement、disappearance或link-state漂移。Descriptor write目标不会改变，因此record可能进入已经移走的file object，而pipeline仍返回成功。

## 目标

- Record write及配置的durability步骤完成后再次验证current path identity。
- 复用Phase525的no-follow path/type/single-link/dev-ino gate。
- Existing与exclusive-created current使用相同post-write checkpoint。
- Buffered、data和full全部覆盖。
- Stable error为`Audit file changed after record write.`。
- Mismatch阻止record Promise报告成功。
- 明确post-write failure可能已经产生持久record，不承诺回滚。
- 保持Phase522 full parent metadata sync的错误优先级。

## Success-Path Identity Contract

Final append成功现在要求：

1. Pre-write path identity与descriptor一致。
2. Record bytes写入descriptor。
3. Data policy完成datasync；full policy完成file fsync，并在POSIX missing create时完成parent metadata sync。
4. Post-write path identity仍与同一descriptor一致。
5. FileHandle关闭后record Promise才成功。

Full missing create继续先执行Phase522 parent metadata sync，再执行post-write current path gate。这样parent replacement仍返回既有`Audit parent directory changed before metadata sync.`；同一parent内的target replacement则由Phase526报告。

## Failure Semantics

Post-write mismatch抛出：

```text
Audit file changed after record write.
```

该错误与pre-write refusal不同。Record已经进入descriptor，并可能已经经过datasync/fsync；如果current entry随后被移走，record通常保留在moved object中。Host沿既有audit warning路径报告failure，但调用方、运维和重试逻辑必须允许该event已经存在，不能假设重试不会形成重复审计记录。

## Replacement Tests

Existing test在第二次final path inspection前把current rename并创建replacement。第一次inspection是Phase525 pre-write gate；第二次是Phase526 post-write gate。Moved original包含本次marker，replacement内容不变，Promise以post-write error拒绝。

Missing test对buffered、data和full逐一执行同一replacement。每种policy的moved current都包含首条record，replacement保持不变，证明gate运行在对应durability步骤之后且覆盖全部policy。

## 边界

- Gate证明成功返回前current path曾再次解析到written descriptor object。
- Gate之后的外部rename属于record操作完成后的filesystem mutation，不由本次Promise持续监控。
- Post-write check不能回滚descriptor write、datasync、fsync、rotation或parent metadata mutation。
- Cross-process append/capacity serialization仍需要外部locking或single-writer ownership。
- 可信parent ownership和ACL仍是防止恶意高频entry replacement的部署边界。

## 验收标准

- Post-write gate位于所有durability-specific步骤之后。
- Existing与missing current都使用相同descriptor identity。
- Buffered、data和full replacement均稳定拒绝成功返回。
- Stable error准确表达record write已经发生。
- Existing moved file包含新增record，replacement不被写入。
- Missing moved file包含首条record，replacement不被写入。
- Pre-write、parent sync、capacity、rotation和normal append tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- `appendAuditLine`在durability branch后复用`assertAuditFilePathIdentity`。
- 新增`Audit file changed after record write.`稳定错误。
- Tests覆盖existing current和三种durability下的exclusive-created current。
- README、SECURITY、protocol、architecture、internal design、project plan和extension docs同步Phase526边界。

## Phase548 加固

Phase548让current descriptor与parent descriptor共同跨durability步骤保持，随后仍以canonical logical current path执行本阶段post-write gate。Procfd只固定syscall parent resolution，不改变record可能已写入moved object的failure semantics。

## Phase551 后续加固

Phase551在进入本阶段post-write gate之前，为`writeFile` rejection增加bounded rollback。只要write成功并继续执行durability或最终path validation，本阶段“failure可能已经产生完整record且不承诺回滚”的语义保持不变；moved/replaced current导致的post-write rejection仍保留written descriptor内容。
