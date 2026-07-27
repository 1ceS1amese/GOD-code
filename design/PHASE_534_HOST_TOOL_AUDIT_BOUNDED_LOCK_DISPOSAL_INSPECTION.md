# Phase534：Host tool audit bounded lock disposal inspection

## 背景

Phase532在删除valid `owner_only` quarantine时，会先把`owner.json`隔离到0700 private disposal root：

```text
<derived-lock-path>.cleanup-<quarantine-id>.dispose-<disposal-id>
```

正常路径会在提交后删除owner和disposal root；若unlink或rmdir失败，CLI只在当次执行中返回`residual_disposal_path`。Phase531只扫描exact quarantine namespace，后续命令无法重新发现disposal residue。

Phase534新增：

```text
god-code audit inspect-lock-disposals [--json]
```

该命令只读、有限预算地重新发现disposal residue，并关联其源quarantine当前状态。

## Namespace Contract

Runtime从当前configured audit file重新派生coordination lock path，并只接受以下exact basename：

```text
<lock-basename>.cleanup-<qid>.dispose-<did>
```

其中：

- `<qid>`必须为六字符ASCII alphanumeric quarantine ID；
- `<did>`必须为六字符ASCII alphanumeric disposal ID；
- marker必须严格为`.dispose-`；
- 额外前缀、后缀、短ID、长ID或非ASCII字符全部忽略。

CLI不接受任意扫描目录或filesystem path。

## Bounded Scan

Scanner复用lock temp parent directory，但不做无界枚举：

- 最多读取4096个directory entries；
- 最多返回128个matched disposal results；
- `scan_truncated`表示目录扫描预算耗尽；
- `result_truncated`表示matched结果超过输出预算；
- matched entries按basename排序后输出。

Truncation只产生warning，不触发mutation或扩大扫描范围。

## Disposal Layout

Directory disposal按root exact entry set分类：

```text
owner_only:
  disposal/
    owner.json

empty:
  disposal/

unknown:
  disposal/
    <any other entry set>
```

Regular file、symbolic link和other blocker只报告entry type，不跟随目标。

对于directory candidate，inspector：

1. no-follow lstat并捕获root dev/ino；
2. 读取并排序root entry set；
3. 使用Phase529的4096-byte bounded owner parser检查root owner；
4. 再次lstat/readdir并要求identity与entry set不变；
5. replacement、disappearance或内容漂移统一报告`state_changed`并降级为`unknown`。

只有exact `owner_only`且metadata valid时才向CLI投影owner fingerprint、PID和canonical acquired time。UUID token和owner JSON原文不输出。

## Source Quarantine Correlation

每个disposal name携带其source quarantine ID。Inspector重新派生：

```text
<derived-lock-path>.cleanup-<qid>
```

并复用Phase531 direct quarantine inspection，报告：

- source quarantine path；
- existence与entry type；
- `owner_only`、`lock_with_owner`、`lock_and_owner`、`empty`或`unknown` layout；
- state drift或inspection error。

Source quarantine absent可能与Phase532 post-commit residue一致，但不是删除授权。Source存在、missing metadata或unknown layout同样只作为operator证据。

## CLI Output

Summary包含：

- coordination lock path；
- disposal namespace prefix；
- scanned/matched/result counts与固定预算；
- truncation flags。

每项包含：

- quarantine ID与source quarantine状态；
- disposal ID/path、entry type、age和layout；
- root entry count与owner metadata status；
- owner PID、acquired time和32字符fingerprint；
- state change与inspection error。

存在任何residue时返回`ok: true`与warning。Invalid config或扫描失败返回error。Persistence disabled时不访问filesystem并返回skipped warning。

## Safety

- Command不rename、unlink、rmdir、chmod或创建任何entry。
- Command不读取或修改audit target。
- Scanner不跟随disposal或source quarantine symbolic link。
- PID、age、source absence和valid metadata均不构成cleanup authority。
- Unknown/non-directory entry保留原状。
- Human/JSON输出不包含owner token。

