# Phase530：Host tool audit guarded residual lock cleanup

## 背景

Phase527-Phase529已经提供same-user跨进程锁、只读状态检查、bounded owner metadata和release identity binding，但进程崩溃后仍可能留下valid lock directory。仅凭mtime、PID或metadata valid状态无法证明holder已经死亡，因此不能自动清理，也不能提供无确认的force unlock。

Phase530增加显式运维命令：

```text
god-code audit cleanup-lock [--dry-run|--yes --expect-owner <fingerprint>] [--json]
```

该命令默认dry-run。真实删除必须同时提供`--yes`和本次dry-run展示的owner fingerprint。

## 目标

- 默认只读，不因执行命令本身删除lock。
- 不输出完整UUID owner token。
- 不以PID、age或timestamp作为删除授权。
- 删除前绑定lock directory dev/ino、owner file dev/ino、owner token和single-entry invariant。
- 通过同一temp parent下的私有quarantine降低检查后路径替换导致误删replacement的风险。
- 竞态或未知entry一律拒绝，保留可诊断状态。

## CLI 契约

Dry-run：

```text
god-code audit cleanup-lock --json
```

对valid单一owner lock返回：

- lock path、entry type和owner metadata status；
- PID与canonical acquired time，仅用于观测；
- 32字符lowercase SHA-256 owner fingerprint；
- `dry_run: true`、`confirmation_required: true`、`removed: false`；
- `liveness_verified: false`。

真实执行：

```text
god-code audit cleanup-lock --yes --expect-owner <fingerprint> --json
```

`--dry-run`与`--yes`互斥；`--expect-owner`必须与`--yes`同时出现；fingerprint必须为32个lowercase hex字符。缺少确认属于CLI usage error。配置disabled/invalid、非目录blocker、missing/invalid metadata、额外目录entry或fingerprint mismatch属于安全拒绝并返回失败报告。

## Fingerprint

Runtime owner token仍为UUID v4。CLI fingerprint定义为：

```text
SHA-256("god-code-audit-lock-owner\\0" || owner_token)[0:32]
```

Fingerprint是竞态确认值，不是authentication secret，也不证明process liveness。Domain separator避免与其他直接token hash用途混淆；128-bit截断用于可复制的operator confirmation。

## 清理事务

`cleanupJsonlAuditFileLock`按以下顺序执行：

1. lstat lock path，要求directory并捕获dev/ino。
2. bounded no-follow读取owner metadata，捕获owner file dev/ino与完整token。
3. 要求目录只包含`owner.json`，并验证expected fingerprint。
4. 创建与lock同parent filesystem的0700 private quarantine root。
5. 在rename前再次验证directory identity、owner identity、token和single-entry invariant。
6. 将lock directory rename到quarantine root并再次验证相同candidate。
7. 将owner file移出quarantined lock directory，重新绑定owner identity与token。
8. 要求quarantined lock directory为空且identity不变，然后rmdir该目录。
9. 最后删除隔离的owner file和空quarantine root。

在第8步提交前发生异常时，helper仅做best-effort identity-aware restore；无法安全恢复时保留quarantine并返回错误，不递归删除未知对象。提交后若quarantine residue无法安全删除，lock removal仍报告成功，但返回`residual_quarantine_path` warning供人工检查。

## 竞态语义

- Dry-run与`--yes`之间lock消失、token变化或directory replacement时，执行阶段重新检查并拒绝旧fingerprint。
- 即使replacement directory复制相同owner JSON，也因directory dev/ino或owner file dev/ino变化而拒绝。
- Quarantine rename后原lock path会短暂变为可获取；新的cooperative writer可以建立新lock，清理流程只处理已隔离的旧candidate。
- 被清理的真实live holder之后调用release会因原directory identity消失而失败。因此命令明确声明可能中断active writer。
- Node.js用户态检查不是内核事务；same-user恶意进程仍可制造竞态，结果优先为拒绝或保留quarantine，而不是自动扩大删除范围。

