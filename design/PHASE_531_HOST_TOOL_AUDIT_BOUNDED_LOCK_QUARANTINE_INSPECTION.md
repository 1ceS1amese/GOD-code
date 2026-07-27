# Phase531：Host tool audit bounded lock quarantine inspection

## 背景

Phase530在清理事务无法安全恢复或无法删除隔离owner file时保留`residual_quarantine_path`。这些残留可能表示提交前恢复失败、提交后owner residue，或same-user进程在相同前缀下创建的未知对象。直接提供统一删除或恢复动作会混淆不同状态，因此Phase531先建立受限、no-follow、只读的观察边界。

新增命令：

```text
god-code audit inspect-lock-quarantines [--json]
```

该命令不会恢复、rename、unlink、rmdir或修改任何quarantine entry。

## 命名范围

Runtime quarantine prefix继续由configured absolute audit path派生：

```text
<derived-lock-path>.cleanup-
```

Inspector只接受prefix后恰好六个ASCII alphanumeric字符的entry，匹配Node.js `mkdtemp`生成形状。相似长名称、额外separator或任意同目录对象不会进入结果。

## 资源预算

- 最多读取OS temp directory中的4096个entry。
- 最多返回128个匹配quarantine结果。
- 达到scan预算时设置`scan_truncated: true`。
- 匹配项超过输出预算时设置`result_truncated: true`。
- Truncation返回warning，不把局部结果解释为完整无残留结论。

`matched_entry_count`表示受检scan窗口内观察到的匹配数；scan已截断时不代表temp directory中的全局总数。

## 布局分类

Directory candidate按root与嵌套`lock`的精确entry集合分类：

### `owner_only`

```text
quarantine/
  owner.json
```

对应Phase530已经删除旧lock directory、但隔离owner file或quarantine root未能清除的提交后residue。

### `lock_with_owner`

```text
quarantine/
  lock/
    owner.json
```

对应lock directory已进入quarantine、owner尚未被移出的提交前状态。

### `lock_and_owner`

```text
quarantine/
  owner.json
  lock/
```

对应owner已经移出、quarantined lock directory仍为空目录的提交前状态。

### `empty`

Quarantine root为空。该状态可能来自初始化或外部清理残留，但本阶段不自动删除。

### `unknown`

任何其他entry组合、嵌套lock非目录、内容竞态或检查不确定状态。Unknown绝不升级为恢复或删除候选。

Root本身为regular file、symbolic link或other时只报告entry type，不跟随内容。

## Inspection Contract

`inspectJsonlAuditLockQuarantines`：

1. 计算derived lock path与quarantine prefix。
2. 以固定scan预算读取同一OS temp directory。
3. 只保留精确六字符suffix的名称并稳定排序。
4. 对每个candidate执行lstat，不跟随symlink。
5. Directory candidate捕获root dev/ino和entry集合。
6. Bounded no-follow检查root owner metadata。
7. 若存在嵌套`lock`，分类其entry type；directory时读取entry集合和bounded owner metadata。
8. 再次lstat root/nested directory并比较dev/ino与entry集合。
9. 任何replacement、disappearance或内容集合漂移设置`state_changed`并降级为`unknown`。

Owner token只在TS内部inspection结果中保留。CLI只输出domain-separated 32字符fingerprint、PID和canonical acquired time。

## CLI Report

Summary字段：

- configured file与derived coordination lock path；
- quarantine prefix；
- scanned/matched entry count；
- scan/result limit；
- scan/result truncation状态。

每个entry报告：

- quarantine path、existence、entry type与age；
- layout与root/nested entry count；
- nested lock entry type；
- root/nested owner metadata status；
- selected owner location、PID、acquired time与fingerprint；
- `state_changed`或non-secret `inspection_error_code`。

No residue且scan完整时返回OK。任何residue、truncation、unknown/non-directory、invalid owner或inspection drift返回WARN，但只读诊断本身仍保持`ok: true`。Invalid audit config返回error；disabled persistence返回skipped warning。

## Tests

- `owner_only`、`lock_with_owner`、`lock_and_owner`、`empty`和`unknown`稳定分类。
- Regular-file blocker只报告type且保持内容。
- 非六字符suffix对象被忽略。
- Symlink quarantine不跟随，victim内容保持。
- 129个匹配项只返回128个并设置`result_truncated`，第129项仍存在。
- CLI输出owner fingerprint但不包含UUID token。
- Disabled persistence不扫描temp directory。
- Built CLI integration验证真实JSON route和只读不变性。

## 边界

- 本阶段不恢复`lock_with_owner`或`lock_and_owner`。
- 本阶段不删除`owner_only`、`empty`或unknown entry。
- Age、PID、layout和valid metadata都不是liveness proof或mutation authority。
- Scan预算意味着结果可能不完整；truncated报告不能用于断言不存在其他residue。
- Same-user adversary仍可在检查前后修改temp namespace；命令通过identity/content revalidation暴露drift，但不是内核snapshot。
- 不扫描其他user namespace、其他audit path prefix或任意用户目录。

## 验收标准

- Command严格只读且限定derived exact prefix。
- Scan与结果数量均有固定预算。
- Root和nested lock均不跟随symlink。
- 五类layout和uncertain-state降级可重复验证。
- CLI不泄露owner token或任意owner JSON原文。
- Phase530 cleanup与runtime acquisition/release行为保持不变。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增quarantine prefix helper、inspection types、layout classifier和bounded scanner。
- 新增`audit inspect-lock-quarantines`human/JSON CLI。
- 新增scan/result truncation、state drift和non-secret error projection。
- Tests覆盖三种Phase530 residue layout、empty/unknown/blocker、symlink与result cap。
- README、SECURITY、protocol、architecture、internal design、project plan和extension docs同步Phase531边界。

## Phase564 后续加固

Phase564补齐本阶段只限制parent namespace、但selected quarantine内部仍可能无界读取的缺口。Root与nested `lock`现在各由open descriptor执行2-entry stream scan加1个sentinel，并公开独立scan count/limit/truncated；exact count只在not-truncated时存在。任一child scan truncated都分类为`unknown`，不选择owner或生成empty fingerprint，overflow names和total不进入CLI。

## Phase568 后续加固

Phase568在bounded initial/final scans之外增加stable authority闭包。Layout分类后只重新读取唯一selected root/nested owner，并比较initial/final path、status、device/inode和canonical metadata；owner reread后再次要求root及参与layout的nested directory匹配open-time full generation。Owner原地改写、basename replacement或directory generation drift固定为`stateChanged`/`unknown`且无owner fingerprint。Empty branch改由strict exact-empty generation opener生成fingerprint；Phase531字段与scan预算不变。

## Phase570 后续加固

Phase570让owner-bearing quarantine在root/optional nested terminal generation gates之后再次读取layout-selected owner，并比较完整file generation与canonical metadata。Terminal gate期间发生的persistent owner rewrite现在固定撤销layout/owner authority；Phase531 root/nested bounded scan预算、empty branch和public projection保持。

## Phase571 后续加固

Phase571让shared quarantine inspector在stable owner-bearing result上发布Host-local candidate-bound `ownerFingerprint`。Material绑定absolute quarantine path、layout、owner location、root/optional nested full generations以及terminal owner generation/metadata；direct与bounded list对同一candidate必须投影相同值，不同path/layout或copied candidate得到不同值。CLI仍使用既有`owner_fingerprint`字段，empty branch及Phase531 scan/result预算不变。
