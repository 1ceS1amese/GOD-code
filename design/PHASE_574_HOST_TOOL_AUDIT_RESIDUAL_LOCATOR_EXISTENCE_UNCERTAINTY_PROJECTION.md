# Phase574：Host tool audit residual locator existence uncertainty projection

## 背景

Phase573修正了active cleanup与owner-only quarantine cleanup把transaction-owned private wrapper residual误映射为原selected path仍存在的问题。继续审计remaining `residual*Path -> *_exists`映射时，只剩两处：

- owner-only disposal cleanup使用`residualDisposalPath !== undefined`设置`disposal_exists`；
- successful quarantine recovery使用`residualQuarantinePath !== undefined`设置`quarantine_exists`。

两类runtime residual path都是cleanup uncertainty locator，不是logical path current-existence proof。Runtime在commit后执行selected directory contraction；若final `rmdir`被wrong-object replacement干扰，original descriptor仍未脱链，因此返回residual path，但logical selected path可能已经missing。Built Phase573产物探针已分别复现：

- owner disposal返回`removed: true`与`residual_disposal_path`，logical disposal path missing，但CLI报告`disposal_exists: true`；
- recovery返回`recovered: true`与`residual_quarantine_path`，logical quarantine path missing，但CLI报告`quarantine_exists: true`。

相反，unexpected child或pre-rmdir failure也可产生同一residual field且logical path仍present。仅凭residual locator无法区分present、missing、replacement或unobserved state，强制投影true会把uncertainty伪装为事实。

## Evidence Contract

1. Residual path表示“该logical cleanup location需要manual inspection”，不证明该path当前存在。
2. Runtime existing result且无residual时，selected owner disposal或recovered quarantine cleanup已完成并证明logical path missing；CLI投影`*_exists: false`。
3. Runtime existing result且有residual时，CLI必须撤销selected `*_exists`字段，不投影true或false。
4. Residual path本身继续保留，human/JSON report仍提供operator inspection locator与WARN。
5. WARN message不得断言root/residue一定present；应描述cleanup未能安全确认。
6. Owner disposal `removed: true`继续表示owner unlink commit已经完成；recovery `recovered: true`继续表示active coordination lock commit已经完成。
7. Recovery rollback-residual branch不在本阶段范围：`recovered: false`加`residual_lock_path`时，runtime已验证owner恢复与quarantine candidate continuity，CLI保留`quarantine_exists: true`和`coordination_lock_exists: true`。
8. Phase572 positive fingerprint与Phase573 stable terminal absence规则保持。

## Covered Commands

- `audit cleanup-lock-disposal <quarantine-id> <disposal-id>`
- `audit recover-lock-quarantine <quarantine-id>`的`recovered: true` residual branch

Empty cleanup没有post-commit residual result；active/owner quarantine private residual已由Phase573与原selected path existence分离，不修改。

## Implementation

两处CLI mapping改为tri-state optional projection：

```text
residual path absent  -> selected exists = false
residual path present -> selected exists = omitted
```

具体为：

- `disposal_exists = residualDisposalPath === undefined ? false : undefined`
- successful recovery的`quarantine_exists = residualQuarantinePath === undefined ? false : undefined`

同时把WARN message从“root/residue could not be removed”收紧为“cleanup could not be safely confirmed”。不新增runtime observation，因为CLI return之后没有reservation可支持race-free current-path truth；omission比post-hoc `lstat`猜测更符合现有fail-closed evidence model。

## Tests

- Owner disposal stable confirmed cleanup继续投影`disposal_exists: false`。
- Owner disposal post-commit present residual：extra child使root保留，report包含residual path但省略`disposal_exists`。
- Owner disposal wrong-object final contraction：logical path missing、detached original保持，report仍包含residual path并省略`disposal_exists`。
- Recovery stable success继续投影`quarantine_exists: false`与`coordination_lock_exists: true`。
- Recovery present residual：nested/root contraction失败且logical quarantine present，report包含residual path但省略`quarantine_exists`。
- Recovery wrong-object final contraction：logical quarantine missing、detached original保持，report包含residual path并省略`quarantine_exists`。
- Human/JSON均不得把residual locator转换为`*_exists: true`，且不泄漏owner token。
- Built smoke覆盖两条command的present/missing residual pair；integration稳定流程保持。

## 接口边界

- 不增加、删除或重命名CLI字段；仅在residual uncertainty branch省略既有optional boolean。
- 不修改runtime exported signatures、result types或residual path字段。
- 不改变owner unlink/recovery commit point、rollback、descriptor detachment或unknown-entry preservation。
- 不增加JSON-RPC、agent event、provider、tool result、transcript或persistent schema字段。

## 验收标准

- Residual path不得再自动产生selected `*_exists: true`。
- Present与missing residual都必须省略existence boolean并保留inspection locator。
- Stable no-residual success仍明确投影false。
- Recovery rollback-residual verified state保持原有true semantics。
- Positive fingerprint、dry-run、mismatch、runtime missing和Phase573 behavior保持。
- Python、TypeScript、build、built integration与CLI smoke全部通过。
- Workspace及`/tmp`无probe、lock、smoke或patch残留，无相关test/engine进程和FileHandle GC warning。

## 实现结果

- Built Phase573产物的两条最小探针分别在owner disposal final root contraction与recovery final quarantine contraction注入wrong-object replacement。两条runtime都返回committed result和residual locator，logical selected path实际missing，但旧CLI仍投影对应`*_exists: true`，确认缺口位于report mapping而非mutation transaction。
- `ts-host/src/cli/audit.ts`将两处mapping改为tri-state optional projection：无residual设置`disposal_exists: false`或`quarantine_exists: false`，有residual设置`undefined`。两条WARN同步改为“cleanup could not be safely confirmed”，不再断言root/residue当前存在；recovery rollback-residual verified branch未改变。
- `cliAudit.test.ts`新增owner disposal与successful recovery各一组present/missing residual测试，共4项。测试验证committed outcome、residual locator保留、human/JSON均省略selected existence、实际filesystem state符合注入结果且owner token不泄漏；CLI audit测试最终为94项。
- Built CLI smoke新增四类编译产物探针，覆盖owner disposal present/missing residual与recovery present/missing residual，验证optional boolean withdrawal、locator、WARN、filesystem state与token non-disclosure。Stable no-residual behavior继续由既有CLI/integration覆盖。
- 统一`tools/check.sh`验收通过：Python 422项；TypeScript 43个test files、830项；TypeScript build、built integration和CLI smoke全部通过。README、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS、SECURITY、protocol及Phase533/535/573历史边界已同步Phase574。
- Source/built artifact静态审计确认不再存在`residual*Path !== undefined -> *_exists`映射；两处tri-state assignment与WARN在compiled CLI中一致。Runtime exports、result types、CLI字段集合、JSON-RPC、agent event、provider、tool result、transcript及persistent schema未改变。
- `run-cli-smoke.sh`语法、Phase574设计链接与current-phase文档范围复核通过；workspace及`/tmp`无Phase574 probe、smoke、integration、`.tmp`、`.bak`、`.orig`或`.rej`残留，无相关test/engine/CLI进程，验收输出无FileHandle GC warning。