## 测试

- Owner fingerprint格式稳定且不包含UUID token。
- 正确fingerprint删除lock，但不修改audit target内容。
- 错误fingerprint、missing metadata和非目录blocker均保留原对象。
- Directory replacement即使复制metadata也在quarantine前被identity revalidation拒绝。
- CLI默认dry-run并返回fingerprint，不泄露token。
- CLI错误fingerprint保留lock；正确`--yes --expect-owner`删除lock。
- CLI拒绝额外目录entry、disabled persistence和缺失确认参数。
- Python integration以真实built CLI验证status code、JSON字段和实际lock deletion。

## 边界

- 本阶段不探测PID是否存活，不读取`/proc`，不发送signal。
- 本阶段不按age自动判定stale，不提供后台reaper或启动时自动清理。
- Fingerprint不是权限凭证；same-user temp namespace仍依赖OS account与目录ACL边界。
- Command只删除derived coordination lock，不读取、写入、chmod或轮转audit target。
- Missing/invalid owner metadata不能通过`--yes`绕过；未知对象必须人工处理。

## 验收标准

- 无flag调用保持dry-run。
- 真实删除必须同时有`--yes`与exact owner fingerprint。
- Human/JSON输出均不包含owner token。
- Cleanup前后绑定directory、owner和token identity。
- Replacement、extra entry、invalid metadata与confirmation mismatch不会被删除。
- Runtime acquisition/release和`audit inspect-path`既有语义保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增owner fingerprint helper和guarded cleanup transaction。
- 新增`audit cleanup-lock`human/JSON report与严格flag parser。
- Dry-run投影PID/time/fingerprint并明确`liveness_verified: false`。
- Destructive path使用private quarantine与提交前restore策略。
- 单元测试和CLI integration覆盖确认、拒绝、竞态及token non-disclosure。

## Phase540 加固

Phase540为本阶段的selected lock directory增加持续打开的no-follow `O_DIRECTORY` descriptor。Handle从candidate selection跨越quarantine rename、owner isolation、old directory rmdir和rollback，并在top-level `finally`关闭；因此复制相同owner metadata的path replacement不能再仅靠复用path metadata冒充原candidate。CLI与owner fingerprint contract不变。

## Phase542 加固

Phase542为cleanup candidate增加pinned `owner.json` handle。Owner descriptor跨lock quarantine rename、owner isolation、rollback和最终unlink保持有效，并在top-level `finally`关闭；仅复制完全相同owner JSON的file replacement也会因path/descriptor mismatch被拒绝。

## Phase545 加固

Phase545为本阶段transaction-owned private quarantine root增加creation-time directory descriptor。Root从`mkdtemp`后跨`beforeQuarantine`、lock rename、owner isolation、rollback和final contraction保持绑定，并按exact entry set验证每个状态；final rmdir还要求original descriptor detachment proof。Wrapper replacement在commit前拒绝，commit后收缩失败沿用`residual_quarantine_path`，CLI与fingerprint contract不变。

## Phase546 加固

Phase546为private quarantine transaction增加parent descriptor与shared directory mutation adapter。Linux验证procfd与open directory object后，通过descriptor-relative child paths执行root创建、lock/owner rename、rollback、unlink和rmdir；fallback继续执行logical path/descriptor gate。Selected candidate、fingerprint、commit point和`residual_quarantine_path`保持不变。

## Phase565 加固

Phase565收紧本阶段dry-run fingerprint的签发条件。Active lock inspection现在必须证明same-directory initial/final bounded scans一致、scan未截断、directory path持续绑定，并通过跨final scan保持的owner descriptor证明path/object/content连续性；state drift、inspection error、truncation或nonexclusive set在fingerprint生成前拒绝。Destructive cleanup仍执行本阶段及Phase540/542/545/546/564定义的fresh transaction revalidation，confirmation flags、fingerprint算法和commit/residual语义不变。

