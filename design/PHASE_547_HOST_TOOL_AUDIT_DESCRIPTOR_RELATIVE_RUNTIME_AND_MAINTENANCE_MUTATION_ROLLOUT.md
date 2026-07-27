# Phase547：Host tool audit descriptor-relative runtime and maintenance mutation rollout

## 背景

Phase546建立了feature-probed directory mutation capability，并完成main residual lock cleanup和owner-only quarantine cleanup两个private transaction纵向切片。Audit lock namespace中仍有以下direct path mutation：

- runtime coordination lock mkdir、owner creation、release unlink/rmdir和failed acquisition cleanup；
- empty quarantine rmdir；
- owner-only disposal owner unlink与root rmdir；
- empty disposal rmdir；
- quarantine recovery lock reservation mkdir、owner transfer/restore、reservation rollback和old quarantine contraction。

这些对象已经由Phase539至Phase544持有directory/owner descriptors和detachment proof，但parent lookup仍未复用Phase546 adapter。Phase547完成audit lock maintenance范围内的rollout；audit JSONL generation rotation属于audit file transaction，保留为独立后续阶段。

## Shared Parent Anchor Contract

每个transaction在mutation前pin selected entry的immediate parent directory：

- parent opener使用no-follow `O_DIRECTORY`；
- shared temp parent可能被其他process持续修改，因此只绑定directory object device/inode，不要求ctime稳定；
- parent handle从首次mutation跨到success、rollback、residual或error终止；
- Linux procfd capability把single child lookup固定到该handle；
- path fallback在每次operation前重新验证logical parent path仍指向同一handle object。

Parent handle不能替代selected root/nested/owner handles；leaf identity和post-syscall detachment proof继续独立执行。

## Runtime Lock Lifecycle

Acquisition sequence改为：

1. pin lock parent；
2. descriptor-relative/fallback mkdir exact lock basename；
3. 保留actual mutation path与logical lock path；
4. 从actual path打开reservation directory，再验证logical path绑定；
5. 通过lock directory anchor解析`owner.json`，执行O_EXCL/no-follow owner creation；
6. owner、lock directory和parent三个handles共同转移给runtime lock object。

Release通过lock directory anchor unlink owner，通过parent anchor rmdir lock；两次mutation继续执行Phase544 detachment proof。`abandon()`关闭三handles但不修改disk state。

Failed acquisition cleanup复用同一anchors。若mkdir成功但reservation directory从未成功pin，不删除不确定entry；一旦directory已pin，只删除descriptor-bound owner和exact-empty reservation。

## Empty And Disposal Cleanup

- Empty quarantine：selected empty directory handle + parent handle；rmdir使用parent anchor。
- Owner-only disposal：owner unlink使用selected disposal directory anchor，root rmdir使用parent anchor。
- Empty disposal：selected empty directory handle + parent handle；rmdir使用parent anchor。

Fingerprints、source-quarantine absence、owner unlink commit point、post-commit residual和existing error mapping保持。

## Quarantine Recovery

Recovery transaction增加shared parent handle：

- lock reservation mkdir通过parent anchor并从actual mutation path pin；
- owner transfer从layout-selected quarantine/nested directory anchor rename到recovered lock anchor；
- rollback owner restore执行相反的descriptor-relative rename；
- rollback reservation rmdir通过parent anchor；
- post-commit nested `lock` rmdir通过quarantine-root anchor；
- final quarantine-root rmdir通过parent anchor。

Candidate root、nested lock、owner和reservation handles继续保持Phase541/542 graph；commit point与`residual_lock_path`、`residual_quarantine_path`不变。

## Failure Semantics

- Procfd unavailable继续使用validated path fallback。
- Parent descriptor mismatch fail closed，不把operation重定向到current replacement parent。
- Exact mkdir返回EEXIST继续表示coordination entry已存在；不覆盖existing blocker。
- Reservation在pinning前发生uncertainty时保留，不执行unbound rmdir。
- Descriptor-relative child lookup不提供leaf compare-and-delete；所有owner/directory postconditions保留。
- Unknown entries、moved originals和replacement不递归搜索或删除。
- Handle close failure遵循既有runtime/cleanup/recovery传播边界。

## Tests

- Runtime acquisition mkdir和owner creation使用descriptor-relative paths。
- Runtime release owner unlink和lock rmdir使用lock/parent anchors。
- Runtime release wrong-object fake-success tests适配procfd path并继续拒绝。
- Empty quarantine/disposal rmdir使用parent anchor；wrong-object test继续拒绝。
- Owner-only disposal unlink/rmdir使用selected root/parent anchors；wrong-object owner unlink仍不commit。
- Recovery reservation mkdir、owner transfer/rollback和post-commit contraction使用descriptor-relative paths。
- Fallback resolver与Phase546 private transaction tests继续通过。
- CLI/report/JSON-RPC contract不变。
- TypeScript、Python、built integration和CLI smoke全量回归通过。