## Tests

- Exact valid owner-only disposal被识别并输出fingerprint而非token。
- Empty、unknown、regular file和symbolic link被稳定分类且保持不变。
- Invalid namespace name被忽略。
- Source quarantine absent与existing layout均被关联报告。
- 129个matched entries触发128-result truncation。
- Disabled persistence不扫描filesystem。
- Built CLI integration验证synthetic disposal discovery、source absence和non-secret projection。

## 边界

- 本阶段不删除owner-only disposal residue。
- 本阶段不恢复owner到source quarantine或coordination lock。
- 本阶段不扫描Phase530/Phase533之外的任意temp namespace。
- 本阶段不根据PID、age或source absence判断stale。
- 后续阶段可在exact ID selection、source state和owner fingerprint确认基础上增加guarded disposal cleanup。

## 验收标准

- Scanner只匹配当前audit path派生的exact disposal namespace。
- Scan和result预算均有固定上限及truncation报告。
- Directory classification绑定root identity与entry set。
- Source quarantine correlation复用Phase531 no-follow inspection。
- CLI不输出owner UUID token或raw metadata。
- Filesystem entry在inspection前后保持未修改。
- Phase530至Phase533行为与接口保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增disposal prefix/path helper和exact qid/did name parser。
- 新增4096-entry/128-result bounded scanner与direct disposal inspection。
- 新增root identity/content revalidation、三类layout和source quarantine correlation。
- 新增`audit inspect-lock-disposals` human/JSON CLI与disabled/config error路径。
- Tests覆盖valid owner-only、source correlation、empty、unknown、blocker、symlink、invalid name和result truncation。
- Integration验证built CLI discovery、source absence、fingerprint projection和owner token suppression。
- README、SECURITY、protocol、architecture、internal design、project plan和extension docs同步Phase534边界。

## Phase564 后续加固

Phase564补齐本阶段selected disposal root的child budget。Root由open descriptor执行2-entry stream scan加1个sentinel，并投影scan count/limit/truncated；exact root count只在not-truncated时存在。Truncated disposal固定`unknown`且无owner或empty fingerprint authority，source quarantine correlation继承同一bounded quarantine inspection，child names和overflow total不输出。

## Phase568 后续加固

Phase568在stable owner-only disposal发布authority前增加selected owner final reread，并要求initial/final path、status、device/inode和canonical metadata一致；owner reread后root directory必须继续匹配open-time full generation。原地owner改写、basename replacement或child generation drift统一为`stateChanged`/`unknown`且无fingerprint。Empty branch使用strict exact-empty generation opener；source quarantine correlation、scan预算和字段保持。

## Phase569 后续加固

Phase569补齐source quarantine只在disposal observation起点检查一次的跨路径缺口。Initially missing source在owner-only或empty fingerprint返回前再次执行no-follow `lstat`；late present entry更新source existence/type/state-changed，将disposal降级unknown并撤销fingerprint。Late source内部不执行bounded scan，Phase534 parent/result预算、selected disposal scan字段与non-secret contract保持。

## Phase570 后续加固

Phase570在owner-only disposal的terminal source-absence check之后重新检查selected owner full generation与canonical metadata。Source仍missing但owner在source gate期间改变时，disposal同样降级unknown并撤销fingerprint；empty disposal、source projection、selected root scan预算和non-secret字段保持。

## Phase571 后续加固

Phase571让stable owner-only disposal的Host-local fingerprint同时绑定disposal domain、absolute disposal path、root/owner generations、canonical metadata以及derived source quarantine absolute path的confirmed-missing marker。Direct/list对同一candidate保持一致，其他qid/did/path或copied-owner replacement得到不同值；source-present/uncertain、empty和unknown branch仍无owner fingerprint，Phase534 bounded scan与public projection不变。