## Phase566 加固

Phase566要求Phase565 valid owner snapshot成功后再次验证logical lock leaf仍绑定original directory descriptor。Owner path经指回renamed original的intermediate symlink仍能命中同一file时，terminal directory gate会识别lock leaf已不是directory并在dry-run fingerprint生成前拒绝。Destructive transaction的fresh selection/revalidation、confirmation flags、fingerprint算法、commit point与residual contract保持不变。

## Phase567 加固

Phase567进一步要求dry-run active inspection的两个directory gates匹配open-time full generation。Final scan后在owner snapshot期间新增child或替换owner basename会改变directory ctime，即使directory仍是同一device/inode object，也会在fingerprint生成前进入state changed。Destructive cleanup保留object-oriented matcher，以允许transaction自身rename/unlink导致的合法ctime变化；fresh exact-entry revalidation与commit/residual语义不变。

## Phase570 加固

Phase570在dry-run的terminal directory gate之后重新检查owner full file generation与canonical metadata，防止该gate期间的owner原地改写继续签发Phase530 fingerprint。Drift时confirmation保持false且不进入mutation；真实cleanup仍执行原有pinned owner transaction、fresh entry-set验证与commit/residual流程。

## Phase571 加固

Phase571废止本阶段token-only fingerprint作为authoritative confirmation。Active dry-run现在把domain、absolute lock path、root full generation、terminal owner full generation与canonical metadata编码为candidate-bound 32-hex value；cleanup从fresh pinned lock重算同一material，并在private quarantine创建或任何rename/unlink/rmdir前比较。Dry-run后把original移走并在原路径复制相同owner JSON的replacement会得到不同fingerprint，旧值只拒绝且保留original与replacement。CLI flag/field格式及后续Phase530 transaction、commit、rollback和residual contract保持。

## Phase572 加固

Phase572不再让active cleanup的preflight match直接写入`owner_fingerprint_matches: true`和`coordination_lock_owner_fingerprint`。Positive evidence只在`cleanupJsonlAuditFileLock(...)`返回`existed: true`且携带exact expected fingerprint后发布；runtime rejection或selection前missing均省略这两个字段。Preflight wrong fingerprint仍显式返回`false`，Phase530 transaction、commit、rollback和residual语义保持。

## Phase573 加固

Phase573在active cleanup runtime existing branch明确设置`coordination_lock_exists: false`。Phase530 commit已经删除原active basename；即使private quarantine wrapper contraction失败并返回`residual_quarantine_path`，该residual也不是active lock path。Stable success与residual WARN现在都与`removed: true`一致，dry-run、preflight refusal、fingerprint、rollback和unknown-object preservation保持。

## Phase575 投影边界修正

Phase575在active cleanup runtime candidate missing时保留`coordination_lock_exists: false`与`removed: false`，但撤销preflight entry type、bounded scan、owner metadata、state/error及confirmation fields。Missing result不支持已消失candidate的旧structure；Phase530 existing transaction、commit、rollback与residual semantics保持。

## Phase576 descriptor finalization 加固

Phase576让active cleanup在candidate-existing result形成后使用non-throwing all-settled handle finalizer。Stable与private-quarantine residual result都投影`cleanupHandlesClosed`；close failure只追加bounded warning并在CLI返回WARN，不再覆盖Phase530已提交的`removed:true`、fingerprint、selected absence或residual locator。Pre-commit primary error仍优先，missing fast path不新增closure evidence，transaction与commit/rollback语义保持。

## Phase577 rejection lifecycle 加固

Phase577让active candidate fingerprint/validation rejection和Phase530 pre-commit operation rejection都抛出typed maintenance error。Candidate directory close同步throw不再覆盖owner fingerprint mismatch，owner handle仍获得close invocation；operation failure同样投影closed/warning。CLI保持ERROR与primary message，只复用Phase576 lifecycle fields；commit、rollback、residual和missing语义不变。