## 边界

- Audit file current/`.1` rotation仍使用独立safe-path and parent identity transaction，不在本阶段改写。
- 不增加native addon、helper process、FFI、environment flag或安装依赖。
- 不新增cross-process liveness判断、automatic stale cleanup或force delete。
- 不改变lock path hash、owner schema、fingerprint、quarantine/disposal namespace。
- Windows和procfs-unavailable平台保持path fallback；不声明kernel-level dirfd支持。

## 验收标准

- Audit lock maintenance范围内除audit file rotation外不再直接调用path-based mkdir/rename/unlink/rmdir。
- Runtime lock持有parent、directory和owner三handles，release/abandon/failed acquisition所有路径关闭。
- Empty/disposal/recovery transaction持有并关闭immediate parent handle。
- Recovery actual reservation path先pin original directory，再验证logical path。
- Existing commit、rollback、residual和CLI contracts保持。
- Wrong-object success仍由detachment proof拒绝，不出现虚假removed/recovered结果。
- 全量统一验收通过且无FileHandle GC warning、audit temp residue或workspace临时补丁文件。

## 实现结果

- `jsonlAuditDirectoryMutation.ts`新增exact single-entry directory creation helper；与既有temporary-root、rename、unlink和rmdir helper共享entry-name validation、Linux procfd identity probe及cross-platform path fallback。
- Runtime acquisition现在先pin lock parent，通过parent anchor创建exact reservation，再从actual mutation path打开lock directory；`owner.json`通过lock-directory anchor执行O_EXCL/no-follow creation。成功holder持续持有parent、lock-directory和owner-file三个handles。
- Runtime release通过lock-directory anchor unlink owner、通过parent anchor rmdir lock，并继续执行Phase544 detachment proof；`abandon()`和failed acquisition覆盖三handle关闭。Reservation尚未成功pin时不会执行unbound cleanup。
- Empty quarantine、owner-only disposal和empty disposal cleanup均新增immediate-parent binding；owner unlink使用selected disposal root anchor，root removal使用parent anchor，原fingerprint、source-absence、commit和residual语义保持。
- Quarantine recovery通过parent anchor创建并pin reservation，从layout-selected directory anchor转移owner；rollback执行反向descriptor-relative rename并删除exact reservation，commit后通过quarantine-root/parent anchors依次收缩nested `lock`与quarantine root。
- Audit lock namespace内的runtime、cleanup、disposal和recovery mutation不再直接调用path-based mkdir/rename/unlink/rmdir；仅audit file parent creation与current/`.1` generation rotation继续使用其独立file transaction。
- 新增六项测试，覆盖exact directory creation、runtime owner creation/release、owner-only disposal、empty quarantine/disposal、successful recovery和recovery rollback的procfd paths；四项既有wrong-object fake-success测试已适配descriptor-relative targets并继续拒绝虚假成功。
- 定向audit回归通过：`audit.test.ts` 108项、`cliAudit.test.ts` 45项，共153项；TypeScript build通过。
- 统一验收通过：Python 422项；TypeScript 43个test files、667项；TypeScript build、built CLI integration和CLI smoke全部通过。
- `/tmp`下无`god-code-audit-*`临时残留，workspace无`.tmp`、`.bak`、`.orig`或`.rej`文件，也没有FileHandle GC warning。

## Phase548 后续

Phase548把Phase547明确保留的audit generation transaction接入同一adapter。Current open/O_EXCL create、rotated unlink、current rename及full parent sync现在都绑定audit file immediate parent；audit模块仅剩recursive parent-chain bootstrap仍使用path-based mkdir。

## Phase549 后续

Phase549把最后的recursive parent-chain bootstrap拆为nearest-existing descriptor起点的validated single-entry loop。Audit runtime、maintenance、generation和parent bootstrap namespace mutation至此都统一经过descriptor-relative或validated fallback capability；Node缺少atomic mkdir-and-open与leaf compare primitive的既有边界继续由postcondition和可信目录ownership约束。

## Phase550 后续

Phase550保持本阶段owner descriptor-relative O_EXCL create路径，但把creation handle在content write前交给outer acquisition。若metadata persistence失败，cleanup继续从pinned lock-directory anchor unlink selected basename，并使用pending owner descriptor完成post-unlink detachment proof；fallback和public contracts不变。

## Phase564 后续

Phase564让descriptor-relative active-lock与maintenance mutation adapters共享同一个bounded child-set gate。Scanner从open directory handle解析read path，最多保留2个names并读取一个sentinel；acquire/release、failed acquisition cleanup、quarantine recovery及owner/empty cleanup只在not-truncated exact set时进入single-child mutation。Phase547 procfd/fallback capability和postcondition proof保持。
