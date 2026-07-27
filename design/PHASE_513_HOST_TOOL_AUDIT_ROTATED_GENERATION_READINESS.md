# Phase513 Host Tool Audit Rotated Generation Readiness

## 状态

代码、测试与文档已完成。

## 审计结论

Phase511/512检查current audit target和parent access，但没有检查single rotated generation `<audit>.1`。Rotation实现先执行`fs.rm(rotatedPath,{force:true})`再rename current。若`.1`被预置为目录，non-recursive rm会失败；current path仍可能被inspect-path报告ready，直到首次达到capacity才暴露错误。

## 目标

- 新增共享rotated-entry lstat inspector。
- 报告`.1` resolved path、existence、entry type和replaceability。
- Entry type区分regular file、symbolic link、directory和other。
- Directory entry在runtime rm之前稳定拒绝。
- Directory refusal保持current和`.1`不变。
- Symlink只识别link自身，不跟随target。
- Symlink和其他non-directory entry保持可unlink语义。
- CLI directory entry返回error。
- CLI symlink/other entry返回warning。
- Inspection不删除、替换或读取rotated entry内容。
- 不改变正常single-generation rotation和capacity语义。

## Shared Rotation Inspector

`inspectJsonlAuditRotationPath(filePath)`计算`path.resolve(filePath)+".1"`并执行单次lstat：

- ENOENT：`exists:false, replaceable:true`
- regular file：`entryType:"regular_file", replaceable:true`
- symbolic link：`entryType:"symbolic_link", replaceable:true`
- directory：`entryType:"directory", replaceable:false`
- 其他filesystem object：`entryType:"other", replaceable:true`

Lstat不解析symlink target。Replaceable描述现有runtime non-recursive unlink策略的type边界；实际替换仍需要parent directory write access，由Phase512检查。

## Runtime Boundary

`rotateIfNeeded`在删除`.1`前调用shared inspector。不可替换directory抛出稳定`Rotated audit path must not be a directory.`，不执行rm或rename。Current generation保持原内容，directory entry保持存在，failure沿Phase499返回audit warning。

## CLI Boundary

`AuditPathDetails`新增：

- `rotation_path`
- `rotation_entry_exists`
- `rotation_entry_type`
- `rotation_entry_replaceable`

Directory进入access/path error列表并使report失败。Symlink产生warning，明确未来rotation会替换link entry而不跟随target；other non-directory产生一般replace warning。Regular或missing entry不增加warning。

## No-Mutation Guarantee

CLI inspection只lstat rotated path。它不rm、unlink、rename、open或读取entry；symlink及victim保持不变。Runtime只有真正达到capacity并通过检查后才执行既有replacement。

## 验收标准

- `.1`目录使inspect-path返回error和replaceable false。
- Inspection后`.1`目录与current content保持。
- `.1` symlink返回warn、type symbolic_link和replaceable true。
- Symlink与victim content在inspection后保持。
- Runtime需要rotation且`.1`为目录时稳定拒绝。
- Runtime拒绝后current记录与`.1`目录保持。
- 正常rotation和multi-instance serialization tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增rotation inspection types与shared lstat helper。
- Runtime rotation在rm前验证replaceability。
- CLI path report新增rotation metadata与warning/error语义。
- Tests覆盖CLI directory/symlink no-mutation和runtime directory refusal。
- README、SECURITY、protocol、architecture和extension docs同步rotation readiness边界。

## Phase548 加固

Phase548保留本阶段`.1` type/replaceability projection，但runtime replacement改为从pinned parent anchor unlink selected basename；current rename也从同一anchor执行，并以original current descriptor验证rotated postcondition。Directory refusal与CLI projection不变。

## Phase553 后续加固

Phase553继续使用本阶段type/replaceability projection：directory稳定拒绝；regular、symlink与other entry先作为opaque entry移动到0700 staging directory，commit时unlink staged entry自身，不跟随symlink target。CLI inspect-path schema与no-mutation guarantee不变。

## Phase554 后续加固

Phase554让runtime staging basename绑定absolute audit target hash，并为residue inspector复用同类no-follow entry classification。Selected `previous`只报告type和safe size，不读取regular content或跟随symlink；legacy anonymous staging不推断来源。
