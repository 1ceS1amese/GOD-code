# GOD-code 当前阶段项目推进计划

这份文档记录 GOD-code Phase1-Phase601 的当前状态和后续推进顺序，其中 Phase601 已完成 Host provider log descriptor finalization continuity，Phase601后的final release lifecycle audit也已通过。

它不替代各阶段设计文档；各阶段文档继续记录具体边界和实现细节。这里更关注“现在项目处在什么状态、下一步优先做什么”。

## 1. 当前状态

GOD-code 目前已经是一个可运行、可测试的 AI Coding Agent 架构骨架：

- TS Host 负责 CLI、JSON-RPC 进程管理、工具注册、权限、审计和真实工具执行。
- Python Engine 负责 session、turn loop、prompt 构造、model adapter、provider 边界和 transcript。
- 两边通过 JSON-RPC over stdio 通信。
- 默认仍使用 deterministic `fake` provider，方便本地 smoke 和测试。

当前已完成的主能力：

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| CLI run | 已实现 | `god-code run <prompt>`、`run --json` |
| JSON-RPC | 已实现 | stdio 双向 request / notification |
| Host tools | 已实现 | `Read` / `Edit` / `Bash` / `ListFiles` / `Search` / `Write` |
| 执行边界 | 已实现 | permission、path policy、audit、cancel、Bash cwd 限制 |
| 模型边界 | 已实现 | `PromptBuilder -> ModelRequest -> ModelAdapter`、system prompt builder、token budget manager、summary compaction strategy、prompt injection guard |
| Provider | 已实现骨架 | registry、config、HTTP client 抽象、real adapter、provider retry policy、provider fallback chain、Anthropic Messages provider、Local OpenAI-compatible provider、provider usage budget guard、provider-specific error mapping、provider rate limit policy、local provider daemon lifecycle、local provider model discovery、local provider model pull command、local provider model remove command、local provider model prune command、显式 provider health diagnostics、离线 provider contract tests、provider config inspection |
| OpenAI-compatible | 已实现 | Chat Completions client、Responses provider 基础路径、streaming 基础路径 |
| Transcript | 已实现 | in-memory、JSONL、replay helper、CLI sessions list/replay/timeline/resume/search/cleanup/index/archive/delete |
| Session history management | 基础实现 | `sessions search`、`sessions global-search`、`sessions replay --json`、`sessions timeline --json`、`sessions resume --json`、`sessions cleanup`、`sessions index build/refresh/search`、`sessions archive list/replay/timeline/search/restore/compress/delete`、`sessions delete --yes` |
| REPL | 基础实现 | 单 session、单 running turn、slash commands |
| MCP | 基础实现 | stdio、Streamable HTTP 和 legacy SSE runtime，通过环境变量或配置文件显式启用，支持 `mcp inspect-config`、`mcp inspect-context`、env-backed HTTP auth headers、MCP tool schema 展示、resources / prompts / resource templates 连接诊断、resource read / prompt get / subscribe / update wait / update watch / update loop / completion 诊断、completion candidate 输出、bash/zsh hook script 生成、guarded rc install、显式 MCP context 注入、context 去重/限额/截断和 runtime 错误诊断 |
| Plugin / Skill | 基础实现 | 本地 manifest runtime，支持 `plugins schema`、`plugins validate`、`plugins inspect-config`、`plugins list/inspect`、`plugins install/uninstall/enable/disable/tags`、manifest-only 示例 plugin 包、显式配置入口、本地 registry 和 `node-subprocess` sandbox runtime 基础路径 |
| Diagnostics | 基础实现 | `doctor` / `doctor --json` / `doctor provider-health`、`provider inspect-config`、`provider contract-test`、`tools list/inspect`、`mcp inspect-config`、`mcp inspect-context`、`plugins validate`、`run --json` / `run --json --raw-events` |
| Integration baseline | 基础实现 | CLI 黑盒测试、normalized golden events、transcript contract |
| Open source baseline | 基础实现 | MIT License、社区协作文档、GitHub Issue/PR 模板和包许可证元数据 |
| Config examples | 基础实现 | provider、MCP、plugin / skill、transcript 示例 |

## 2. 当前边界

当前项目仍然是实验性架构骨架，不是完整 AI IDE 产品。

默认保持：

- 默认 provider 是 `fake`。
- 默认 CLI 不自动调用真实 provider HTTP。
- JSON-RPC wire contract 不随意改变。
- 工具执行必须经过 `HostToolRegistry.executeRequest(...)`。
- Python Engine 不直接触碰宿主文件系统或 shell。
- MCP 和 plugin 默认不启用，必须显式配置。

当前暂不完整支持：

- Python Engine 多 session runtime 已在 Phase81 补齐基础实现；Phase96 已补 transcript-level TUI session switcher 基础实现；Phase97 已补 TUI live session switching 基础实现；当前仍不做 session daemon、跨进程 handoff 或同一 session 内多 active turns。
- 多 turn 并发。
- Phase82 已补 Python Engine 内部多工具并发调度基础实现；Phase84 已补 provider-native parallel tool calls 显式 opt-in 基础实现；Phase85 已补 tool dependency graph scheduling 基础实现；Phase394 已补 TS Host batch API，跨 session / 跨 turn 调度仍不在当前范围内。
- 显式交互式权限确认 UI 已在 Phase80 补齐基础实现；当前仍不做完整 TUI、持久 approval daemon、跨命令 approval cache 或长期规则文件。
- TUI 已具备 Phase86-Phase393 基础实现：`god-code tui`、可测试 state/input/renderer/controller、live session 创建/切换/关闭/置顶/重命名/过滤/排序/快捷动作/批量动作/命令面板及其自适应提示链、独立命令模块组、command/live/history/shell/prompt/event 子 reducer、显式 registry 注入的独立 reducer composer、configured reducer、独立 cycle registry、state factory、neighbor adaptive、neighbor legend 与 nested/latest presentation 模块、19 行 re-export-only 兼容 facade、31 模块依赖图契约和共享状态 helper、live session list pane、per-session event buffers、per-session status indicators、per-session unread counters、事件流摘要、最近 history 摘要、compact/debug/focus 渲染、PTY smoke harness 和 transcript session switcher；尚不是完整 TUI。
- system prompt builder 已在 Phase60 补齐基础实现，token budget manager 已在 Phase61 补齐基础实现，summary compaction strategy 已在 Phase62 补齐基础实现，prompt injection guard 已在 Phase63 补齐基础实现；当前不做远程 prompt registry、自动项目扫描、LLM-backed classifier、provider-backed summarization、retrieval 或语义摘要。
- provider billing / 精确 provider tokenizer；provider retry policy 已在 Phase53 补齐，provider fallback chain 已在 Phase54 补齐，context budget / deterministic compaction 已在 Phase56 补齐基础实现，provider usage accounting / budget guard 已在 Phase58 补齐基础实现，provider-specific error mapping 已在 Phase59 补齐基础实现，provider rate limit policy 已在 Phase64 补齐基础实现，本地 token budget manager 已在 Phase61 补齐基础实现。
- Anthropic Messages provider 已在 Phase55 补齐基础实现，Phase84 已补显式 opt-in 的 provider-native 多 tool_use 归一化；暂不支持 Anthropic server-side tools、extended thinking UI、prompt caching 或 provider-managed parallel tool use。
- Local OpenAI-compatible provider 已在 Phase57 补齐基础实现，local provider daemon lifecycle 已在 Phase65 补齐基础实现，local provider model discovery 已在 Phase66 补齐基础实现，local provider model pull command 已在 Phase67 补齐基础实现，local provider model remove command 已在 Phase68 补齐基础实现，local provider model prune command 已在 Phase69 补齐基础实现；暂不做 Ollama-native / llama.cpp-native API、runtime-native prune API 或自动缓存配额管理。
- MCP 后台 daemon / 跨命令持久 resource update event loop、prompt/resource 自动发现注入和 OAuth / token refresh flow。
- Session global transcript search 已在 Phase75 补齐，受限 transcript root discovery diagnostics 已在 Phase76 补齐，discovery-backed global transcript search 已在 Phase77 补齐，短生命周期 transcript watch diagnostics 已在 Phase78 补齐，显式 index watch-refresh diagnostics 已在 Phase79 补齐；当前仍不做后台 daemon、无界自动 root discovery、语义搜索或跨 root mutation。
- Session advanced recovery 已完成 Phase83 基础实现；当前支持 `sessions recover` dry-run / JSON / raw-events workflow，仍不支持 live process restore、历史工具重放、transcript destructive repair 或 Python replay RPC。
- plugin local registry install command 已在 Phase71 补齐，local registry uninstall command 已在 Phase72 补齐，local registry enable/disable command 已在 Phase73 补齐，local registry tags command 已在 Phase74 补齐；仍不做远程 marketplace、下载安装、安装脚本、远程 metadata sync、持久 plugin daemon 和系统级 sandbox runtime。

## 3. 近期推进目标

Phase551 已为audit current的`writeFile(line)` rejection增加bounded rollback。Append前保存same descriptor identity与pre-write size；若write失败后size只增长在本条`lineBytes`范围内，且logical current仍绑定original regular single-link descriptor，runtime会truncate回原size，并按data/full policy同步rollback。Path replacement、size小于原值或增长超过record上界时不猜测、不truncate未知bytes。Rollback helper failure不覆盖original write error；datasync/fsync、parent sync和最终post-write gate failure仍保持“完整record可能已存在”的Phase520/526语义。CLI、JSON-RPC、durability配置与report字段不变，TUI 主体实现范围仍为 Phase86-Phase393。

Phase552 已为missing current的exclusive creation增加pre-commit cleanup。本次transaction只有在拥有`O_CREAT | O_EXCL`创建、initial size为0、record write尚未成功，并且pre-write failure未写入bytes或Phase551已确认rollback回0时，才会从pinned parent unlink exact current entry，再验证logical path missing与original descriptor `nlink === 0`。Full durability在POSIX同步parent deletion metadata。Existing generation、unknown growth、path/parent drift以及成功write后的durability/post-write failure均不会进入删除路径；已完成rotation不反向恢复。CLI、JSON-RPC、report和persistent metadata contracts不变，TUI 主体实现范围仍为 Phase86-Phase393。

Phase553 已把rotation扩展为跨append保持的generation transaction。已有`.1`不再提前unlink，而是先移动到同parent内0700 private staging directory；original current descriptor保持到append结束。Pre-commit failure在Phase552清理new current后按identity把`.1`恢复为current，并把staged previous archive恢复到`.1`。Successful write先完成data/full file durability，再删除staged archive、收缩staging directory，POSIX full最后同步generation parent。Write成功后的durability/commit failure不回滚，previous archive以staging residue保留。CLI、JSON-RPC、inspect-path schema和persistent metadata contracts不变，TUI 主体实现范围仍为 Phase86-Phase393。

Phase554 将runtime staging namespace改为由absolute audit target的SHA-256前32 hex派生的same-parent prefix，使共享parent的不同audit文件不再混用residue namespace。新增`audit inspect-rotation-stagings [--json]`与`audit inspect-rotation-staging <staging-id> [--json]`：list最多扫描4096个parent entries并返回128项，只投影当前target的exact六字符suffix；direct不扫描parent。两者共享no-follow、root/child identity-bound的`empty`/`previous_only`/`unknown` projection，旧Phase553固定prefix residue只计数告警且不获得target authority。本阶段只读，不恢复、不删除、不生成fingerprint，也不改变JSON-RPC、agent event、provider、tool result或persistent metadata contracts。

Phase555 在target-bound selected staging之上增加恢复资格dry-run。`inspectJsonlAuditRotationRecovery`与`audit inspect-rotation-recovery <staging-id> [--json]`对current、`.1`、staging root、optional `previous`和derived coordination lock执行前后稳定snapshot；只有exact private empty wrapper、`previous_only + valid current + missing .1`以及`previous_only + missing current + valid .1`三类shape分别获得cleanup、archive restore或full rollback action。Eligible结果输出绑定absolute target、ID、action和全部观察对象snapshot的32-hex fingerprint；active/changed lock、ambiguous current+`.1`、invalid/unsupported state或任何graph drift均不生成fingerprint。CLI固定`confirmation_required: true`、`mutation_performed: false`，本阶段不执行rename、unlink、rmdir、write或durability sync，也不新增跨进程协议字段。

Phase556 将上述readiness升级为显式受保护mutation。`recoverJsonlAuditRotationStaging`与`audit recover-rotation-staging <staging-id>`共享normal writer serialization key并获取same-user coordination lock，在锁内两次重建Phase555 graph、匹配operator提供的exact action与32-hex fingerprint，再固定generation parent、selected staging和所需generation descriptor。三个action分别只删除exact-empty wrapper、恢复staged previous到missing `.1`，或按`.1 -> current`、`previous -> .1`完成full rollback；commit前失败按可证明identity逆序恢复，commit后wrapper residue或full directory durability uncertainty通过结构化result/CLI warning暴露且不回滚已恢复generation。CLI默认dry-run，真实mutation要求`--yes --expect-action <action> --expect-recovery <fingerprint>`；本阶段仍不读取JSONL/archive content，也不新增JSON-RPC、agent event、tool result或persistent metadata字段。

Phase557 修复recovery operation已经得到确定结果后被candidate handle close或coordination lock release failure覆盖的问题。Runtime result新增actual `performedAction`、candidate handles closure状态、derived coordination lock path、release完成状态、logical residual lock path和独立warning；clean release仍为OK，generation commit、empty cleanup或missing no-op之后的lifecycle uncertainty则保留原mutation evidence并返回WARN。Pre-commit primary error仍保持reject且不被secondary close/release/abandon error替换。CLI mutation mode始终投影这些字段，不再把已提交恢复退回默认`mutation_performed: false` error；normal JsonlAuditSink successful record后release failure仍沿用Phase527 reject语义，JSON-RPC和persistent contracts不变。

Phase558 为post-validation recovery rejection补齐typed、JSON-safe failure evidence。Runtime公开`JsonlAuditRotationStagingRecoveryError`，稳定区分lock acquisition、locked revalidation、candidate open/revalidation、mutation与rollback stage，并以`not_started`、`attempted_unconfirmed`、`rolled_back`、`uncertain`描述namespace mutation结果。Successful reverse rollback保留原primary message并明确已恢复initial shape；rollback无法证明时输出uncertain。Candidate descriptor close和normal lock release/abandon/residual evidence合并到同一failure details但不覆盖primary。CLI ERROR新增failure/mutation/rollback/acquisition fields，避免把未开始、syscall结果未知、已回滚和残留不确定混为默认`mutation_performed: false`；该Host-local extension不序列化raw cause或owner secret，也不改变JSON-RPC和persistent contracts。

Phase559 修复candidate pinned directory在`open`成功、return前validation失败时的descriptor ownership断层。Recovery caller现在向module-private opener提供failed-open handle handoff sink；helper不再内部close后吞掉secondary failure，而把未返回handle交给candidate outer finalizer，与已经返回的parent/staging/generation handles统一all-settled关闭。由此`recoveryHandlesClosed: true`覆盖全部returned与failed-open descriptors，close rejection稳定进入既有warning且不替换`candidate_open` primary message。Optional handoff不改变parent bootstrap、normal writer或rotation creation等其他caller语义，CLI复用Phase558 fields，无新增wire或persistent schema。

Phase560 修复all-settled finalizer在构造Promise数组时直接调用`handle.close()`的同步异常缺口。新增module-private async invocation boundary，把close同步throw和异步rejection都转换为独立rejected Promise后再进入`Promise.allSettled`；因此一个descriptor的同步close failure不会阻止其余handles获得close attempt，也不会覆盖committed result或operation primary error。Recovery仍以既有`recoveryHandlesClosed`/warning投影，shared throwing close helper也采用同一normalization；FileHandle、mutation、rollback、lock和CLI schema不变。

Phase561 修复secondary reason在warning格式化时再次throw并覆盖operation outcome的问题。Recovery-local error summary现在对任意unknown reason总是返回string：formatter hook失败使用固定`unavailable error detail`，C0/C1与line separators替换为`?`，summary严格限制为512字符并以`...`截断。该helper统一服务operation normalization、candidate close、lock finalization、staging cleanup/durability和residual warning；不读取stack/cause/raw properties。CLI复用既有message/warning字段，committed result和primary typed failure不再受hostile `message`/`toString`/`Symbol.toPrimitive`影响。

Phase562 为normal-lock-acquired recovery failure补充锁释放前的结构化namespace evidence。Outer recovery在under-lock operation和candidate handle settlement完成后、normal coordination lock finalization前，对lock ownership执行前后双重assertion并只读重建current、`.1`和selected staging graph；成功时输出独立`postFailureObservation`及fresh assessment/action/fingerprint，失败时只输出bounded warning且不覆盖primary stage、mutation/rollback或lifecycle details。Top-level pre-mutation fingerprint与nested post-failure snapshot明确分时，nested eligibility不构成锁释放后的retry authority。CLI使用nested human/JSON section投影同一Host-local证据，不读取generation/archive content，也不改变JSON-RPC、agent event、tool result、transcript或persistent schema。

Phase563 修复selected rotation staging child set在diagnostic、recovery graph和exact-entry mutation gate中通过无界`readdir().sort()`完整物化的问题。Shared descriptor-bound scanner现在使用`opendir`流式读取，最多保留2个entry names并额外读取1个sentinel判断truncation；directory projection新增scan count/limit/truncated，`entryCount`只在总数可精确证明时输出。Truncated staging固定为`unknown`且无action/fingerprint，recovery与normal rotation mutation gate在namespace syscall前拒绝overflow set。List/direct/readiness、Phase562 observation和CLI human/JSON共享该边界，不输出overflow names或读取archive content。

Phase564 将相同资源边界推广到active coordination lock、quarantine root、nested `lock`和disposal root。Shared descriptor-bound scanner最多保留2个child names并额外读取1个sentinel；quarantine/disposal projection分别公开root/nested scan count、limit和truncated，exact entry count只在未截断时存在。任何truncated residue都固定为`unknown`，不选择owner、不生成empty fingerprint或cleanup/recovery authority。Runtime acquire/release、owner/empty cleanup、quarantine recovery与private wrapper contraction的exact-entry gates均复用同一扫描器，在rename/unlink/rmdir前有界拒绝overflow state；child names和overflow total不进入CLI或其他接口。

Phase565 修复active coordination lock只执行一次bounded child scan便发布owner authority的问题。`inspectJsonlAuditFileLock(...)`现在保持同一lock directory descriptor，执行initial/final 2-entry scans，并在valid owner场景保持owner descriptor到final child scan之后，再验证directory path、owner path/object/content连续性。Child set、directory binding或owner snapshot任一漂移都输出`stateChanged`并撤销owner metadata/exclusive authority；stable truncated scan和inspection failure同样不能生成cleanup fingerprint。`inspect-path`、`cleanup-lock`、quarantine recovery preflight与rotation recovery readiness统一投影scan/exclusive/state/error scalar metadata，rotation comparison把internal uncertainty归类为`state_changed`。Mutation仍必须执行fresh descriptor-bound revalidation，wire与persistent schema不变。

Phase566 补齐valid owner final snapshot之后缺少terminal lock-directory binding的顺序窗口。旧顺序先验证lock directory，再验证owner path；若两步之间把original lock directory rename并在logical lock path放置指向original的symlink，owner检查会沿中间symlink访问同一file，旧dry-run仍可能把当前symlink leaf描述为valid directory并签发fingerprint。Active inspector现在在owner snapshot成功后再次执行descriptor/path/descriptor terminal gate，只有logical lock path仍是绑定original object的directory才发布owner authority。Persistent symlink/replacement drift进入既有`stateChanged`与authority withdrawal；CLI字段、fingerprint算法、mutation transaction和wire schema不变。

Phase567 将active lock的两个read-only directory gates从mutation-oriented object matching收紧为open-time full generation matching。旧terminal gate只要求current descriptor/path/descriptor彼此具有相同完整identity，却只以device/inode关联open-time directory；final scan后在owner snapshot期间新增child会改变ctime但保留同一object，旧dry-run仍可能签发fingerprint。Strict observation helper现在要求两次gate中的descriptor/path/descriptor均与pinned device/inode/ctimeNs/birthtimeNs一致，因此child add/remove/rename、owner basename replacement、chmod、directory rename/replacement等generation drift统一进入`stateChanged`。Mutation transaction继续使用允许合法ctime变化的object matcher；CLI与wire字段不变。

Phase568 将stable observation闭包扩展到quarantine/disposal residue。旧scanner在initial owner read后只复验entry set与same-object directory binding；`owner.json`若在final scan期间原地写入另一份valid metadata，directory ctime与child names不变，旧direct inspection和cleanup dry-run仍可能发布陈旧fingerprint。现在stable layout先通过root/nested strict open-time generation gate，再重新读取唯一selected owner并比较status、device/inode与canonical metadata，owner reread后再次终检所有参与layout判断的directory generation；empty fingerprint opener也切换到strict gates。任何selected owner semantic/object drift或residue generation变化都进入`stateChanged`、`layout: unknown`且无fingerprint/confirmation。Mutation helpers、CLI字段、wire与persistent schema不变。

Phase569 闭合disposal authority与source quarantine absence之间的跨路径时序。旧inspection先读取source、再完成owner-only或empty disposal observation；source若在disposal final scan期间重新出现，旧dry-run仍报告source absent并签发confirmation。现在initial source missing的authority-bearing branch在返回前执行terminal no-follow `lstat`。Present source更新existence/type并标记source/disposal state changed，layout降级为unknown且清除owner/empty fingerprint；path-chain drift或inspection error同样fail closed。Late source不被递归扫描，destructive cleanup原有多次fresh source-absence assertions、CLI字段与wire schema保持。

Phase570 闭合owner-bearing read-only authority在branch-specific terminal directory/source gate之后仍可能复用陈旧owner snapshot的问题。Active lock、owner-bearing quarantine和owner-only disposal现在都以最后一次bounded no-follow owner inspection结束；valid owner必须同时匹配device、inode、ctimeNs、birthtimeNs、mtimeNs、size和canonical metadata。Persistent terminal owner rewrite会进入既有`stateChanged`/`layout: unknown`投影并撤销owner fields、fingerprint与confirmation。Empty branch、child scan预算、destructive transaction、CLI字段、wire与persistent schema保持。

Phase571 闭合owner fingerprint只绑定owner token、无法区分dry-run candidate generation的问题。Stable active、owner-bearing quarantine和owner-only disposal inspector现在发布Host-local candidate-bound `ownerFingerprint`：version/domain、absolute candidate path、layout与owner location、参与authority的root/nested directory full generations、selected owner full generation和canonical metadata全部进入canonical tagged hash；disposal额外绑定derived source quarantine path的missing marker。四类mutation从fresh pinned candidate重算同一material，并在private wrapper/reservation或任何rename/unlink/rmdir前拒绝旧path、旧generation、其他domain/layout或token-only fingerprint。CLI继续使用32 lowercase hex和既有`--expect-owner`字段，JSON-RPC、agent event、provider、tool result、transcript与persistent schema不变。

Phase572 闭合CLI preflight positive evidence先于authoritative runtime selection的问题。`cleanup-lock`、owner/empty quarantine cleanup、owner/empty disposal cleanup与pre-commit quarantine recovery只在preflight mismatch时显式发布`false`；preflight match保持为local control flow，runtime rejection或`existed: false`不再携带旧snapshot的positive match/fingerprint。只有runtime existing result返回exact expected fingerprint后才发布`true`和该runtime value，post-commit residual继续沿用既有removed/recovered/residual语义。CLI字段集合、confirmation flags、runtime signatures、wire与persistent schema不变。

Phase573 闭合active cleanup与owner-only quarantine cleanup在成功删除selected path后仍保留preflight `exists: true`的问题。两条CLI在runtime existing gate后把`coordination_lock_exists`或`quarantine_exists`设置为false，再投影Phase572 positive fingerprint及success/residual outcome；private wrapper residual继续由`residual_quarantine_path`或`residual_disposal_path`独立表达。其他maintenance command已经具有runtime-derived terminal existence，runtime signatures、mutation transaction、CLI字段集合与跨层schema不变。

Phase574 闭合owner-only disposal cleanup与successful quarantine recovery把post-commit residual locator直接映射为selected path仍存在的问题。两类residual都只证明cleanup无法安全确认，无法区分logical path present、missing或replacement；CLI因此在runtime existing且无residual时明确投影对应`*_exists: false`，有residual时保留locator与WARN并省略optional existence boolean。Recovery rollback-residual verified branch保持原有true语义，runtime result types、commit/rollback transaction、CLI字段集合与跨层schema不变。

Phase575 闭合六条maintenance command在runtime candidate missing后继续发布preflight snapshot的问题。Runtime `existed: false`只证明selected target missing和本operation未执行mutation；CLI现在撤销selected entry/layout/scan/owner/state fields，只保留path/ID与selected `*_exists: false`。Owner/empty disposal同时撤销runtime未重新观察的source quarantine evidence，recovery同时撤销runtime未重新观察的active coordination lock evidence，避免concurrent source/lock appearance与陈旧false冲突。Runtime existing、residual、rollback、rejection与dry-run branches保持，字段集合和跨层schema不变。

Phase576 闭合六条lock maintenance operation在已知结果形成后仍可能被descriptor close failure覆盖的问题。五类cleanup与pre-commit quarantine recovery现在统一使用non-throwing、all-settled handle finalizer；candidate-existing result分别投影cleanup/recovery handle closure boolean和bounded warning。Committed deletion、successful recovery、verified rollback residual、fingerprint与residual evidence在secondary close failure下保持，CLI以WARN和Host-local lifecycle fields表达finalization uncertainty；stable result明确closed，runtime missing省略fields，primary operation rejection仍保持原错误。Mutation、commit/rollback、candidate selection、wire与persistent schema不变。

Phase577 闭合rejected maintenance operation缺少descriptor lifecycle evidence以及candidate-selection close失败覆盖primary error的问题。Runtime新增typed maintenance error envelope和六个exact operation identifiers；candidate reader取得pinned handles后的selection rejection与top-level operation rejection都使用同一non-throwing all-settled finalizer。Primary message/cause保持，全部close成功报告true，任一failure报告false与aggregate-bounded warning，multi-handle reader不会被首个同步throw截断。CLI ERROR复用Phase576 optional fields，不新增命令或JSON字段；preflight refusal、initial missing、mutation、commit/rollback及跨层schema保持。

Phase578补齐maintenance helper在`fs.open()`成功后、pinned object return前的transient ownership。Candidate directory/empty/owner opener、private temporary bootstrap、mutation parent、recovery reservation和empty terminal assertion通过module-private optional collector把failed-open或短生命周期handles交给outer deduplicated all-settled finalizer。Primary validation message保持，sync close throw不截断其他handles；empty terminal assertion close failure沿resolved cleanup lifecycle fields形成WARN。Phase577 error type、六个operation identifiers和CLI字段全部复用，initial missing、pre-open failure、mutation/rollback及跨层schema保持。

Phase579补齐maintenance bounded child scan的`Dir` stream finalization。Maintenance-aware scan在helper内立即normalized close并把结果累计到stack-local context，read primary error或成功scan result不再被secondary close failure替换；outer finalizer把stream outcome与candidate、operation及failed-open `FileHandle` closure统一聚合。六条cleanup/recovery resolved与rejected branch继续复用Phase576/577 lifecycle fields，CLI WARN/ERROR保持primary outcome且不新增字段。Inspection-only、rotation staging、scan budget、mutation/fingerprint及跨层schema保持。

Phase580为shared maintenance descriptor finalizer增加5000ms Promise settlement deadline。`Dir`与`FileHandle` close仍single-attempt并发启动，sync throw、rejection和resolve保持；永久pending在deadline后转为bounded timeout evidence，成功operation和primary error不再无限等待。Late resolve/reject由owned observer消费，不重试、取消或回写已发布result。六条operation和五个candidate graph自动覆盖，CLI字段不变；inspection、rotation family、mutation/fingerprint及跨层schema保持。

Phase581闭合read-only inspection的direct-close永久pending边界。三个parent namespace enumerator、两类bounded child scanner和active/rotation/quarantine/disposal/owner/empty pinned resources共享inspection-specific 5000ms closer；同一finalization set并发close，read primary保持，late settlement只消费。Parent list timeout进入既有CLI ERROR，single-entry timeout固定inspection uncertain并撤销positive authority，不新增字段或执行mutation。Maintenance、mutating rotation recovery、acquisition/writer及跨层schema保持。

Phase582闭合mutating rotation recovery candidate finalizer的永久pending边界。Generation、staging directory与parent directory handles通过recovery-specific 5000ms wrapper并发settle；timeout只进入既有`recoveryHandlesClosed`/warning fields，committed action、mutation/rollback primary、candidate-open stage与post-failure observation保持。Late settlement只被shared observer消费，candidate deadline后coordination lock继续finalize；lock lifecycle、acquisition、writer和跨层schema不变。

Phase583闭合successful cooperative lock lifecycle finalizer的永久pending与重复close边界。Owner、lock directory与parent handles通过lifecycle-specific 5000ms wrapper按identity去重并发settle，首次`release()`或`abandon()`立即memoize finalization Promise；timeout、repeated operation和writer/recovery fallback都复用同一outcome。Release timeout保持已提交missing namespace，abandon timeout保持disk lock；writer primary与recovery committed evidence保持，coordination lock复用既有released false/warning且不新增public或跨层schema。

Phase584闭合lock ownership transfer前acquisition resources的永久pending边界。Failed-open mutation parent/lock directory/exclusive owner、pre-transfer parent、failed-cleanup owner/lock handles及acquisition child-scan `Dir`通过acquisition-specific 5000ms wrapper settle。Validation/write primary与`EEXIST` retry identity保持；successful scan close timeout拒绝transfer并沿既有lock-acquisition ERROR投影。Late settlement只被shared observer消费，successful lock仍交给Phase583，public option、CLI field和跨层schema不变。

Phase585闭合常规JSONL writer-owned descriptor的永久pending边界。Parent bootstrap、generation parent、append handle、rotation preparation/transaction、backup staging directory和writer staging `Dir`通过writer-specific 5000ms wrapper settle。Existing write/validation/rotation primary保持；无primary时close timeout形成固定writer error，已提交append/rotation state不rollback。Late settlement只被shared observer消费，writer serialization tail仍可继续，lock acquisition/lifecycle、recovery、maintenance、inspection及public/cross-layer schema不变。

Phase586闭合successful lock transfer后lifecycle child-scan `Dir`的永久pending边界。Returned lock directory只在acquisition validation完成后获得lifecycle marker；`assertHeld()`、pre-owner release scan和post-owner empty scan复用Phase583 5000ms wrapper。Read primary保持；pre-owner timeout保留owner lock，post-owner timeout保留exact empty residual，stream failure不memoize handle finalizer并允许fallback `abandon()`关闭handles。Recovery/writer复用existing error、warning与residual fields，public lock/CLI/cross-layer schema不变。

Phase587闭合successful rotation recovery candidate staging child-scan `Dir`的永久pending边界。Recovery parent/staging directory在open validation完成后获得module-private marker，candidate-open、mutation revalidation、commit proof、rollback与final cleanup都复用Phase582 5000ms wrapper。Read primary保持；pre-commit timeout进入existing rollback，post-commit timeout保留current/archive commit和exact empty staging residual。Phase582 handle finalizer、public recovery/CLI/cross-layer schema不变。

Phase588闭合MCP runtime shutdown的永久pending边界。Connected servers从runtime state snapshot后并发关闭；client与fallback transport分别使用5000ms settlement deadline；active close lifecycle memoize供concurrent/repeated caller共享。Connect/list-tools primary不再被cleanup无限延迟，late settlement不泄漏或触发二次fallback，public MCP/CLI/cross-layer schema不变。

Phase589闭合prepared host对MCP/plugin runtime的ownership transfer边界。Runtime创建后，plugin load、tool catalog注册或MCP context构建失败会对全部已创建runtime并发all-settled回滚，secondary close failure不覆盖setup primary。成功host的close保存terminal Promise，并发启动两个runtime close、消费同步throw/reject，concurrent与post-settlement repeated caller不再重复close。Host public options/signature、CLI和跨层schema不变；host+engine复合finalizer与engine stop lifecycle留给后续阶段。

Phase590闭合headless run与RPC smoke的outer composite finalizer边界。`god_code_event`和`exit` listeners在cleanup前detach；renderer finish、Phase589 host close与engine stop通过独立owned Promise并发all-settled。Run/start/initialize/create/submit/engine-exit primary跨cleanup failure保持；无operation primary时仍按renderer、host、engine确定性priority传播首个cleanup reason。REPL composite cleanup随后由Phase591闭合，engine stop内部lifecycle随后由Phase592闭合；public run/CLI/cross-layer schema不变。

Phase591闭合REPL session generation与outer runner的composite cleanup边界。Active start、terminal stop和resource cleanup分别memoize，concurrent caller共享Promise；stop在async finalizer前detach listeners并转移host/active-turn/state ownership，以固定local reason结束pending submit，同时best-effort发起cancel但不等待。Renderer、host与engine all-settled并保持start/submit/engine-exit/outer-run primary；normal stop后的restart先观察旧cleanup再创建新generation。Readline closure与pending action observer也进入primary-aware finalizer，public REPL/CLI/cross-layer schema不变；当时保留的engine stop内部deadline、SIGKILL/exit与peer lifecycle已由Phase592闭合。

Phase592闭合`GodCodeEngineProcess`自身的terminal generation边界。Start与stop lifecycle分别memoize；stop在任何shutdown await前snapshot并撤销child、peer、initialized与turn state。Shutdown request由独立5000ms observer限制，随后stdin best-effort close、2000ms graceful exit、single SIGKILL与2000ms forced exit按序执行；forced timeout保留rejected terminal marker并阻止restart。每个child exit callback捕获本代peer closer与stderr，不再动态关闭replacement peer；normal restart重置generation diagnostics。Doctor/provider-health继续复用best-effort policy，public engine/CLI/cross-layer schema不变。

Phase593闭合doctor两条engine check的outer cleanup priority。`python_engine`与`provider_health`先在局部形成唯一operation diagnostic，再把optional waiter cleanup和Phase592 stop作为独立owned Promise all-settled。Operation error message保持；候选ok叠加cleanup failure时分别投影固定`initialized but engine cleanup failed`或`<provider>: health check cleanup failed`，raw cleanup reason不进入report。Provider-health cleanup memoize并独立清除timer与两个listeners，一个sync throw不能阻断engine stop。Doctor command/options/human/JSON schema和默认offline行为不变；当时保留的tool-catalog host-close report consistency已由Phase594闭合。

Phase594闭合doctor `tool_catalog`与prepared-host close之间的report ownership。`checkHostTools()`先在局部形成tool count或setup/read primary，已取得host时再通过owned Promise观察Phase589 close；最终只push一个diagnostic。Operation error跨close throw/reject保持，候选ok叠加cleanup failure时固定投影`tool catalog loaded but host cleanup failed`，raw cleanup reason不进入report。正常tool count、audit skip、doctor顺序以及public TS/CLI/JSON/protocol/persistent schema保持。

Phase595闭合`tools list/inspect`共享的short-lived prepared-host边界。`listHostTools()`先形成catalog read outcome，再通过owned Promise观察host close；read primary以原对象保持，候选success叠加close throw/reject时固定抛出`tool catalog loaded but host cleanup failed`。Host close single-attempt，原catalog array identity、normal render/not-found、CLI exit routing和public TS/protocol/persistent schema保持。

Phase596闭合plugin config/list diagnostics的runtime close priority。`inspectPluginConfig()`和non-registry `listConfiguredPlugins()`先形成唯一operation diagnostic，再通过owned Promise观察runtime close；load/list error保持，候选ok叠加close throw/reject时固定投影`plugin runtime cleanup failed`。Config/no-plugin/registry fast path、manifest与registry commands、sandbox execution及public TS/CLI/JSON/protocol/persistent schema保持。

Phase597闭合MCP diagnostics三类runtime close priority。Context、connection multi-check和generic operation先在局部形成existing checks，再通过shared owned Promise观察close；任何operation error保持。无error且cleanup失败时分别把`mcp_context`、`mcp_connect`或generic operation name降级为固定`MCP runtime cleanup failed`，不新增check。Optional successful checks、normal details、Phase588 runtime close及public TS/CLI/JSON/protocol/persistent schema保持。

Phase598闭合terminal approval readline与TUI PTY smoke screen的同步cleanup priority。Approval answer/abort只settle local decision，listener detach与readline close独立执行且close single-attempt；question rejection、interactive deny和cancel primary保持，allow叠加cleanup failure时fail closed为固定unavailable denial。TUI render与screen stop分别结算；render primary保持，successful render叠加stop failure时只抛固定sanitized Error。Public approval/TUI options、decision/result、CLI与跨层schema保持。

Phase599闭合`TuiController`复合生命周期。Start ownership失败时停止candidate/registered sessions和screen并保持原primary；run在key/line/input setup任何退出路径结算input finalizer、pending actions与controller stop。Terminal stop Promise memoize，同步撤销runtime ownership后all-settled exit render、raw-mode disable、unique sessions与screen，cleanup-only failure固定脱敏。Pending action裸`finally`已移除，inactive session stop并发fan-out；public TUI state/options/actions、Phase591 session与跨层schema保持。

Phase600闭合transcript watcher callback lifecycle。Active/archive watcher与owner root共同进入local ownership record；timeout或event bound结束时独立attempt全部`FSWatcher.close()`，同步throw不会阻断后续close、pending event settlement或outer resolve。Existing setup/validation primary保持，cleanup-only uncertainty只把对应existing root降级为固定`transcript watcher cleanup failed`。Pending event Set使用双分支observer删除original Promise，不再创建unhandled rejected derivative；watch result、CLI JSON、discovery与跨层schema保持。

Phase601闭合local provider log descriptor lifecycle。Daemon start的spawn/marker outcome和model pull/remove/prune的spawn/process outcome先形成唯一primary，再通过shared同步finalizer关闭日志fd。Thrown primary与existing error report保持；successful report叠加cleanup failure时复用first provider check固定投影`local provider log cleanup failed`并保留details。Model `error`/`close` callback中的close throw不再逃逸或阻断outer resolve，settled guard保证single-attempt；public report、CLI、environment与跨层schema保持。

Phase601后的[final release lifecycle audit](design/FINAL_RELEASE_AUDIT_AFTER_PHASE_601.md)已复查全部active Host callback/finalizer、source/dist、public exports、跨层schema、权威full gate与残留。Phase599留下的Phase600/601两个独立缺口均已闭合，未发现新的runtime-reproducible lifecycle或interface gap；后续扩展应建立新的显式阶段。

近期优先目标是把项目从“可运行骨架”推进到“适合开源协作的稳定基线”。

建议下一阶段优先做：

1. **开源发布准备**（已完成 Phase14 基础实现）
   - 已补 `LICENSE`，采用 MIT License。
   - 已补 `CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`SUPPORT.md` 和 `GOVERNANCE.md`。
   - 已补 `SECURITY.md`，明确安全边界和私密漏洞报告流程。
   - 已补 `CHANGELOG.md` 和 `RELEASE.md`，明确版本号、变更记录和 release 规则。
   - 已补 GitHub Issue forms 和 Pull Request template。
   - 已在 TypeScript 与 Python 包元数据中声明 MIT License。
   - 已确认 `ts-host/package.json` 暂继续保留 `"private": true`，本阶段不发布 npm 包。

2. **集成测试基线**（已完成 Phase13 基础实现）
   - 已增加 CLI 黑盒测试入口 `integration/cli_integration.py`。
   - 已增加 `tools/run-integration-tests.sh` 并接入 `tools/check.sh`。
   - 已增加 normalized golden event sequence 验证。
   - 已固化 `doctor`、`tools list/inspect`、`run --json`、`sessions list/replay` 的基础 contract。

3. **配置示例**（已完成 Phase15 基础实现）
   - 已增加 provider 环境变量示例。
   - 已增加 MCP stdio server 配置示例。
   - 已增加 plugin / skill manifest 示例。
   - 已增加 transcript 目录配置说明。

4. **Session history management**（已完成 Phase16 基础实现）
   - 已增加 `sessions search <query>` 和 `sessions search <query> --json`。
   - 已增加 `sessions replay <session_id> --json`。
   - 已增加 `sessions delete <session_id> --yes` 和 `sessions delete <session_id> --json --yes`。
   - 已把 search / replay JSON / delete 确认接入 unit、integration 和 CLI smoke。

5. **Provider health diagnostics**（已完成 Phase17 基础实现）
   - 已增加 `doctor provider-health` 和 `doctor provider-health --json`。
   - 默认 `doctor` 仍不访问真实 provider HTTP。
   - provider health 使用空 tool catalog 和最小 turn，显式验证当前 provider 配置可用性。
   - 已把 fake provider health、config error skip 和 unsupported provider error 接入 unit / integration / smoke。

6. **MCP / Plugin diagnostics**（已完成 Phase18 基础实现）
   - 已增加 `mcp inspect-config` 和 `mcp inspect-config --json`。
   - 已增加 `mcp inspect-config --connect` 显式连接诊断。
   - 已增加 `plugins validate <manifest_or_dir>` 和 `plugins validate <manifest_or_dir> --json`。
   - 已把 MCP config、MCP connect、plugin / skill manifest 校验接入 unit / integration / smoke。

7. **Provider contract tests**（已完成 Phase19 基础实现）
   - 已增加 `provider contract-test` 和 `provider contract-test --json`。
   - 使用离线 fixtures 和 recording transport，不访问真实 provider HTTP。
   - 已覆盖 OpenAI-compatible / Responses request body、assistant / tool_call mapper、streaming、Responses `provider_context` 和 `RealProviderModelAdapter` 边界。
   - 已接入 Python tests、TS tests、integration 和 CLI smoke。

8. **Provider config inspection**（已完成 Phase20 基础实现）
   - 已增加 `provider inspect-config` 和 `provider inspect-config --json`。
   - 只做离线 env shape 检查，不访问真实 provider HTTP，不启动 Python Engine。
   - 输出 provider、model、api_key_env、api_key_present、effective_base_url、timeout_s、known_family 等 sanitized details。
   - 已让 `doctor` 复用同一套 provider config inspection 逻辑，避免配置检查行为漂移。

9. **Session resume**（已完成 Phase21 基础实现）
   - 已增加 `sessions resume <session_id> <prompt>`。
   - 已增加 `sessions resume <session_id> --json <prompt>` 和 `--json --raw-events`。
   - 从旧 transcript 恢复 user / assistant / tool_call / tool_result 到新的 engine session，旧 transcript 不覆盖。
   - 暂不恢复 live process、取消中的 turn 或 Responses provider opaque context。

10. **Session history retention**（已完成 Phase22 基础实现）
   - 已增加 `sessions cleanup --older-than-days <n>` dry-run。
   - 已增加 `sessions cleanup --older-than-days <n> --archive --yes`。
   - 已增加 `sessions cleanup --older-than-days <n> --delete --yes`。
   - 已增加 cleanup JSON 输出，并接入 unit、integration 和 CLI smoke。
   - Phase22 本身只处理 active transcript，不递归处理 `archive/`，不做 restore；archived gzip 已在 Phase30 补齐。

11. **Archived session management**（已完成 Phase23 基础实现）
   - 已增加 `sessions archive list` 和 `sessions archive list --json`。
   - 已增加 `sessions archive replay <session_id>` 和 `--json`。
   - 已增加 `sessions archive restore <session_id> --yes` 和 `--json`。
   - restore 会从 `archive/` 移回 active transcript 目录，目标已存在时失败且不覆盖。
   - 当前不做批量 restore；archived gzip 已在 Phase30 补齐。

12. **Archived session search / delete**（已完成 Phase24 基础实现）
   - 已增加 `sessions archive search <query>` 和 `sessions archive search <query> --json`。
   - 已增加 `sessions archive delete <session_id> --yes` 和 `sessions archive delete <session_id> --yes --json`。
   - archived search / delete 只作用于 `<transcriptDir>/archive/*.jsonl`，不影响 active history。
   - 当前不做批量 delete 或跨目录全局搜索；archived gzip 已在 Phase30 补齐，索引化搜索已在 Phase31 补齐。

13. **MCP server config file**（已完成 Phase25 基础实现）
   - 已增加 `GOD_CODE_MCP_CONFIG_FILE`，配置文件 schema 沿用 `GOD_CODE_MCP_SERVERS` JSON array。
   - `GOD_CODE_MCP_SERVERS` 非空时优先；否则读取 `GOD_CODE_MCP_CONFIG_FILE` 指向的 JSON 文件。
   - `mcp inspect-config` 会报告 sanitized source / config file / server metadata。
   - 不做 YAML、自动发现、secret interpolation、resources / prompts diagnostics 或 HTTP runtime transport；Streamable HTTP 配置诊断已在 Phase33 补齐，resources / prompts diagnostics 已在 Phase38 补齐。

14. **MCP tool schema display**（已完成 Phase26 基础实现）
   - `mcp inspect-config --connect` 文本输出会显示 MCP tool schema 摘要。
   - `mcp inspect-config --connect --json` 保留完整 MCP tool `input_schema`。
   - `tools inspect <mcp.tool.name> --json` 可检查 MCP tool 的完整 input schema。
   - 不改变 JSON-RPC、Python Engine payload 或 MCP tool 执行语义。

15. **MCP runtime error diagnostics**（已完成 Phase27 基础实现）
   - MCP runtime 连接失败、tools/list 失败和重复 tool name 会生成结构化诊断错误。
   - `mcp inspect-config --connect --json` 会报告 `error_code`、`server_id`、`cause_message` 和 sanitized server metadata。
   - 文本诊断会展示失败 server、error code 和 env key metadata，不泄露 env values。
   - 不做 retry、自动修复或 stderr 分类。

16. **MCP Streamable HTTP config diagnostics**（已完成 Phase33 基础实现）
   - MCP 配置支持 `transport: "streamable-http"`、`url` 和 `headers`。
   - `mcp inspect-config --json` 会展示 sanitized URL / header keys，不泄露 header values。
   - Phase33 本身不把 HTTP MCP server 接入 headless tool execution；该能力已在 Phase34 补齐。
   - 当前不做 OAuth / token refresh flow 或后台 daemon / 跨命令持久 resource update event loop；resources / prompts 列表诊断已在 Phase38 补齐，resource read / prompt get 诊断已在 Phase39 补齐，resource templates 列表诊断已在 Phase40 补齐，subscription 请求诊断已在 Phase41 补齐，completion 诊断已在 Phase42 补齐，resource update wait 诊断已在 Phase43 补齐，resource update watch 诊断已在 Phase44 补齐，completion candidate 输出已在 Phase45 补齐，bash/zsh hook script 已在 Phase46 补齐，guarded rc install 已在 Phase47 补齐，resource update loop 已在 Phase48 补齐。

17. **MCP Streamable HTTP runtime**（已完成 Phase34 基础实现）
   - `mcp inspect-config --connect` 可连接 Streamable HTTP MCP server 并列出 tools。
   - Streamable HTTP MCP tools 会映射为 `mcp.<server_id>.<tool_name>` 并进入 headless tool catalog。
   - tool execution 继续走 `HostToolRegistry.executeRequest(...)`、permission 和 audit 边界。
   - 当前不做 OAuth / token refresh flow 或后台 daemon / 跨命令持久 resource update event loop；resources / prompts 列表诊断已在 Phase38 补齐，resource read / prompt get 诊断已在 Phase39 补齐，resource templates 列表诊断已在 Phase40 补齐，subscription 请求诊断已在 Phase41 补齐，completion 诊断已在 Phase42 补齐，resource update wait 诊断已在 Phase43 补齐，resource update watch 诊断已在 Phase44 补齐，completion candidate 输出已在 Phase45 补齐，bash/zsh hook script 已在 Phase46 补齐，guarded rc install 已在 Phase47 补齐，resource update loop 已在 Phase48 补齐，legacy SSE transport 已在 Phase52 补齐。

18. **MCP resources / prompts diagnostics**（已完成 Phase38 基础实现）
   - `mcp inspect-config --resources` 会隐式连接已配置 server 并执行 `resources/list`。
   - `mcp inspect-config --prompts` 会隐式连接已配置 server 并执行 `prompts/list`。
   - JSON diagnostics 保留 resources / prompts metadata；文本 diagnostics 展示 URI、prompt name、server id 和简要字段。
   - 当前不做后台 daemon / 跨命令持久 resource update event loop、OAuth / token refresh flow 或自动发现式 PromptBuilder 注入；显式 read/get 诊断已在 Phase39 补齐，resource templates 列表诊断已在 Phase40 补齐，subscription 请求诊断已在 Phase41 补齐，completion 诊断已在 Phase42 补齐，resource update wait 诊断已在 Phase43 补齐，resource update watch 诊断已在 Phase44 补齐，completion candidate 输出已在 Phase45 补齐，bash/zsh hook script 已在 Phase46 补齐，guarded rc install 已在 Phase47 补齐，resource update loop 已在 Phase48 补齐，显式 context 注入已在 Phase49 补齐。

19. **MCP resource read / prompt get diagnostics**（已完成 Phase39 基础实现）
   - 已增加 `mcp read-resource <uri>` 和 `mcp read-resource <uri> --json`。
   - 已增加 `mcp get-prompt <name> [arguments_json]` 和 `--json`。
   - stdio 和 Streamable HTTP runtime 共用 `readResource()` / `getPrompt()`。
   - 当前不做后台 daemon / 跨命令持久 resource update event loop、自动发现式 PromptBuilder 注入、prompt argument UI 或 OAuth / token refresh flow；resource templates 列表诊断已在 Phase40 补齐，subscription 请求诊断已在 Phase41 补齐，completion 诊断已在 Phase42 补齐，resource update wait 诊断已在 Phase43 补齐，resource update watch 诊断已在 Phase44 补齐，completion candidate 输出已在 Phase45 补齐，bash/zsh hook script 已在 Phase46 补齐，guarded rc install 已在 Phase47 补齐，resource update loop 已在 Phase48 补齐，显式 context 注入已在 Phase49 补齐，legacy SSE transport 已在 Phase52 补齐。

20. **MCP resource templates diagnostics**（已完成 Phase40 基础实现）
   - 已增加 `mcp inspect-config --resource-templates`。
   - 该 flag 会隐式连接 MCP server 并执行 `resources/templates/list`。
   - stdio 和 Streamable HTTP runtime 共用 `listResourceTemplates()`。
   - 当前不做 concrete URI 构造、后台 daemon / 跨命令持久 resource update event loop、自动发现式 PromptBuilder 注入或 OAuth / token refresh flow；subscription 请求诊断已在 Phase41 补齐，completion 诊断已在 Phase42 补齐，resource update wait 诊断已在 Phase43 补齐，resource update watch 诊断已在 Phase44 补齐，completion candidate 输出已在 Phase45 补齐，bash/zsh hook script 已在 Phase46 补齐，guarded rc install 已在 Phase47 补齐，resource update loop 已在 Phase48 补齐，显式 context 注入已在 Phase49 补齐，legacy SSE transport 已在 Phase52 补齐。

21. **MCP resource subscription diagnostics**（已完成 Phase41 基础实现）
   - 已增加 `mcp subscribe-resource <uri>` 和 `mcp unsubscribe-resource <uri>`。
   - stdio 和 Streamable HTTP runtime 共用 `subscribeResource()` / `unsubscribeResource()`。
   - 当前不做跨 CLI 命令持久连接、后台 daemon `notifications/resources/updated` 事件循环、自动发现式 PromptBuilder 注入或 OAuth / token refresh flow；completion 诊断已在 Phase42 补齐，短生命周期 update wait 诊断已在 Phase43 补齐，多事件 watch 诊断已在 Phase44 补齐，in-process update loop 已在 Phase48 补齐，completion candidate 输出已在 Phase45 补齐，bash/zsh hook script 已在 Phase46 补齐，guarded rc install 已在 Phase47 补齐，显式 context 注入已在 Phase49 补齐，legacy SSE transport 已在 Phase52 补齐。

22. **MCP completion diagnostics**（已完成 Phase42 基础实现）
   - 已增加 `mcp complete-prompt <name> <argument_name> <argument_value> [context_json]`。
   - 已增加 `mcp complete-resource-template <uri_template> <argument_name> <argument_value> [context_json]`。
   - stdio 和 Streamable HTTP runtime 共用 `completePrompt()` / `completeResourceTemplate()`。
   - 当前不做 concrete URI 构造、自动发现式 PromptBuilder 注入或 OAuth / token refresh flow；completion candidate 输出已在 Phase45 补齐，bash/zsh hook script 已在 Phase46 补齐，guarded rc install 已在 Phase47 补齐，显式 context 注入已在 Phase49 补齐，legacy SSE transport 已在 Phase52 补齐。

23. **MCP resource update diagnostics**（已完成 Phase43 基础实现）
   - 已增加 `mcp wait-resource-update <uri> [--timeout-ms <n>]` 和 `--json`。
   - runtime 增加 `waitForResourceUpdate()`，在短生命周期连接内注册 `notifications/resources/updated` handler、订阅 resource、等待一次匹配 URI 的 update，然后 best-effort unsubscribe。
   - 当前测试 fixture 覆盖 stdio resource update notification；Streamable HTTP 仍保持现有 stateless fixture，不强行模拟持久 SSE notification。
   - 当前不做跨 CLI 命令持久订阅、后台 event loop、自动发现式 PromptBuilder 注入或 OAuth / token refresh flow；legacy SSE transport 已在 Phase52 补齐。

24. **MCP resource update watch diagnostics**（已完成 Phase44 基础实现）
   - 已增加 `mcp watch-resource-updates <uri> [--max-events <n>] [--timeout-ms <n>]` 和 `--json`。
   - runtime 增加 `watchResourceUpdates()`，在短生命周期连接内注册 `notifications/resources/updated` handler、订阅 resource、收集多次匹配 URI 的 update，然后 best-effort unsubscribe。
   - stdio fixture 会在 subscribe 后发送 3 次 update notification，覆盖多事件 watch 行为。
   - 当前不做跨 CLI 命令持久订阅、后台 daemon / event loop、自动发现式 PromptBuilder 注入或 OAuth / token refresh flow；legacy SSE transport 已在 Phase52 补齐。

25. **MCP completion candidate output**（已完成 Phase45 基础实现）
   - 已为 `mcp complete-prompt` 和 `mcp complete-resource-template` 增加 `--values-only`。
   - 已为 `mcp complete-prompt` 和 `mcp complete-resource-template` 增加 `--jsonl`。
   - `--values-only` 输出每行一个 completion candidate，便于 shell/readline wrapper 使用。
   - `--jsonl` 输出每行一个结构化 candidate，保留 server / ref / argument metadata。
   - 当前不实现交互式 readline UI，不把 completion 注入 PromptBuilder；bash/zsh hook script 已在 Phase46 补齐，guarded rc install 已在 Phase47 补齐。

26. **MCP completion shell hook script**（已完成 Phase46 基础实现）
   - 已增加 `mcp completion-script bash [--program <command>]`。
   - 已增加 `mcp completion-script zsh [--program <command>]`。
   - 生成的 shell hook 会在 `complete-prompt` 和 `complete-resource-template` 的 argument value 位置调用 Phase45 `--values-only` 输出。
   - 当前不做系统级安装，不补全 prompt/resource template 名称；guarded shell rc install 已在 Phase47 补齐。

27. **MCP completion guarded rc installer**（已完成 Phase47 基础实现）
   - 已增加 `mcp completion-install bash [--program <command>] [--rc-file <path>] [--dry-run|--yes] [--json]`。
   - 已增加 `mcp completion-install zsh [--program <command>] [--rc-file <path>] [--dry-run|--yes] [--json]`。
   - 默认 dry-run；真实写入必须传 `--yes`。
   - installer 只更新 `# >>> GOD-code MCP completion >>>` 管理块，不 source rc 文件，不修改系统级 completion 目录。

28. **MCP resource update loop diagnostics**（已完成 Phase48 基础实现）
   - 已增加 `mcp loop-resource-updates <uri...> [--timeout-ms <n>] [--max-events <n>]` 和 `--json`。
   - runtime 增加 `loopResourceUpdates()`，在一个连接生命周期内为一个或多个 resource 注册共享 update handler。
   - loop 会记录 subscriptions、event_count、updates、timed_out 和 timeout_ms。
   - 当前不做跨命令后台 daemon、不把 update 自动注入 PromptBuilder、不改变 Python Engine wire payload。

29. **MCP context injection**（已完成 Phase49 基础实现）
   - 已增加 `GOD_CODE_MCP_CONTEXT` 和 `GOD_CODE_MCP_CONTEXT_FILE`。
   - 已增加 `mcp inspect-context [--json]`，用于预检显式 context 配置、MCP resource / prompt 读取结果和生成的 model history messages。
   - headless run、REPL 和 rpc-smoke 会把显式 context 转换为 `create_session.initial_messages`。
   - 当前不做自动发现式 prompt/resource 注入、不订阅未来 resource update、不新增 JSON-RPC 方法、不实现 OAuth / token refresh flow；legacy SSE transport 已在 Phase52 补齐。

30. **MCP Streamable HTTP auth env diagnostics**（已完成 Phase50 基础实现）
   - Streamable HTTP server config 支持 `bearer_token_env` / `bearerTokenEnv`。
   - Streamable HTTP server config 支持 `headers_env` / `headersEnv`。
   - diagnostics 只输出 `header_keys`、`header_env_keys` 和 `bearer_token_env`，不输出 resolved token/header value。
   - runtime 会把 resolved headers 传给 MCP Streamable HTTP transport。
   - 当前不做 OAuth browser/device flow、token refresh 或 credential store；legacy SSE transport 已在 Phase52 补齐。

31. **MCP context limits**（已完成 Phase51 基础实现）
   - 已增加 `GOD_CODE_MCP_CONTEXT_MAX_ENTRY_CHARS`。
   - 已增加 `GOD_CODE_MCP_CONTEXT_MAX_TOTAL_CHARS`。
   - 已增加 `GOD_CODE_MCP_CONTEXT_DEDUP`，默认开启稳定去重。
   - `mcp inspect-context --json` 会报告 requested/effective entry count、skipped duplicates、skipped messages、truncated messages、content chars 和 per-message truncation metadata。
   - 当前不做 token 精确计数或语义摘要，只做字符级限额与稳定顺序去重。

32. **MCP legacy SSE transport**（已完成 Phase52 基础实现）
   - MCP 配置支持 `transport: "sse"`、`url`、`headers`、`headers_env` 和 `bearer_token_env`。
   - runtime 通过 MCP SDK `SSEClientTransport` 连接旧 SSE server。
   - diagnostics 展示 `transport=sse`、URL、header key / env key 和 bearer token env 名，不泄露 header/token value。
   - stdio、Streamable HTTP 和 legacy SSE 共用 tool/resource/prompt/completion 诊断和 tool catalog 映射路径。
   - 当前不做 Streamable HTTP/SSE 自动 fallback、不实现 OAuth / token refresh、不维护跨命令后台连接。

33. **Plugin / Skill manifest schema**（已完成 Phase28 基础实现）
   - 已增加 `plugins schema` 和 `plugins schema --json`。
   - schema 覆盖 `plugin.json` / `skill.json` 的共享 manifest shape。
   - 文档化必填字段 `id/name/version`、可选 `tools/permissions/promptFragments` 和 tool `input_schema`。
   - Phase28 本身不执行 plugin 自带代码，不改变 Plugin / Skill runtime 加载语义；sandbox runtime 基础路径已在 Phase35 补齐。

34. **Plugin package example**（已完成 Phase29 基础实现）
   - `examples/plugins/demo-plugin/` 已扩展为 manifest-only package。
   - 包含 README、`plugin.json`、输入 fixture 和期望输出 fixture。
   - `examples/plugins/README.md` 说明当前示例边界和检查命令。
   - 示例包仍不包含 plugin-owned executable code。

35. **Plugin / Skill sandbox runtime**（已完成 Phase35 基础实现）
   - 已新增 manifest `runtime` 字段，第一版支持 `kind: "node-subprocess"`。
   - plugin-owned tool handler 在 TS Host 管理的子进程中执行，不 import 到 TS Host 主进程。
   - tool input / output 使用稳定 JSON envelope，并映射到现有 `ToolExecutionResult`。
   - entry 路径限制在 plugin root 内；env 只允许 allowlist key，diagnostics 不泄露 value。
   - 已增加 executable plugin 示例、unit、integration 和 CLI smoke 覆盖。

36. **Plugin / Skill config entry**（已完成 Phase36 基础实现）
   - 已增加 `GOD_CODE_PLUGIN_DIRS`、`GOD_CODE_PLUGIN_ENABLED_IDS` 和 `GOD_CODE_PLUGIN_CONFIG_FILE`。
   - env 配置优先于配置文件；配置文件中相对 plugin dir 按配置文件所在目录解析。
   - `prepareGodCodeHost()` 会加载显式配置的 plugin runtime，并把 executable tools 合并进 tool catalog。
   - 已增加 `plugins inspect-config` 和 `plugins inspect-config --json`。
   - `tools list/inspect` 和 `run --json --raw-events 'tool <tool_name> <json>'` 可覆盖 runtime-backed plugin tools。

37. **Plugin / Skill local registry**（已完成 Phase37 基础实现）
   - 已增加 `GOD_CODE_PLUGIN_REGISTRY_FILE`，集中声明本地 plugin / skill package。
   - registry entry 支持 `id`、`path`、`enabled` 和 `tags`。
   - enabled entries 会进入 headless tool catalog；disabled entries 只在 list / inspect 中展示。
   - 已增加 `plugins list` / `plugins list --json` 和 `plugins inspect <plugin_id>` / `--json`。
   - 当前不做 marketplace 下载、安装脚本、自动扫描或远程 registry。

38. **Session history gzip compression**（已完成 Phase30 基础实现）
   - 已增加 `sessions archive compress <session_id> --yes` 和 `--json`。
   - archived `.jsonl.gz` 支持 list / replay / search / restore / delete。
   - restore 压缩归档时会解压回 active `.jsonl`。
   - 当前不压缩 active transcript，不做 cleanup 自动 gzip 或批量压缩。

39. **Session history search index**（已完成 Phase31 基础实现）
   - 已增加 `sessions index build` 和 `sessions index build --include-archive --json`。
   - 已增加 `sessions index search <query>` 和 `--json`。
   - index 写入 `<transcriptDir>/search-index.json`，可覆盖 active transcript 和 archived `.jsonl` / `.jsonl.gz`。
   - 当前普通 search 不隐式走 index，不做跨目录全局索引；自动增量索引已在 Phase32 补齐。

40. **Session history incremental index refresh**（已完成 Phase32 基础实现）
   - 已增加 `sessions index refresh` 和 `sessions index refresh --include-archive --json`。
   - `sessions index search <query> --refresh` 可在搜索前增量刷新 index。
   - refresh 按 source file path / scope / mtime / size 复用未变化 session，报告 added / updated / removed / unchanged。
   - 当前不做文件 watcher、后台自动刷新、内容 hash 或跨目录全局索引。

41. **CLI 诊断收尾**
   - provider 配置检查，但不默认发真实 HTTP。（已完成基础实现）
   - 显式 provider health check。（已完成 Phase17 基础实现）
   - provider contract tests。（已完成 Phase19 基础实现）
   - provider config inspection。（已完成 Phase20 基础实现）
   - MCP / Plugin 诊断 CLI。（已完成 Phase18 基础实现）
   - tool schema 详情输出。（已完成基础实现）
   - 更稳定的 CLI JSON 输出 contract 文档。（已完成基础实现）
   - 统一错误码和退出码说明。（已完成基础实现）

42. **Provider retry policy**（已完成 [Phase53 基础实现](design/PHASE_53_PROVIDER_RETRY_POLICY.md)）
   - 已增加 `GOD_CODE_PROVIDER_MAX_RETRIES`、`GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS` 和 `GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS`。
   - 已把 HTTP 429/5xx、timeout 和临时网络错误标记为 retryable，保留 4xx/config/response validation 为非 retryable。
   - 非 streaming 请求可按 bounded exponential backoff 重试；streaming 只允许在首个 provider event 之前重试。
   - diagnostics 只展示 retry metadata，不泄露 API key、Authorization header、request body 或 provider raw response。
   - Phase53 本身不包含 fallback chain、billing/token budget、adaptive rate-limit scheduler 或 JSON-RPC 变更。

43. **Provider fallback chain**（已完成 [Phase54 基础实现](design/PHASE_54_PROVIDER_FALLBACK_CHAIN.md)）
   - 已增加 `GOD_CODE_PROVIDER_FALLBACKS` JSON array，显式配置 fallback provider/model/API-key env/base URL/timeout/retry。
   - fallback 只在当前 provider retryable failure 且自身 retry 耗尽后触发。
   - streaming 只允许在首个 provider event 之前 fallback；一旦输出 delta、assistant message 或 tool call，本 turn 不 fallback。
   - diagnostics 只展示 fallback provider metadata、API-key env 名称、presence、timeout 和 retry metadata，不泄露 secret。
   - 不做自动 provider discovery、能力协商、billing/token budget、rate-limit scheduler 或 JSON-RPC 变更。

44. **Anthropic Messages provider**（已完成 [Phase55 基础实现](design/PHASE_55_ANTHROPIC_MESSAGES_PROVIDER.md)）
   - 已新增 `anthropic` / `anthropic-compatible` provider family，复用现有 provider config、retry policy 和 fallback chain。
   - HTTP 请求、Messages content block 格式化、tool_use / tool_result 映射和 SSE streaming 聚合都留在 Python `providers/` 层。
   - 首版只支持 assistant text 和单个 client-side tool call；Phase84 后已补显式 opt-in 的 provider-native 多 tool_use 归一化，仍不做 server-side tools、extended thinking UI、prompt caching、billing/token budget 或 JSON-RPC 变更。
   - diagnostics 只展示 provider/model/API-key env presence、base URL、timeout、retry/fallback 和可选版本 metadata，不泄露 secret/header/raw response。

45. **Context budget and deterministic compaction**（已完成 [Phase56 基础实现](design/PHASE_56_CONTEXT_BUDGET_COMPACTION.md)）
   - 已在现有 `PromptBuilder -> CompactionStrategy -> ModelRequest` 边界增加显式 context budget。
   - 默认仍为 noop；只有显式配置后才启用 deterministic character-budget compaction。
   - compaction 只影响 provider 收到的 `ModelRequest.messages`，不重写 transcript、不改 provider clients、不改 tool execution。
   - 首版不做精确 tokenizer、LLM 摘要、向量检索、provider billing、价格预算或 JSON-RPC 方法变更。

46. **Local OpenAI-compatible provider**（已完成 [Phase57 基础实现](design/PHASE_57_LOCAL_OPENAI_COMPAT_PROVIDER.md)）
   - 已新增 `local-openai-compatible` provider family，复用 OpenAI-compatible Chat Completions formatter / mapper / streaming 路径。
   - 已允许本地 OpenAI-compatible endpoint 不配置 API key；如配置 `GOD_CODE_API_KEY_ENV`，仍按 bearer token 发送并保持诊断脱敏。
   - 默认 provider 仍是 `fake`，`doctor` 仍不自动探测本地 HTTP endpoint。
   - 首版不做 Ollama-native / llama.cpp-native API、模型发现、模型安装、local daemon lifecycle、billing/token budget 或 JSON-RPC 方法变更。

47. **Provider usage accounting and budget guard**（已完成 [Phase58 基础实现](design/PHASE_58_PROVIDER_USAGE_BUDGET_GUARD.md)）
   - 已在 provider 层解析 OpenAI-compatible / Responses / Anthropic 返回的 usage metadata。
   - 已增加显式预算 guard，用 provider-reported input/output/total tokens 做可配置上限检查。
   - 默认不启用预算限制，不影响 fake provider、本地 smoke 或现有 provider 请求。
   - 首版不做精确 tokenizer、价格表、账户 billing、持久 spend ledger、rate-limit scheduler 或 JSON-RPC 方法变更。

48. **Provider-specific error mapping**（已完成 [Phase59 基础实现](design/PHASE_59_PROVIDER_ERROR_MAPPING.md)）
   - 已在 provider 层增加 sanitized error metadata，把 OpenAI-compatible / Responses / Anthropic 的 HTTP/API 错误映射为稳定本地分类。
   - 已复用 Phase53 / Phase54 的 retryable 字段和 fallback 边界，不新增 retry 系统。
   - 已保护 provider raw error body、headers、prompt、completion 和 API key，不把敏感内容输出到 CLI / diagnostics / JSON-RPC。
   - 首版不做 provider SDK、provider dashboard、账户级故障诊断、OAuth refresh 或 JSON-RPC 方法变更。

49. **System prompt builder**（已完成 [Phase60 基础实现](design/PHASE_60_SYSTEM_PROMPT_BUILDER.md)）
   - 已在 Python `PromptBuilder -> ModelRequest` 边界增加独立 system prompt builder。
   - 已让 system prompt 不进入 `SessionState.messages`、不写 transcript history、也不被 Phase56 history compaction 移除。
   - 已让 OpenAI-compatible / Responses / Anthropic provider clients 按各自 request shape 编码同一份 `ModelRequest.system_prompt`。
   - 首版不做远程 prompt registry、自动项目扫描、prompt injection classifier、retrieval、语义摘要或 JSON-RPC 方法变更。

50. **Token budget manager**（已完成 [Phase61 基础实现](design/PHASE_61_TOKEN_BUDGET_MANAGER.md)）
   - 已在 Python `PromptBuilder -> ModelRequest` 边界增加本地估算型 token budget manager。
   - 已分别估算 system prompt、compacted history messages、tool schema、provider context 和 model options 的输入预算。
   - 已保持 Phase58 provider-reported usage budget guard 独立，不把本地估算当作 billing 或精确 provider tokenizer。
   - 已保持 JSON-RPC method set、transcript history、tool execution payload、MCP / plugin payload 不变。

51. **Summary compaction strategy**（已完成 [Phase62 基础实现](design/PHASE_62_SUMMARY_COMPACTION_STRATEGY.md)）
   - 已在 Python `PromptBuilder -> CompactionStrategy -> ModelRequest` 边界增加 summary-oriented compaction strategy。
   - 已把旧 history 压缩成稳定 summary message，同时保留近期 user / assistant / tool_call / tool_result 流和 tool pair 完整性。
   - 已保持 transcript JSONL append-only，不把 summary 写回 `SessionState.messages` 或 transcript history。
   - 已保持 JSON-RPC method set、tool execution payload、MCP / plugin payload 不变。

52. **Prompt injection guard**（已完成 [Phase63 基础实现](design/PHASE_63_PROMPT_INJECTION_GUARD.md)）
   - 已在 Python `PromptBuilder -> ModelRequest` 边界增加本地 deterministic prompt injection guard。
   - 已扫描 compacted messages、tool results、summary messages 和 provider context，输出 sanitized finding metadata。
   - 默认 report-only，不改变工具权限、不改 provider request text、不写 transcript history。
   - 已保持 JSON-RPC method set、tool execution payload、MCP / plugin payload 不变。

53. **Provider rate limit policy**（已完成 [Phase64 基础实现](design/PHASE_64_PROVIDER_RATE_LIMIT_POLICY.md)）
   - 已在 Python `providers/` 层增加本地 process-scope request throttle，默认关闭。
   - 已支持 fail-fast / bounded-wait 两种策略，并用 sanitized metadata 接入 provider diagnostics。
   - 已让 retry / fallback 的每个具体 provider attempt 都经过 limiter，streaming 只在首个 provider event 前检查。
   - 已保持 JSON-RPC method set、tool execution payload、MCP / plugin payload 不变；不做 provider quota API、跨进程 limiter、持久 spend ledger 或 provider billing。

54. **Local provider daemon lifecycle**（已完成 [Phase65 基础实现](design/PHASE_65_LOCAL_PROVIDER_DAEMON_LIFECYCLE.md)）
   - 已把本地 provider daemon 状态、dry-run start / stop 和显式确认生命周期命令放在 TS Host CLI 层。
   - 只服务 `local-openai-compatible`，默认不自动启动 daemon，不从普通 `run` / `repl` / `doctor` 触发。
   - 已用 marker file 约束 stop 边界，只停止 GOD-code 启动并记录的本地 daemon。
   - 已保持 JSON-RPC method set、Python Engine、provider wire-format 不变；不做模型安装 / pull 或系统服务注册。

55. **Local provider model discovery**（已完成 [Phase66 基础实现](design/PHASE_66_LOCAL_PROVIDER_MODEL_DISCOVERY.md)）
   - 已新增 `provider local-models list` 显式诊断命令，用于查询本地 OpenAI-compatible `GET /models` endpoint。
   - 只服务 `local-openai-compatible`，不自动启动 daemon，不修改 `GOD_CODE_MODEL` 或任何配置文件。
   - 模型发现保留在 TS Host CLI 诊断边界，Python Engine、provider request path、transcript、MCP / plugin 和 JSON-RPC method set 不变。
   - 本阶段只实现模型发现；模型安装 / pull 已由 Phase67 基础实现覆盖，Ollama-native / llama.cpp-native API、自动模型选择和 context-window discovery 仍不纳入。

56. **Local provider model pull command**（已完成 [Phase67 基础实现](design/PHASE_67_LOCAL_PROVIDER_MODEL_PULL.md)）
   - 已新增 `provider local-models pull <model>` 显式命令，用用户配置的本地命令模板执行模型 pull/install。
   - 默认 dry-run，真实执行必须显式 `--yes`，且只服务 `local-openai-compatible`。
   - 模型 pull 保留在 TS Host CLI 进程执行边界，不进入 Python Engine、provider clients、transcript、MCP / plugin 或 JSON-RPC method set。
   - 本阶段不做 Ollama-native / llama.cpp-native API、自动模型选择、模型删除、系统运行时安装或后台 pull job。

57. **Local provider model remove command**（已完成 [Phase68 基础实现](design/PHASE_68_LOCAL_PROVIDER_MODEL_REMOVE.md)）
   - 已新增 `provider local-models remove <model>` 显式命令，用用户配置的本地命令模板执行模型 remove/delete。
   - 默认 dry-run，真实删除必须显式 `--yes`，且只服务 `local-openai-compatible`。
   - 模型 remove 保留在 TS Host CLI 进程执行边界，不进入 Python Engine、provider clients、transcript、MCP / plugin 或 JSON-RPC method set。
   - 本阶段不做 Ollama-native / llama.cpp-native API、自动模型选择、直接文件删除、批量 prune 或缓存配额管理。

58. **Local provider model prune command**（已完成 [Phase69 基础实现](design/PHASE_69_LOCAL_PROVIDER_MODEL_PRUNE.md)）
   - 已新增 `provider local-models prune --target <target>` 显式命令，用用户配置的本地命令模板执行 target-scoped prune。
   - 默认 dry-run，真实 prune 必须显式 `--yes`，并要求目标出现在 `GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS`。
   - 模型 prune 已保留在 TS Host CLI 进程执行边界，不进入 Python Engine、provider clients、transcript、MCP / plugin 或 JSON-RPC method set。
   - 本阶段仍不做 runtime-native prune API、直接文件删除、自动缓存配额管理、LRU cleanup 或后台 cleanup daemon。

59. **Session transcript timeline diagnostics**（已完成 [Phase70 基础实现](design/PHASE_70_SESSION_TRANSCRIPT_TIMELINE.md)）
   - 已新增 `sessions timeline <session_id>` 和 `sessions archive timeline <session_id>`，把单个 transcript 显示为紧凑事件时间线。
   - 默认输出 bounded preview，支持 `--json`、`--no-preview` 和 `--preview-chars`，用于快速定位 turn / tool / error-like 事件。
   - timeline 已保留在 TS Host session-history 层，不启动 Python Engine，不执行工具，不刷新 index，不改变 transcript JSONL 格式。
   - 本阶段不做 TUI、图形化 timeline、LLM 摘要、跨目录全局 discovery 或 live process 恢复。

60. **Plugin / Skill local registry install command**（已完成 [Phase71 基础实现](design/PHASE_71_PLUGIN_LOCAL_REGISTRY_INSTALL.md)）
   - 已新增 `plugins install <plugin_or_skill_dir>`，用于把本地 plugin / skill package 以 dry-run / `--yes` 方式写入本地 registry。
   - 已复用 Phase37 registry 语义：只写 registry JSON，不运行 plugin runtime code，不改变默认加载行为。
   - 已支持 manifest 校验、相对 registry file 的路径写入、重复 id 处理、`--replace`、`--enable` / `--disable`、tags 和结构化 JSON 输出。
   - 本阶段仍不做远程 marketplace、下载安装、安装脚本、依赖安装、持久 plugin daemon、系统级 sandbox 或 JSON-RPC 变更。

61. **Plugin / Skill local registry uninstall command**（已完成 [Phase72 基础实现](design/PHASE_72_PLUGIN_LOCAL_REGISTRY_UNINSTALL.md)）
   - 已新增 `plugins uninstall <plugin_id>`，用于把本地 plugin / skill entry 以 dry-run / `--yes` 方式从本地 registry 移除。
   - 已复用 Phase37 / Phase71 registry 语义：只写 registry JSON，不删除 package directory，不运行 plugin runtime code。
   - 已支持 registry file 显式解析、missing id 处理、`--missing-ok`、结构化 JSON 输出和未知 registry 字段保留。
   - 本阶段仍不做远程 marketplace、下载安装、安装脚本、依赖卸载、持久 plugin daemon、系统级 sandbox 或 JSON-RPC 变更。

62. **Plugin / Skill local registry enable / disable command**（已完成 [Phase73 基础实现](design/PHASE_73_PLUGIN_LOCAL_REGISTRY_ENABLE_DISABLE.md)）
   - 已新增 `plugins enable <plugin_id>` 和 `plugins disable <plugin_id>`，用于以 dry-run / `--yes` 方式切换本地 registry entry 的 `enabled` 状态。
   - 已复用 Phase37 / Phase71 / Phase72 registry 语义：只写 registry JSON，不安装、卸载、删除或运行 plugin runtime code。
   - 已支持 missing `enabled` 视为有效启用、no-op 识别、结构化 JSON 输出和未知 registry 字段保留。
   - 本阶段仍不做远程 marketplace、下载安装、生命周期脚本、runtime hot-load / unload、持久 plugin daemon、系统级 sandbox 或 JSON-RPC 变更。

63. **Plugin / Skill local registry tags command**（已完成 [Phase74 基础实现](design/PHASE_74_PLUGIN_LOCAL_REGISTRY_TAGS.md)）
   - 已新增 `plugins tags <plugin_id>`，用于以 dry-run / `--yes` 方式调整本地 registry entry 的 `tags` 元数据。
   - 已复用 Phase37 / Phase71 / Phase72 / Phase73 registry 语义：只写 registry JSON，不安装、卸载、删除或运行 plugin runtime code。
   - 已支持 `--add`、`--remove`、`--set`、`--clear`、tag 校验、no-op 识别、结构化 JSON 输出和未知 registry 字段保留。
   - 本阶段仍不做远程 marketplace、下载安装、远程 tag 搜索或同步、生命周期脚本、持久 plugin daemon、系统级 sandbox 或 JSON-RPC 变更。

64. **Session global transcript search**（已完成 [Phase75 基础实现](design/PHASE_75_SESSION_GLOBAL_TRANSCRIPT_SEARCH.md)）
   - 已新增 `sessions global-search <query>`，用于跨多个显式 transcript roots 做本地只读搜索。
   - 已支持 `--root <transcript_dir>`、`--include-current`、`GOD_CODE_TRANSCRIPT_SEARCH_DIRS`、`--include-archive`、`--max-results` 和 JSON 输出。
   - 已复用现有 active / archived transcript search 语义，输出 root-aware matches 和 per-root diagnostics。
   - 本阶段仍不做自动 transcript root discovery、后台 watcher、跨 root mutation、persistent global index、语义搜索、Python Engine 或 JSON-RPC 变更。

65. **Session transcript root discovery diagnostics**（已完成 [Phase76 基础实现](design/PHASE_76_SESSION_TRANSCRIPT_ROOT_DISCOVERY.md)）
   - 已新增 `sessions roots`，用于在显式 `--search-root` 下受限发现 `.god-code/transcripts` roots。
   - 已支持 `--search-root`、`--include-current`、`GOD_CODE_TRANSCRIPT_ROOT_SEARCH_DIRS`、`--max-depth`、`--limit`、`--include-empty` 和 JSON 输出。
   - 已只统计 transcript 文件数量和 search index 是否存在，不读取 transcript payload。
   - 本阶段仍不做无界 home/workspace 扫描、symlink 跟随、后台 watcher、persistent cache、语义搜索、跨 root mutation、Python Engine 或 JSON-RPC 变更。

66. **Discovery-backed global transcript search**（已完成 [Phase77 基础实现](design/PHASE_77_DISCOVERY_BACKED_GLOBAL_TRANSCRIPT_SEARCH.md)）
   - 已扩展 `sessions global-search <query>`，允许显式 `--search-root <workspace>` 后复用 Phase76 的 bounded discovery，再交给 Phase75 的 root-aware search。
   - 已保留现有 `--root`、`--include-current`、`GOD_CODE_TRANSCRIPT_SEARCH_DIRS`、`--include-archive`、`--max-results` 和 JSON 输出行为。
   - 已新增 discovery diagnostics，展示 search roots、discovered roots、depth/limit 和 truncation metadata。
   - 本阶段仍不做无界 home/workspace 扫描、symlink 跟随、后台 watcher、persistent cache/index、语义搜索、跨 root mutation、Python Engine 或 JSON-RPC 变更。

67. **Session transcript watch diagnostics**（已完成 [Phase78 基础实现](design/PHASE_78_SESSION_TRANSCRIPT_WATCH_DIAGNOSTICS.md)）
   - 已新增短生命周期 `sessions watch`，用于在显式 transcript roots 或 bounded discovery roots 下观察 transcript 文件变化。
   - 已支持 `--root`、`--include-current`、`--search-root`、`--include-archive`、`--max-events`、`--timeout-ms` 和 JSON 输出。
   - 已只记录文件事件和少量 metadata，不读取 transcript payload，不自动刷新 search index。
   - 本阶段仍不做后台 daemon、跨命令 watcher、无界 home/workspace watch、symlink 跟随、自动 index refresh、语义搜索、Python Engine 或 JSON-RPC 变更。

68. **Session index watch-refresh diagnostics**（已完成 [Phase79 基础实现](design/PHASE_79_SESSION_INDEX_WATCH_REFRESH.md)）
   - 已新增显式短生命周期 `sessions index watch-refresh`，组合 Phase78 watcher 与 Phase32 incremental index refresh。
   - 已支持 `--root`、`--include-current`、`--search-root`、`--include-archive`、`--max-events`、`--timeout-ms`、`--debounce-ms`、`--refresh-on-timeout` 和 JSON 输出。
   - 已只在该显式命令内根据 transcript 文件事件触发本地 index refresh；不会改变普通 `sessions search` 或 `sessions watch` 语义。
   - 本阶段仍不做后台 daemon、跨命令 watcher、隐式自动 refresh、无界 home/workspace watch、全局 persistent index、语义搜索、Python Engine 或 JSON-RPC 变更。

69. **Interactive permission approval UI**（已完成 [Phase80 基础实现](design/PHASE_80_INTERACTIVE_PERMISSION_APPROVAL.md)）
   - 已把 Phase1 预留的 `PolicyDecision.action === "prompt"` 接入显式、可选的 TS Host 终端确认流程。
   - 已支持 `god-code run --approval-mode prompt`、`god-code repl --approval-mode prompt` 和 `sessions resume --approval-mode prompt`。
   - 已保持默认行为不变：未启用 approval prompt 时，`prompt` 仍按 deny 处理。
   - 已保证 approval prompt 写 stderr，非交互场景 fail closed，不污染 `--json` stdout。
   - 本阶段不改 Python Engine、provider、MCP protocol、plugin manifest、transcript schema 或 JSON-RPC method set。

70. **Multi session runtime**（已完成 [Phase81 基础实现](design/PHASE_81_MULTI_SESSION_RUNTIME.md)）
   - 已把 Python Engine 的 `SessionManager` 从单例 session 改为 session map。
   - 已保持现有 JSON-RPC method set 和 request/response shape 不变，因为现有协议已经携带 `session_id`。
   - 已允许一个 Python Engine process 中存在多个 active sessions，并允许不同 session 各自有一个 active turn。
   - 已继续拒绝同一 session 内的多 active turns。
   - 本阶段不做 multi-session CLI UX、TUI session switcher、多工具并发、session daemon、持久 live process restore、transcript schema 或 provider API 变更。

71. **Multi tool concurrent scheduling**（已完成 [Phase82 基础实现](design/PHASE_82_MULTI_TOOL_CONCURRENT_SCHEDULING.md)）
   - 已新增 Python 内部 `ToolCallBatchAction` 和 `ToolScheduler.execute_many(...)`。
   - 已只并发 read-only safe tools（`Read`、`ListFiles`、`Search`），mutating、shell、MCP、plugin、skill 和未知工具默认 serial-only。
   - 已保持现有 `execute_tool` JSON-RPC 方法不变，通过多个普通 in-flight requests 表达并发。
   - 已保持 Phase80 approval、TS Host permission/audit/cancel 和 Phase81 per-session active turn 门禁兼容。
   - 仍不启用 provider-native parallel tool calls，不改 provider API、transcript schema、JSON-RPC request/response shape 或 TS Host batch API。

72. **Session advanced recovery**（已完成 [Phase83 基础实现](design/PHASE_83_SESSION_ADVANCED_RECOVERY.md)）
   - 已新增 TS Host transcript/history 侧 recovery planner。
   - 已新增 `sessions recover` dry-run / JSON / raw-events workflow。
   - 已支持 `strict` / `best-effort` / `compact` 恢复策略。
   - 已复用现有 `create_session.initial_messages` 和 recovered session headless flow。
   - 仍不恢复 live process、不重放历史工具、不改 transcript schema、不新增 Python Engine replay RPC 或 JSON-RPC method。

73. **Provider-native parallel tool calls**（已完成 [Phase84 基础实现](design/PHASE_84_PROVIDER_NATIVE_PARALLEL_TOOL_CALLS.md)）
   - 已新增 provider tool-use policy / `GOD_CODE_PROVIDER_PARALLEL_TOOL_CALLS=false` 默认关。
   - 已支持 OpenAI-compatible / Responses / Anthropic provider 在显式 opt-in 下把多个原生 tool calls 归一化为 Python `ToolCallBatchAction`。
   - 已保持默认单 tool-call / fail-closed 行为，并保留 provider contract tests 对默认 `parallel_tool_calls=false` 的断言。
   - 已继续让 Phase82 `ToolScheduler` 决定真实执行 waves。
   - 未新增 JSON-RPC method、TS Host batch API、transcript schema 或 provider API rewrite。

74. **Tool dependency graph scheduling**（已完成 [Phase85 基础实现](design/PHASE_85_TOOL_DEPENDENCY_GRAPH_SCHEDULING.md)）
   - 已在 Python `ToolScheduler` 内把线性 contiguous waves 演进为 deterministic dependency graph plan。
   - 已新增 `ToolExecutionPlan` / `ToolDependencyEdge` / `ToolSchedulingNode` 等 Python 内部结构。
   - 已基于工具名和输入路径做本地、保守的依赖推断。
   - 已继续让 mutating、shell、MCP、plugin、skill、unknown 或 malformed 工具保持 serial-only / conservative。
   - 未新增 JSON-RPC method、TS Host batch API、transcript schema、provider API rewrite 或 LLM-generated dependency graph。

75. **TUI session dashboard**（已完成 [Phase86 基础实现](design/PHASE_86_TUI_SESSION_DASHBOARD.md)）
   - TS Host 侧新增最小 `god-code tui` terminal UI shell。
   - 复用 Phase10 REPL / Phase70 timeline / Phase75-79 session history diagnostics / Phase80 approval prompt / Phase81 session runtime。
   - 新增可测试的 TUI state / renderer / input / controller 分层，当前实现位于 `ts-host/src/cli/tui*.ts`。
   - 支持单 live session、prompt 提交、事件流摘要、取消和最近 history summary。
   - 未新增 JSON-RPC method、Python Engine TUI awareness、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

76. **TUI interaction polish**（已完成 [Phase87 基础实现](design/PHASE_87_TUI_INTERACTION_POLISH.md)）
   - 已继续增强 Phase86 的最小 TUI，而不是新增协议或替换 REPL。
   - 已新增 `TuiScreen` terminal screen driver，使 raw-mode TUI 进入 alternate screen、原地刷新并在退出/异常时恢复终端状态。
   - 已为 history pane 增加 selected-session timeline detail panel，复用现有 transcript timeline helper。
   - 已为 approval prompt mode 增加安全 suspend/redraw bridge；Phase88 已进一步升级为 TUI modal approval。
   - 已补充 terminal control output、timeline detail、输入键和 controller 单元测试；PTY smoke 仍作为可选后续项。
   - 继续保持无 JSON-RPC method、Python Engine TUI awareness、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

77. **TUI modal approval**（已完成 [Phase88 基础实现](design/PHASE_88_TUI_MODAL_APPROVAL.md)）
   - 已新增 `TuiModalApprovalPrompt`，在 raw-mode TUI 内以 modal section 处理 approval 请求。
   - 已支持 `y/Y` allow、`n/N` deny、`Esc` deny。
   - 已在 modal 存在时阻止普通 prompt 编辑和提交。
   - 已保留现有 `ToolApprovalPrompt` contract 和 host tool execution boundary。
   - 已补充 modal allow/deny/abort/overlap、renderer 和 state 测试。
   - 未新增 JSON-RPC method、Python Engine TUI awareness、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

78. **TUI pane scrolling**（已完成 [Phase89 基础实现](design/PHASE_89_TUI_PANE_SCROLLING.md)）
   - 已为 events / history / timeline 增加独立 scroll offsets。
   - 已新增 `scroll_pane` reducer action 和 `timeline` pane。
   - 已支持 PageUp / PageDown，以及 events / timeline 的 Up / Down 滚动。
   - 已保留 history pane 的 Up / Down session selection 行为。
   - 已在 renderer 中增加 offset window 和 compact offset label。
   - 未新增 JSON-RPC method、Python Engine TUI awareness、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

79. **TUI assistant stream coalescing**（已完成 [Phase90 基础实现](design/PHASE_90_TUI_ASSISTANT_STREAM_COALESCING.md)）
   - 已新增 `TuiEvent.streaming`、`append_assistant_delta` 和 `finalize_assistant_message`。
   - 已把连续 `assistant_delta` 合并为单条 streaming assistant event。
   - 已在最终 `assistant_message` 到达时 finalize streaming row，并避免重复整段 assistant 输出。
   - 已保持 REPL / headless streaming 和 JSON-RPC event stream 不变。
   - 未新增 JSON-RPC method、Python Engine TUI awareness、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

80. **TUI keyboard help overlay**（已完成 [Phase91 基础实现](design/PHASE_91_TUI_KEYBOARD_HELP_OVERLAY.md)）
   - 已新增 `buildTuiHelpLines(...)` 纯函数。
   - 已按 prompt / events / history / timeline / help pane 输出 pane-aware 快捷键说明。
   - 已在 approval modal pending 时优先展示 `y/n/Esc` 决策帮助。
   - 已在 running turn 时展示 Ctrl-C cancel，而 idle 时展示 Enter submit / Ctrl-C quit。
   - 已接入 renderer 并补充 focused tests。
   - 未新增 JSON-RPC method、Python Engine TUI awareness、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

81. **TUI adaptive layout**（已完成 [Phase92 基础实现](design/PHASE_92_TUI_ADAPTIVE_LAYOUT.md)）
   - 已在 `tuiRenderer.ts` 中新增 compact renderer path。
   - 已在小终端下优先保留 header、prompt、active/prioritized section 和 footer。
   - 已让 approval modal 在 compact layout 中优先展示。
   - 已让 help overlay 在 compact layout 中优先展示。
   - 已保持大终端 full dashboard 行为兼容。
   - 未新增 JSON-RPC method、Python Engine TUI awareness、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

82. **TUI debug diagnostics**（已完成 [Phase93 基础实现](design/PHASE_93_TUI_DEBUG_DIAGNOSTICS.md)）
   - 已新增 `buildTuiDebugLines(...)` 纯函数。
   - 已新增 `debugVisible` state、`toggle_debug` reducer action 和 `Ctrl-G` key mapping。
   - 已在 full / compact renderer 中展示 bounded debug snapshot。
   - 已避免输出 raw provider payload、tool input、headers、secrets 或 full transcript。
   - 已补充 focused tests。
   - 未新增 JSON-RPC method、Python Engine TUI awareness、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

83. **TUI pane focus style**（已完成 [Phase94 基础实现](design/PHASE_94_TUI_PANE_FOCUS_STYLE.md)）
   - 已新增 `paneTitle(...)` renderer helper。
   - 已在 full layout 中用 `* ` 标记 active pane section title。
   - 已在 compact layout 中复用同一 active pane marker。
   - 已保持 approval/debug overlay title 稳定，不把 overlay 伪装成 focus pane。
   - 已补充 focused renderer tests。
   - 未新增 JSON-RPC method、Python Engine TUI awareness、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

84. **TUI PTY smoke harness**（已完成 [Phase95 基础实现](design/PHASE_95_TUI_PTY_SMOKE_HARNESS.md)）
   - 已新增 `runTuiPtySmoke(...)` smoke harness。
   - 已用 deterministic smoke state 覆盖 `TuiScreen.start()` / `render(...)` / `stop()` lifecycle。
   - 已在非 TTY 输出下返回 structured `skipped`，避免写入 terminal control sequence。
   - 已补充 focused smoke harness tests。
   - 未新增 JSON-RPC method、Python Engine TUI awareness、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

85. **TUI session switcher**（已完成 [Phase96 基础实现](design/PHASE_96_TUI_SESSION_SWITCHER.md)）
   - 已新增 `viewedSessionId` TUI state。
   - 已新增 `activate_history_session` reducer action 和 history-pane `Enter` key mapping。
   - 已在 renderer header 中区分 live session 与 viewed transcript session。
   - 已在 history row 中用 `>` 标记 keyboard selection、用 `*` 标记 viewed session。
   - 已复用现有 timeline loading path，不新增 live multi-session runtime。
   - 已补充 focused state/input/renderer/help/debug tests。
   - 未新增 JSON-RPC method、Python Engine TUI awareness、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

86. **TUI live session switching**（已完成 [Phase97 基础实现](design/PHASE_97_TUI_LIVE_SESSION_SWITCHING.md)）
   - 已新增 `liveSessions` 和 `activeLiveSessionIndex` TUI state。
   - 已新增 `create_live_session` / `switch_live_session` actions。
   - 已新增 `Ctrl-N` 创建 live session、`Ctrl-P` 切换 previous live session。
   - 已在 `TuiController` 中维护多个 `TuiSessionLike` 实例并在 shutdown 时全部停止。
   - 已让 prompt submission / cancel 继续作用于当前 active live session。
   - 已补充 focused state/input/controller/renderer/help/debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

87. **TUI live session list pane**（已完成 [Phase98 基础实现](design/PHASE_98_TUI_LIVE_SESSION_LIST_PANE.md)）
   - 已新增 `live` pane。
   - 已新增 `selectedLiveSessionIndex` 和 `liveSessionScrollOffset` TUI state。
   - 已新增 `select_live_session` / `activate_live_session` actions。
   - 已让 live pane 支持 Up/Down 选择、Enter 激活、PageUp/PageDown 滚动。
   - 已在 full / compact renderer 中展示 live session list，并区分 selected `>` 与 active `*`。
   - 已补充 focused state/input/controller/renderer/help/debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

88. **TUI per-session event buffers**（已完成 [Phase99 基础实现](design/PHASE_99_TUI_PER_SESSION_EVENT_BUFFERS.md)）
   - 已新增 `eventsBySessionId` TUI state。
   - 已让 `session_started` 初始化 / 恢复 active session event buffer。
   - 已让 `append_event`、`append_assistant_delta`、`finalize_assistant_message` 支持按 session id 写入。
   - 已按 GOD-code runtime event 的 `session_id` 路由 TUI events。
   - 已确保 background session events 不覆盖当前 active events pane。
   - 已补充 focused state tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

89. **TUI per-session status indicators**（已完成 [Phase100 基础实现](design/PHASE_100_TUI_PER_SESSION_STATUS_INDICATORS.md)）
   - 已为 `TuiLiveSessionItem` 新增 `status`。
   - 已让 active live session status 随 submit / finish / cancel / exit / error flow 更新。
   - 已在 live session list pane 中渲染 `[idle]` / `[running]` / `[stopping]` / `[stopped]` / `[error]`。
   - 已在 debug snapshot 中新增 `live_statuses`。
   - 已补充 focused state / renderer / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

90. **TUI per-session unread counters**（已完成 [Phase101 基础实现](design/PHASE_101_TUI_PER_SESSION_UNREAD_COUNTERS.md)）
   - 已为 `TuiLiveSessionItem` 新增 `unreadCount`。
   - 已让 background session events 增加目标 live session 的 unread count。
   - 已让 active session events 不增加 unread count。
   - 已在 live session list pane 中渲染非零 `unread:<n>`。
   - 已让 switch / activate live session 清零目标 session unread count。
   - 已在 debug snapshot 中新增 `live_unread`。
   - 已补充 focused state / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

91. **TUI live session close command**（已完成 [Phase102 基础实现](design/PHASE_102_TUI_LIVE_SESSION_CLOSE_COMMAND.md)）
   - 已新增 `close_live_session` TUI action。
   - 已新增 `Ctrl-W` close selected live session 输入映射。
   - 已让 reducer 支持关闭 selected idle live session，并保留至少一个 live session。
   - 已禁止关闭 running / stopping live session。
   - 已让关闭 active live session 时切换到确定性 fallback session 并恢复其 event buffer。
   - 已清理 closed session 的 per-session event buffer。
   - 已让 `TuiController` stop 并移除 closed `TuiSessionLike`。
   - 已同步 help / footer 快捷键文案。
   - 已补充 focused state / input / controller tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

92. **TUI live session pin command**（已完成 [Phase103 基础实现](design/PHASE_103_TUI_LIVE_SESSION_PIN_COMMAND.md)）
   - 已为 `TuiLiveSessionItem` 新增 `pinned`。
   - 已新增 `toggle_live_session_pin` TUI action。
   - 已新增 live pane `p` pin / unpin 输入映射。
   - 已让 pinned live sessions 排在 unpinned live sessions 前。
   - 已通过 session id 保持 reorder 后 active / selected session identity。
   - 已在 live session list pane 中渲染 `pinned` 标识。
   - 已在 debug snapshot 中新增 `live_pinned`。
   - 已补充 focused state / input / renderer / help / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

93. **TUI live session rename command**（已完成 [Phase104 基础实现](design/PHASE_104_TUI_LIVE_SESSION_RENAME_COMMAND.md)）
   - 已为 `TuiLiveSessionItem` 新增可选 `displayName`。
   - 已新增 `rename_live_session` TUI action。
   - 已新增 live pane `r` rename 输入映射。
   - 已支持从 `action.label` 或当前 prompt buffer 设置 selected live session display name。
   - 已保持底层 `sessionId` 不变，并在渲染中显示 `displayName (sessionId)`。
   - 已在 debug snapshot 中新增 `live_names`。
   - 已补充 focused state / input / renderer / help / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

94. **TUI live session filter**（已完成 [Phase105 基础实现](design/PHASE_105_TUI_LIVE_SESSION_FILTER.md)）
   - 已为 `TuiState` 新增 `liveSessionFilter`。
   - 已新增 `set_live_session_filter` / `clear_live_session_filter` TUI actions。
   - 已新增 live pane `f` filter / `u` unfilter 输入映射。
   - 已支持从 `action.filter` 或当前 prompt buffer 设置 live session filter。
   - 已让 live session list pane 只渲染匹配 filter 的 rows。
   - 已让 live pane selection 在过滤后的可见 rows 内移动。
   - 已在 debug snapshot 中新增 `live_filter`。
   - 已补充 focused state / input / renderer / help / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

95. **TUI live session sort modes**（已完成 [Phase106 基础实现](design/PHASE_106_TUI_LIVE_SESSION_SORT_MODES.md)）
   - 已新增 `TuiLiveSessionSortMode`。
   - 已为 `TuiState` 新增 `liveSessionSortMode`。
   - 已新增 `cycle_live_session_sort_mode` TUI action。
   - 已新增 live pane `s` sort 输入映射。
   - 已支持 `manual` / `name` / `status` / `unread` 排序模式。
   - 已让 pinned sessions 在所有 sort modes 中保持优先。
   - 已让 filtered visible-row selection 按当前 sort mode 移动。
   - 已在 live section title 和 debug snapshot 中暴露 sort mode。
   - 已补充 focused state / input / renderer / help / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

96. **TUI live session quick actions**（已完成 [Phase107 基础实现](design/PHASE_107_TUI_LIVE_SESSION_QUICK_ACTIONS.md)）
   - 已新增 live pane 数字快捷动作：`1` activate、`2` pin、`3` close、`4` sort、`5` filter、`0` unfilter。
   - 已保留既有 `Enter` / `p` / `r` / `f` / `u` / `s` / `Ctrl-W` 输入映射。
   - 已在 live pane 渲染 quick actions 提示行。
   - 已同步 footer、help overlay 和 debug snapshot 中的 quick action 可发现性。
   - 已补充 focused input / renderer / help / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

97. **TUI live session bulk actions**（已完成 [Phase108 基础实现](design/PHASE_108_TUI_LIVE_SESSION_BULK_ACTIONS.md)）
   - 已新增 `close_inactive_live_sessions` / `unpin_all_live_sessions` / `clear_all_live_session_unread` TUI actions。
   - 已新增 live pane `x` close inactive / `P` unpin all / `A` mark read 输入映射。
   - 已让 bulk close 保留 active live session，并跳过 running / stopping sessions。
   - 已让 controller 停止并移除被 bulk close 的 `TuiSessionLike` 对象。
   - 已在 live pane 渲染 bulk actions 提示行，并同步 footer / help / debug。
   - 已补充 focused reducer / input / renderer / controller / help / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

98. **TUI live session command palette**（已完成 [Phase109 基础实现](design/PHASE_109_TUI_LIVE_SESSION_COMMAND_PALETTE.md)）
   - 已新增 `TuiLiveSessionCommandId` 和 `TUI_LIVE_SESSION_COMMANDS` 本地命令列表。
   - 已为 `TuiState` 新增 `liveSessionCommandPaletteVisible` / `selectedLiveSessionCommandIndex`。
   - 已新增 `open_live_session_command_palette` / `close_live_session_command_palette` / `select_live_session_command` TUI actions。
   - 已新增 live pane `:` 打开命令面板、Up/Down 选择、Enter 执行、Esc 关闭输入映射。
   - 已让命令面板复用既有 TUI actions，controller-sensitive close / bulk close 仍走原 controller 边界。
   - 已在 live pane 渲染 command palette rows，并同步 help / debug。
   - 已补充 focused reducer / input / renderer / help / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

99. **TUI live session command search**（已完成 [Phase110 基础实现](design/PHASE_110_TUI_LIVE_SESSION_COMMAND_SEARCH.md)）
   - 已为 `TuiState` 新增 `liveSessionCommandSearch`。
   - 已新增 `visibleLiveSessionCommands(...)`，并让 `selectedLiveSessionCommand(...)` 尊重 command search。
   - 已新增 `append_live_session_command_search` / `backspace_live_session_command_search` / `clear_live_session_command_search` TUI actions。
   - 已让 command palette 打开时 printable input 进入 command search，而不是 prompt buffer。
   - 已支持 Backspace 编辑搜索、`/` 清空搜索、Up/Down 在过滤后的 command rows 内移动、Enter 执行过滤后的选中命令。
   - 已在 renderer / help / debug 中暴露 command search 状态。
   - 已补充 focused reducer / input / renderer / help / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

100. **TUI live session command categories**（已完成 [Phase111 基础实现](design/PHASE_111_TUI_LIVE_SESSION_COMMAND_CATEGORIES.md)）
   - 已新增 `TuiLiveSessionCommandCategory`。
   - 已为 `TUI_LIVE_SESSION_COMMANDS` 增加 `session` / `view` / `bulk` 分类 metadata。
   - 已为 `TuiState` 新增 `liveSessionCommandCategory`。
   - 已新增 `cycle_live_session_command_category` TUI action。
   - 已让 command palette 打开时 Tab 循环 `all` / `session` / `view` / `bulk` 分类。
   - 已让 `visibleLiveSessionCommands(...)` 同时应用 category filter 和 command search。
   - 已在 renderer / help / debug 中暴露 command category 状态。
   - 已补充 focused reducer / input / renderer / help / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

101. **TUI live session command grouping UI**（已完成 [Phase112 基础实现](design/PHASE_112_TUI_LIVE_SESSION_COMMAND_GROUPING_UI.md)）
   - 已让 command palette 按 command category 渲染 `-- <category> commands --` 分组标题。
   - 已复用 Phase111 的 `TUI_LIVE_SESSION_COMMANDS` category metadata，不新增独立分组状态。
   - 已让分组与 command search、category filter 组合工作。
   - 已保持 selection / execution 只作用于 command rows，group header 不可选。
   - 已在 help / debug 中暴露 command grouping UI。
   - 已补充 focused renderer / help / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

102. **TUI live session command favorites**（已完成 [Phase113 基础实现](design/PHASE_113_TUI_LIVE_SESSION_COMMAND_FAVORITES.md)）
   - 已为 `TUI_LIVE_SESSION_COMMANDS` 增加 `favorite` metadata。
   - 已将 `activate` 作为首个 favorite command。
   - 已让 command palette 渲染 `-- favorite commands --` 分组。
   - 已让 favorite grouping 与 command search、category filter 和 category grouping 组合工作。
   - 已保持 selection / execution 只作用于 command rows，favorite header 不可选。
   - 已在 help / debug 中暴露 command favorites。
   - 已补充 focused renderer / help / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

103. **TUI live session command history**（已完成 [Phase114 基础实现](design/PHASE_114_TUI_LIVE_SESSION_COMMAND_HISTORY.md)）
   - 已为 `TuiState` 增加 `liveSessionCommandHistory`。
   - 已让 command palette 执行路径携带 `source: "command_palette"`。
   - 已在 reducer 中记录 palette command execution history。
   - 已让 command history 按最近优先、去重和 bounded 方式保存。
   - 已在 command palette 中显示 `Recent commands: ...`。
   - 已让 command history display 与 command search、category filter 组合工作。
   - 已在 help / debug 中暴露 command history。
   - 已补充 focused reducer / input / renderer / help / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

104. **TUI live session command pinned history**（已完成 [Phase115 基础实现](design/PHASE_115_TUI_LIVE_SESSION_COMMAND_PINNED_HISTORY.md)）
   - 已为 `TuiState` 增加 `liveSessionPinnedCommandHistory`。
   - 已新增 `toggle_live_session_command_history_pin` TUI action。
   - 已让 command palette 打开时 `!` toggle selected visible command pin。
   - 已让 pinned command history 按最近 pin 优先、去重和 bounded 方式保存。
   - 已在 command palette 中显示 `Pinned commands: ...`。
   - 已让 pinned command display 与 command search、category filter 组合工作。
   - 已在 help / debug 中暴露 command pinned history。
   - 已补充 focused reducer / input / renderer / help / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

105. **TUI live session command history clear**（已完成 [Phase116 基础实现](design/PHASE_116_TUI_LIVE_SESSION_COMMAND_HISTORY_CLEAR.md)）
   - 已新增 `clear_live_session_command_history` TUI action。
   - 已让 command palette 打开时 `@` 清理 command history。
   - 已让 clear 同时清空 `liveSessionCommandHistory` 和 `liveSessionPinnedCommandHistory`。
   - 已保持 command palette 打开、selection / search 不变。
   - 已在 help 中暴露 command history clear。
   - 已补充 focused reducer / input / help tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

106. **TUI live session command usage counts**（已完成 [Phase117 基础实现](design/PHASE_117_TUI_LIVE_SESSION_COMMAND_USAGE_COUNTS.md)）
   - 已为 `TuiState` 增加 `liveSessionCommandUsageCounts`。
   - 已让 palette-sourced command execution 按 command id 累加 usage count。
   - 已让 command rows 显示非零 `uses:<count>`。
   - 已在 debug output 中暴露 `live_command_usage`。
   - 已让 command history clear 同时清空 usage counts。
   - 已补充 focused reducer / renderer / clear / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

107. **TUI live session command usage sorting**（已完成 [Phase118 基础实现](design/PHASE_118_TUI_LIVE_SESSION_COMMAND_USAGE_SORTING.md)）
   - 已为 `TuiState` 增加 `liveSessionCommandSortMode`，支持 `catalog` / `usage`。
   - 已增加 palette-local `^` 快捷键和 `cycle_live_session_command_sort_mode` action。
   - 已让 usage 排序保持 favorite / category 分组连续，并在组内按 usage 降序、catalog index 稳定回退。
   - 已让 search / category filter / selection 使用当前 command sort mode。
   - 已在 renderer header、help 和 debug output 中暴露 command sort mode。
   - 已补充 focused reducer / input / renderer / help / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

108. **TUI live session command usage ranking summary**（已完成 [Phase119 基础实现](design/PHASE_119_TUI_LIVE_SESSION_COMMAND_USAGE_RANKING_SUMMARY.md)）
   - 已增加共享派生函数 `rankedLiveSessionCommandUsage(...)`。
   - 已按当前 command search / category scope 生成非零 usage Top-3。
   - 已按 usage 降序排序，并以 catalog index 稳定回退。
   - 已在 command palette 中增加非 selectable `Usage ranking: ...` 摘要行。
   - 已在 debug output 中暴露 `live_command_ranking`。
   - 已让 usage increment、search/category 变化和 history clear 自动刷新摘要。
   - 已补充 focused renderer / search scope / top-three / clear / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

109. **TUI live session command usage ranking visibility**（已完成 [Phase120 基础实现](design/PHASE_120_TUI_LIVE_SESSION_COMMAND_USAGE_RANKING_VISIBILITY.md)）
   - 已为 `TuiState` 增加 `liveSessionCommandUsageRankingVisible`，默认开启。
   - 已增加 palette-local `%` 快捷键和 `toggle_live_session_command_usage_ranking` action。
   - 已让 action 在 palette 关闭时保持 no-op，并让 visibility 跨 close / reopen 保持。
   - 已在 palette header 中暴露 `ranking:on` / `ranking:off`。
   - 已让 hidden 模式仅隐藏 ranking summary，不清空 usage counts 或改变 usage sorting。
   - 已在 help 和 debug output 中暴露 visibility control / state。
   - 已补充 focused reducer / input / renderer / persistence / help / debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

110. **TUI live session command usage ranking size**（已完成 [Phase121 基础实现](design/PHASE_121_TUI_LIVE_SESSION_COMMAND_USAGE_RANKING_SIZE.md)）
   - 已增加 `TuiLiveSessionCommandUsageRankingLimit`，只允许 `1 | 3 | 5`。
   - 已为 `TuiState` 增加默认值为 `3` 的 `liveSessionCommandUsageRankingLimit`。
   - 已增加 palette-local `+` 快捷键和 `cycle_live_session_command_usage_ranking_limit` action。
   - 已让 limit 按 `1 -> 3 -> 5 -> 1` 固定循环，并在 palette 关闭时保持 no-op。
   - 已让 selected limit 跨 close / reopen 保持。
   - 已让 renderer / debug ranking 使用当前 limit，并在 header 中显示 `ranking:on/3` 形式。
   - 已补充 focused input / reducer / Top-1 / Top-3 / Top-5 / persistence tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

111. **TUI live session command usage ranking adaptive layout**（已完成 [Phase122 基础实现](design/PHASE_122_TUI_LIVE_SESSION_COMMAND_USAGE_RANKING_ADAPTIVE_LAYOUT.md)）
   - 已让 full / compact live-pane rendering 传递当前 content width。
   - 已增加 width-aware ranking fitting step。
   - 已让 configured Top-N 作为上限，按完整 summary 文本能否容纳决定 effective limit。
   - 已保证存在 usage data 时至少保留 Top-1。
   - 已让宽终端继续显示完整 configured ranking，窄终端显示稳定 ranking prefix。
   - 已验证 adaptive rendering 不修改 `liveSessionCommandUsageRankingLimit`。
   - 已补充 focused narrow / wide terminal renderer tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

112. **TUI live session command usage ranking overflow indicator**（已完成 [Phase123 基础实现](design/PHASE_123_TUI_LIVE_SESSION_COMMAND_USAGE_RANKING_OVERFLOW.md)）
   - 已让 width fitting 同时返回 visible ranking prefix 和 hidden configured-entry count。
   - 已增加 ` | +N more` overflow suffix。
   - 已让 overflow suffix 参与 width fitting，必要时缩短 visible prefix。
   - 已在极窄布局中优先保留完整 Top-1。
   - 已让完整 configured ranking 能容纳时不显示 overflow suffix。
   - 已补充 focused narrow `+4 more`、medium `+3 more` 和 wide no-overflow tests。
   - 未新增 TUI state、JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

113. **TUI live session command usage ranking multi-line layout**（已完成 [Phase124 基础实现](design/PHASE_124_TUI_LIVE_SESSION_COMMAND_USAGE_RANKING_MULTI_LINE.md)）
   - 已增加 `TuiLiveSessionCommandUsageRankingLayout`，支持 `single` / `multi`。
   - 已为 `TuiState` 增加默认值为 `single` 的 ranking layout。
   - 已增加 palette-local `=` 快捷键和 `toggle_live_session_command_usage_ranking_layout` action。
   - 已让 layout 跨 palette close / reopen 保持，并在 palette 关闭时保持 action no-op。
   - 已让 multi mode 将 ranking entry / overflow tokens 打包到最多两行。
   - 已让 header / help / debug 暴露 `ranking:on/5/multi` 一类 layout 状态。
   - 已补充 focused input / narrow multi / medium full-ranking / overflow / persistence tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

114. **TUI live session command usage ranking line-count controls**（已完成 [Phase125 基础实现](design/PHASE_125_TUI_LIVE_SESSION_COMMAND_USAGE_RANKING_LINE_LIMIT.md)）
   - 已增加 `TuiLiveSessionCommandUsageRankingLineLimit`，只允许 `2 | 3`。
   - 已为 `TuiState` 增加默认值为 `2` 的 multi ranking line limit。
   - 已增加 palette-local `]` 快捷键和 `cycle_live_session_command_usage_ranking_line_limit` action。
   - 已让 line limit 按 `2 -> 3 -> 2` 循环，并在 palette 关闭时保持 no-op。
   - 已让 selected line limit 跨 palette close / reopen 保持。
   - 已保持 single layout 固定使用一行，multi layout 使用 selected line limit。
   - 已让 header / help / debug 暴露 `ranking:on/5/multi/3` 一类状态。
   - 已补充 focused input / two-line / three-line / overflow / persistence tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

115. **TUI live session command usage ranking row-budget safeguards**（已完成 [Phase126 基础实现](design/PHASE_126_TUI_LIVE_SESSION_COMMAND_USAGE_RANKING_ROW_BUDGET.md)）
   - 已在 palette renderer 中按当前 `maxRows` 计算 ranking 的垂直行预算。
   - 已先扣除 palette header 和可见 pinned/recent summaries。
   - 已固定预留首个 command group heading 和至少一个 executable command row。
   - 已将 effective ranking rows 限制为 available row budget 与 configured layout line limit 的较小值。
   - 已让受限布局优先压缩或隐藏 ranking summary，而不修改 visibility、Top-N、layout 或 line-limit state。
   - 已补充 compact multi-line 和 constrained full-layout command visibility tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

116. **TUI live session command summary priority controls**（已完成 [Phase127 基础实现](design/PHASE_127_TUI_LIVE_SESSION_COMMAND_SUMMARY_PRIORITY.md)）
   - 已增加 `TuiLiveSessionCommandSummaryPriority`，支持 `history | ranking`。
   - 已为 `TuiState` 增加默认值为 `history` 的 summary priority。
   - 已增加 palette-local `[` 快捷键和 `toggle_live_session_command_summary_priority` action。
   - 已让 action 在 palette 关闭时保持 no-op，并让 priority 跨 close / reopen 保持。
   - 已让 history-first 优先分配 pinned/recent rows，ranking-first 优先分配 usage ranking rows。
   - 已保持 Phase126 的 group heading 和 executable command 两行预留。
   - 已让 header / help / debug 暴露 `summary:ranking` / `summary=ranking` 一类状态。
   - 已补充 focused input / row-pressure / command visibility / persistence tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

117. **TUI live session command summary visibility profiles**（已完成 [Phase128 基础实现](design/PHASE_128_TUI_LIVE_SESSION_COMMAND_SUMMARY_VISIBILITY_PROFILES.md)）
   - 已增加 `TuiLiveSessionCommandSummaryVisibilityProfile`，支持 `all | history | ranking | minimal`。
   - 已为 `TuiState` 增加默认值为 `all` 的 summary visibility profile。
   - 已增加 palette-local `\` 快捷键和 `cycle_live_session_command_summary_visibility_profile` action。
   - 已让 profile 按 `all -> history -> ranking -> minimal -> all` 循环，并在 palette 关闭时保持 no-op。
   - 已让 selected profile 跨 palette close / reopen 保持。
   - 已让 profile 在 Phase127 priority 分配前过滤 eligible summary families。
   - 已保持 Phase126 的 group heading 和 executable command 两行预留。
   - 已让 header / help / debug 暴露 `profile:minimal` / `profile=minimal` 一类状态。
   - 已补充 focused input / four-profile / wraparound / command visibility / persistence tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

118. **TUI live session command palette scrolling**（已完成 [Phase129 基础实现](design/PHASE_129_TUI_LIVE_SESSION_COMMAND_PALETTE_SCROLLING.md)）
   - 已为 `TuiState` 增加 `liveSessionCommandScrollOffset` visible-command anchor。
   - 已增加 `scroll_live_session_command_palette` action，并让 palette 关闭时保持 no-op。
   - 已让 PageUp/PageDown 在 palette 内按五个 visible commands 分页，其他 pane 保持原有滚动 action。
   - 已让 open/search/category/sort scope changes 重置 explicit anchor。
   - 已将 command rendering 重构为 grouped blocks，并按 summary 后剩余行预算生成 viewport。
   - 已让 renderer 派生 effective start，确保 selected command 和其 group heading 始终可见。
   - 已让 header 暴露 `command:N/total`，debug 暴露 `scroll=N`。
   - 已补充 focused selection-following / paging / grouping / no-op / reset / input tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

119. **TUI live session command palette scroll position indicators**（已完成 [Phase130 基础实现](design/PHASE_130_TUI_LIVE_SESSION_COMMAND_PALETTE_SCROLL_INDICATORS.md)）
   - 已让 command-window renderer 返回实际 first/last visible command positions。
   - 已增加 `scroll:start-end/total` compact indicator。
   - 已用 leading `<` 表示 above hidden commands，用 trailing `>` 表示 below hidden commands。
   - 已让 middle window 同时显示 `<` / `>`，complete window 不显示 marker。
   - 已为 empty result 提供 `scroll:0-0/0`。
   - 已将 `command:N/total` 和 scroll indicator 前置，保证 narrow header 优先可见。
   - 已保持 indicator 不占用 summary 或 command content rows。
   - 已补充 focused initial/middle/final/complete/narrow/help tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

120. **TUI live session command palette page-size controls**（已完成 [Phase131 基础实现](design/PHASE_131_TUI_LIVE_SESSION_COMMAND_PALETTE_PAGE_SIZE.md)）
   - 已增加 `TuiLiveSessionCommandPageSize`，只允许 `3 | 5 | 7`。
   - 已为 `TuiState` 增加默认值为 `5` 的 page size。
   - 已增加 palette-local `;` 快捷键和 `cycle_live_session_command_page_size` action。
   - 已让 page size 按 `3 -> 5 -> 7 -> 3` 循环，并在 palette 关闭时保持 no-op。
   - 已让 page size 跨 palette close / reopen 保持。
   - 已让 PageUp/PageDown input 只发送 direction，由 reducer 读取 current page size。
   - 已保留 explicit action amount 对 configured page size 的覆盖能力。
   - 已让 header / help / debug 暴露 `page:3` / `page=3` 一类状态。
   - 已补充 focused default/three/five/seven/wraparound/paging/persistence/input tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

121. **TUI live session command palette Home/End navigation**（已完成 [Phase132 基础实现](design/PHASE_132_TUI_LIVE_SESSION_COMMAND_PALETTE_HOME_END.md)）
   - 已增加 `jump_live_session_command_palette` first/last action。
   - 已增加 live palette-specific Home / End input mapping。
   - 已让 palette 关闭和 empty visible scope 保持 no-op。
   - 已让 Home/End 使用 current search/category/sort 后的 visible commands。
   - 已同步 destination absolute command index 与 visible-command scroll anchor。
   - 已复用 Phase129 renderer following、group heading 和 Phase130 indicators。
   - 已保持 Phase131 page-size state 不变。
   - 已补充 focused full-scope/category-scope/anchor/indicator/input/help tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

122. **TUI live session command palette selection wrapping controls**（已完成 [Phase133 基础实现](design/PHASE_133_TUI_LIVE_SESSION_COMMAND_PALETTE_SELECTION_WRAP.md)）
   - 已为 `TuiState` 增加 default-off `liveSessionCommandSelectionWrap`。
   - 已增加 palette-local `~` 快捷键和 `toggle_live_session_command_selection_wrap` action。
   - 已让 toggle 在 palette 关闭时保持 no-op，并跨 close / reopen 保持。
   - 已保持 disabled mode 的 first/last clamp 行为。
   - 已让 enabled mode 在 current visible scope 内执行 modulo Up/Down selection。
   - 已在真实首尾边界跨越时同步 destination scroll anchor。
   - 已让 header / help / debug 暴露 `wrap:on` / `wrap=on` 一类状态。
   - 已补充 focused full/category/bidirectional/clamp/anchor/persistence/input tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

123. **TUI live session command palette group navigation**（已完成 [Phase134 基础实现](design/PHASE_134_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NAVIGATION.md)）
   - 已增加 shared `liveSessionCommandGroupKey(...)`，统一 state / renderer favorite-category boundaries。
   - 已增加 `jump_live_session_command_group` previous/next action。
   - 已增加 palette-local `{` / `}` group shortcuts。
   - 已让 palette 关闭和 empty visible scope 保持 no-op。
   - 已让 group starts 从 current visible command ordering 派生。
   - 已让 destination selection / scroll anchor 指向 target group first command。
   - 已复用 Phase133 wrapping preference 处理 first/last group boundaries。
   - 已让 single-group scopes 在两个方向保持稳定。
   - 已补充 focused forward/backward/clamp/wrap/single-group/renderer/input tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

124. **TUI live session command palette group position indicators**（已完成 [Phase135 基础实现](design/PHASE_135_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_INDICATORS.md)）
   - 已增加 shared `liveSessionCommandGroups(...)`，统一 current visible ordering 的 contiguous groups 与 start positions。
   - 已让 Phase134 previous/next group navigation 复用 shared group list。
   - 已在 palette header 增加 `group:N/total:name`。
   - 已在 debug diagnostics 增加 `group=N/total:name`。
   - 已让 search/category/sort/favorite ordering 自动决定 group index、total 和 name。
   - 已为 empty visible scope 增加 `group:0/0:-` fallback。
   - 已将 command/group indicators 保持在 compact header 前部。
   - 已补充 focused group-navigation/scoped/compact/debug/help tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

125. **TUI live session command palette group size indicators**（已完成 [Phase136 基础实现](design/PHASE_136_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_SIZE_INDICATORS.md)）
   - 已为 shared visible-group descriptor 增加 `size`。
   - 已在 group derivation 单次遍历中累计 contiguous group command count。
   - 已将 palette header 扩展为 `group:N/total:name(size)`。
   - 已将 debug diagnostics 扩展为相同 size 语义。
   - 已让 full/category/search/favorite scopes 自动反映 current group size。
   - 已为 empty visible scope 增加 `group:0/0:-(0)` fallback。
   - 已保持 Phase134 navigation 继续复用 shared descriptors。
   - 已补充 focused scoped/empty/compact/debug/help tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

126. **TUI live session command palette in-group position indicators**（已完成 [Phase137 基础实现](design/PHASE_137_TUI_LIVE_SESSION_COMMAND_PALETTE_IN_GROUP_POSITION_INDICATORS.md)）
   - 已从 selected visible position 与 shared group `startPosition` 派生组内位置。
   - 已将 palette header 扩展为 `group:N/total:name(item/size)`。
   - 已将 debug diagnostics 扩展为相同 `item/size` 语义。
   - 已让 group jump 落点显示 `1/size`，普通 selection 更新 numerator。
   - 已让 category/search/sort/wrap/page/Home/End scope 自动反映组内位置。
   - 已为 empty visible scope 增加 `group:0/0:-(0/0)` fallback。
   - 已保持 Phase136 shared size 作为 denominator。
   - 已补充 focused start/middle/end/scoped/empty/compact/debug/help tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

127. **TUI live session command palette group neighbor indicators**（已完成 [Phase138 基础实现](design/PHASE_138_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_INDICATORS.md)）
   - 已增加 shared `TuiLiveSessionCommandGroup` descriptor type。
   - 已增加 `liveSessionCommandGroupNeighbors(...)` shared derivation。
   - 已在 palette header 增加 `neighbors:prev/next`。
   - 已在 debug diagnostics 增加 `neighbors=prev/next`。
   - 已让 first/last boundary 按 Phase133 wrap preference 显示 `-` 或 wrap target。
   - 已让 middle groups 始终显示 current visible ordering 的直接邻组。
   - 已让 single-group 和 empty scopes 使用 `neighbors:-/-`。
   - 已补充 focused boundary/wrap/single/empty/renderer/debug/help tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

128. **TUI live session command palette group neighbor size indicators**（已完成 [Phase139 基础实现](design/PHASE_139_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_SIZE_INDICATORS.md)）
   - 已让 `liveSessionCommandGroupNeighbors(...)` 返回完整 shared descriptors。
   - 已让 renderer/debug 复用 descriptor `key` 与 `size`。
   - 已将 palette header 扩展为 `neighbors:name(size)/name(size)`。
   - 已将 debug diagnostics 扩展为相同 neighbor size 语义。
   - 已让 first/middle/last/wrapped targets 显示对应 visible group size。
   - 已保持 unavailable neighbor 为 `-`，single/empty scopes 为 `-/-`。
   - 已保持 Phase138 wrap-aware target semantics。
   - 已补充 focused boundary/wrap/scoped/empty/renderer/debug/help tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

129. **TUI live session command palette group neighbor command-key indicators**（已完成 [Phase140 基础实现](design/PHASE_140_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_COMMAND_KEY_INDICATORS.md)）
   - 已为 shared group descriptor 增加 `firstCommandKey`。
   - 已在 group creation 时捕获 actual visible start command key。
   - 已将 palette header 扩展为 `neighbors:name(size)@key/name(size)@key`。
   - 已将 debug diagnostics 扩展为相同 key 语义。
   - 已让 catalog ordering 显示 catalog group-start key。
   - 已让 usage sorting 自动显示新的 group-start key。
   - 已保持 wrap-aware、single-group 和 empty-scope semantics。
   - 已补充 focused catalog/usage/wrap/scoped/renderer/debug/help tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

130. **TUI live session command palette group neighbor command-position indicators**（已完成 [Phase141 基础实现](design/PHASE_141_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_COMMAND_POSITION_INDICATORS.md)）
   - 已复用 shared group `startPosition` 作为 neighbor jump destination。
   - 已使用 `startPosition + 1` 输出 1-based visible position。
   - 已将 palette header 扩展为 `neighbors:name(size)@key#position/name(size)@key#position`。
   - 已将 debug diagnostics 扩展为相同 position 语义。
   - 已让 catalog/category/search/favorite scopes 显示对应 group-start position。
   - 已让 usage sorting 保持 key 动态变化且 position 与 group boundary 一致。
   - 已保持 wrap-aware、single-group 和 empty-scope semantics。
   - 已补充 focused catalog/usage/wrap/scoped/renderer/debug/help tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

131. **TUI live session command palette group neighbor command-id indicators**（已完成 [Phase142 基础实现](design/PHASE_142_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_COMMAND_ID_INDICATORS.md)）
   - 已为 shared group descriptor 增加强类型 `firstCommandId`。
   - 已在 group creation 时捕获 actual visible start command ID。
   - 已将 palette header 扩展为 `neighbors:name(size)@key#position:id/name(size)@key#position:id`。
   - 已将 debug diagnostics 扩展为相同 ID 语义。
   - 已保证 key、position、ID 来自同一 group-start command。
   - 已让 usage sorting 自动显示新的 key 和 ID。
   - 已保持 wrap-aware、single-group 和 empty-scope semantics。
   - 已补充 focused catalog/usage/wrap/scoped/renderer/debug/help tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

132. **TUI live session command palette group neighbor visibility profiles**（已完成 [Phase143 基础实现](design/PHASE_143_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_VISIBILITY_PROFILES.md)）
   - 已增加 `compact / standard / full` profile type 和 default-full state。
   - 已增加 `cycle_live_session_command_neighbor_visibility_profile` action。
   - 已增加 palette-local `'` shortcut。
   - 已增加 shared `liveSessionCommandGroupNeighborLabel(...)` formatter。
   - 已让 compact 仅显示 neighbor names。
   - 已让 standard 显示 name/size/key。
   - 已让 full 保留 Phase142 position/ID metadata。
   - 已增加 `neighbors(profile):...` header 和 `neighbor_profile=...` debug diagnostics。
   - 已让 profile 跨 palette close/reopen 保持。
   - 已补充 focused no-op/cycle/persistence/format/debug/input/help tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

133. **TUI live session command palette group neighbor adaptive visibility**（已完成 [Phase144 基础实现](design/PHASE_144_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_VISIBILITY.md)）
   - 已增加 pure `resolveLiveSessionCommandNeighborVisibilityProfile(...)` resolver。
   - 已将用户选择的 profile 定义为 renderer 详情上限。
   - 已按 `maxWidth < 88 / < 128 / >= 128` 限制 compact / standard / full。
   - 已保证自适应逻辑只降档、不自动超过用户偏好。
   - 已增加 `neighbors(preferred>effective):...` 降档标识。
   - 已保持 renderer resolution 不修改 persistent TUI state。
   - 已让 debug diagnostics 继续报告无宽度上下文的 preferred profile。
   - 已补充 threshold edges、preference ceiling、renderer 和 help tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

134. **TUI live session command palette group neighbor adaptive threshold controls**（已完成 [Phase145 基础实现](design/PHASE_145_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_CONTROLS.md)）
   - 已增加 `dense / balanced / spacious` threshold profile type 和 default-balanced state。
   - 已增加 palette-local `"` shortcut 和 cycle action。
   - 已将 resolver 扩展为 profile-aware threshold resolution。
   - 已增加 `72/112`、`88/128`、`104/144` 三组 deterministic thresholds。
   - 已让非默认 renderer 标记当前 threshold profile；Phase146 进一步替换为实际阈值数值。
   - 已增加 `neighbor_threshold=...` debug diagnostics。
   - 已保持 threshold profile 跨 palette close/reopen。
   - 已补充 no-op/cycle/threshold-edge/persistence/renderer/debug/input/help tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

135. **TUI live session command palette group neighbor adaptive threshold indicators**（已完成 [Phase146 基础实现](design/PHASE_146_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_INDICATORS.md)）
   - 已增加 shared threshold value 和 diagnostic label helpers。
   - 已让 adaptive resolver 复用 shared threshold source。
   - 已让 dense/spacious renderer 显示实际 `standard/full` 数值。
   - 已保持 default-balanced renderer header 零增量。
   - 已让 debug 输出 `name[standard/full]` 完整标签。
   - 已补充 helper/renderer/debug 一致性测试。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

136. **TUI live session command palette group neighbor adaptive threshold distance indicators**（已完成 [Phase147 基础实现](design/PHASE_147_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_DISTANCE_INDICATORS.md)）
   - 已增加 shared threshold distance helper。
   - 已让 compact 降档显示距离 standard 的列数。
   - 已让 standard 降档显示距离 full 的列数。
   - 已限制距离标识只在 adaptive downgrade 时出现。
   - 已支持与 dense/spacious threshold values 组合显示。
   - 已补充 helper、balanced 和 spacious renderer tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

137. **TUI live session command palette group neighbor adaptive threshold target indicators**（已完成 [Phase148 基础实现](design/PHASE_148_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_TARGET_INDICATORS.md)）
   - 已增加 shared threshold target helper。
   - 已使用 `S` 标记 standard target。
   - 已使用 `F` 标记 full target。
   - 已让 target 和 distance 复用同一 effective profile / width。
   - 已支持与 non-default threshold values 组合。
   - 已补充 target helper 和 renderer combination tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

138. **TUI live session command palette group neighbor adaptive threshold progress indicators**（已完成 [Phase149 基础实现](design/PHASE_149_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_INDICATORS.md)）
   - 已增加 shared threshold progress helper。
   - 已计算 compact-to-standard 百分比。
   - 已计算 standard-to-full 区间百分比。
   - 已将 active progress 限制为 `0..99`。
   - 已组合 target、distance、progress 和 non-default threshold values。
   - 已补充 helper 和 renderer percentage tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

139. **TUI live session command palette group neighbor adaptive threshold progress buckets**（已完成 [Phase150 基础实现](design/PHASE_150_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKETS.md)）
   - 已增加 shared progress bucket helper。
   - 已定义 `L=0..32`、`M=33..65`、`H=66..99`。
   - 已在 exact percentage 后追加单字符 bucket。
   - 已保持 target、distance、percentage 和 threshold values。
   - 已补充 `32/33/65/66` boundary tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

140. **TUI live session command palette group neighbor adaptive threshold progress bucket labels**（已完成 [Phase151 基础实现](design/PHASE_151_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_LABELS.md)）
   - 已增加 shared bucket label helper。
   - 已映射 `L/M/H -> low/mid/high`。
   - 已保持 renderer 单字符 bucket 宽度。
   - 已在 help 中增加完整语义图例。
   - 已补充 label mapping 和 help exact tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

141. **TUI live session command palette group neighbor adaptive threshold progress bucket help visibility**（已完成 [Phase152 基础实现](design/PHASE_152_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_VISIBILITY.md)）
   - 已增加 default-on bucket help visibility state。
   - 已增加 palette-local `|` shortcut 和 toggle action。
   - 已让 help 条件显示 bucket legend。
   - 已在隐藏时保留恢复控制提示。
   - 已增加 `bucket_help=on/off` debug diagnostics。
   - 已保持设置跨 palette close/reopen。
   - 已补充 no-op/toggle/help/debug/input/persistence tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

142. **TUI live session command palette group neighbor adaptive threshold progress bucket help status indicators**（已完成 [Phase153 基础实现](design/PHASE_153_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_STATUS_INDICATORS.md)）
   - 已增加 shared boolean-to-on/off status helper。
   - 已让 help 控制显示当前 on/off 状态。
   - 已让 debug 复用相同 status vocabulary。
   - 已保持关闭状态下的恢复入口。
   - 已补充 helper 和 help on/off tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

143. **TUI live session command palette group neighbor adaptive threshold progress bucket help shortcut indicators**（已完成 [Phase154 基础实现](design/PHASE_154_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_SHORTCUT_INDICATORS.md)）
   - 已增加 shared `|` shortcut constant。
   - 已增加 shared `on@|` / `off@|` indicator helper。
   - 已让 help 和 debug 复用相同 shortcut indicator。
   - 已让 input mapping 复用相同 shortcut constant。
   - 已保持既有 toggle、legend visibility 和 close/reopen persistence。
   - 已补充 helper、help、debug 和 input regression tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

144. **TUI live session command palette group neighbor adaptive threshold progress bucket help compact indicators**（已完成 [Phase155 基础实现](design/PHASE_155_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_COMPACT_INDICATORS.md)）
   - 已增加 shared compact indicator helper。
   - 已将 help 控制缩短为 `bucket:on@|` / `bucket:off@|`。
   - 已保持 debug 的 `bucket_help` 字段稳定。
   - 已保持 shortcut、toggle、legend visibility 和 persistence 行为。
   - 已补充 compact helper 和 help exact tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

145. **TUI live session command palette group neighbor adaptive threshold progress bucket help compact legend indicators**（已完成 [Phase156 基础实现](design/PHASE_156_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_COMPACT_LEGEND_INDICATORS.md)）
   - 已增加 shared compact legend helper。
   - 已使用 Phase151 bucket label mapping 生成 legend。
   - 已将 legend 收紧为 `bucket:L/M/H=low/mid/high`。
   - 已保持 legend 显隐、status、shortcut、debug 和 persistence 行为。
   - 已补充 helper、显隐和 exact help tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

146. **TUI live session command palette group neighbor adaptive threshold progress bucket help legend display profiles**（已完成 [Phase157 基础实现](design/PHASE_157_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_LEGEND_DISPLAY_PROFILES.md)）
   - 已增加 compact/full legend profile state。
   - 已增加 palette-local backtick cycle shortcut 和 action。
   - 已增加 shared legend renderer 和 profile indicator helper。
   - 已让 help/debug 显示 active profile 和 shortcut。
   - 已保持 profile 跨 visibility toggle 和 palette close/reopen。
   - 已补充 no-op/cycle/input/help/debug/persistence tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

147. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend profiles**（已完成 [Phase158 基础实现](design/PHASE_158_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_PROFILES.md)）
   - 已增加 adaptive legend profile 和三档循环顺序。
   - 已增加 120-column adaptive threshold 和 resolver。
   - 已让 renderer 将真实 content width 传入 help builder。
   - 已保持 explicit compact/full profile 与宽度无关。
   - 已补充 boundary、renderer wiring、cycle 和 persistence tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

148. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend effective-profile indicators**（已完成 [Phase159 基础实现](design/PHASE_159_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_EFFECTIVE_PROFILE_INDICATORS.md)）
   - 已让 adaptive indicator 同时显示 configured/effective profile。
   - 已增加 `adaptive>compact` / `adaptive>full` boundary outputs。
   - 已让 help/debug 共享 width-aware indicator semantics。
   - 已让 renderer 将真实 content width 传入 debug builder。
   - 已保持 explicit compact/full indicator 不变。
   - 已补充 helper、help、debug 和 renderer wiring tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

149. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend threshold indicators**（已完成 [Phase160 基础实现](design/PHASE_160_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_THRESHOLD_INDICATORS.md)）
   - 已将 shared 120-column threshold 加入 adaptive indicator。
   - 已增加 `adaptive>compact[120]` / `adaptive>full[120]` 输出。
   - 已保持 explicit compact/full indicator 不变。
   - 已让 help/debug 继续共享相同格式和 threshold constant。
   - 已补充 boundary exact tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

150. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend threshold distance indicators**（已完成 [Phase161 基础实现](design/PHASE_161_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_THRESHOLD_DISTANCE_INDICATORS.md)）
   - 已增加 shared threshold distance helper。
   - 已增加 adaptive compact `+N` distance suffix。
   - 已保持 threshold satisfied 和 explicit profile 不显示 distance。
   - 已让 help/debug 共享 distance indicator。
   - 已补充 80/119/120 和 explicit profile tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

151. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width indicators**（已完成 [Phase162 基础实现](design/PHASE_162_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_INDICATORS.md)）
   - 已增加 shared current/threshold width helper。
   - 已增加 `[119/120]` / `[120/120]` adaptive outputs。
   - 已保持 compact `+N` distance 和 effective profile semantics。
   - 已保持 explicit compact/full indicator 不变。
   - 已补充 width helper、help 和 debug exact tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

152. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage indicators**（已完成 [Phase163 基础实现](design/PHASE_163_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_INDICATORS.md)）
   - 已增加 shared width percentage helper。
   - 已使用 floor 计算并 clamp 到 0..100。
   - 已增加 `[119/120=99%]` / `[120/120=100%]` 输出。
   - 已保持 raw width、distance、effective profile 和 shortcut 信息。
   - 已补充 lower clamp、boundary、upper cap、help 和 debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

153. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage buckets**（已完成 [Phase164 基础实现](design/PHASE_164_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKETS.md)）
   - 已增加 shared width percentage bucket helper。
   - 已复用 Phase150 L/M/H boundaries。
   - 已增加 `99%H` / `100%H` adaptive outputs。
   - 已保持 raw width、percentage、distance 和 effective profile 信息。
   - 已补充 L/M/H representative widths、help 和 debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

154. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket labels**（已完成 [Phase165 基础实现](design/PHASE_165_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABELS.md)）
   - 已增加 shared width percentage bucket label helper。
   - 已复用 Phase151 low/mid/high mapping。
   - 已增加 `H(high)` 等 adaptive outputs。
   - 已保持 raw width、threshold、percentage、bucket、distance 和 profile 信息。
   - 已补充 low/mid/high representative widths、help 和 debug tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

155. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility controls**（已完成 [Phase166 基础实现](design/PHASE_166_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_CONTROLS.md)）
   - 已增加 default-on bucket label visibility state。
   - 已增加 palette-local `_` toggle shortcut/action。
   - 已增加 `labels:on@_` / `labels:off@_` indicators。
   - 已保持 hidden labels 下的 L/M/H bucket 和 numeric diagnostics。
   - 已保持设置跨 palette close/reopen。
   - 已补充 no-op/input/help/debug/persistence tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

156. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility profiles**（已完成 [Phase167 基础实现](design/PHASE_167_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_PROFILES.md)）
   - 已将 boolean visibility 升级为 shown/hidden/adaptive profiles。
   - 已增加 `_` 三档循环和 adaptive resolver。
   - 已让 adaptive labels 在 120-column boundary 切换 effective visibility。
   - 已增加 `adaptive>hidden` / `adaptive>shown` indicators。
   - 已保持 profile 跨 palette close/reopen。
   - 已补充 no-op/cycle/wrap/help/debug/persistence tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

157. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility threshold indicators**（已完成 [Phase168 基础实现](design/PHASE_168_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_THRESHOLD_INDICATORS.md)）
   - 已将 shared 120-column threshold 加入 adaptive label indicator。
   - 已增加 `adaptive>hidden[120]` / `adaptive>shown[120]` outputs。
   - 已保持 explicit shown/hidden indicators 不变。
   - 已让 help/debug 继续共享 threshold constant 和格式。
   - 已补充 boundary exact tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

158. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility threshold distance indicators**（已完成 [Phase169 基础实现](design/PHASE_169_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_THRESHOLD_DISTANCE_INDICATORS.md)）
   - 已增加 shared label visibility threshold distance helper。
   - 已增加 adaptive hidden `+N` distance suffix。
   - 已保持 threshold satisfied 和 explicit profiles 不显示 distance。
   - 已让 help/debug 共享 distance indicator。
   - 已补充 80/119/120 和 explicit profile tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

159. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width indicators**（已完成 [Phase170 基础实现](design/PHASE_170_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_INDICATORS.md)）
   - 已增加 shared label visibility width helper。
   - 已将 adaptive label threshold 扩展为 `current/120` width indicator。
   - 已保持 hidden `+N` distance 和 explicit profiles 输出不变。
   - 已让 help/debug 共享 width indicator。
   - 已补充 119/120 boundary exact tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

160. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage indicators**（已完成 [Phase171 基础实现](design/PHASE_171_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_INDICATORS.md)）
   - 已复用 shared legend width percentage helper。
   - 已将 adaptive label width 扩展为 `current/120=percentage%`。
   - 已保持宽度超过 threshold 时 percentage clamp 到 100。
   - 已保持 hidden `+N` distance 和 explicit profiles 输出不变。
   - 已补充 119/120/180 helper 及 help/debug exact tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

161. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage buckets**（已完成 [Phase172 基础实现](design/PHASE_172_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKETS.md)）
   - 已增加 shared label visibility width percentage bucket helper。
   - 已复用 legend width percentage 的 `L/M/H` bucket 规则。
   - 已将 adaptive label width 扩展为 `current/120=percentage%bucket`。
   - 已保持 exact width、clamped percentage、distance 和 explicit profiles 输出不变。
   - 已补充 L/M/H helper 及 help/debug exact tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

162. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket labels**（已完成 [Phase173 基础实现](design/PHASE_173_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABELS.md)）
   - 已增加 shared label visibility width percentage bucket label helper。
   - 已复用 legend width percentage 的 `low/mid/high` 映射。
   - 已将 adaptive label width 扩展为 `current/120=percentage%bucket(label)`。
   - 已收窄旧 legend label absence 断言，避免误伤独立 label indicator。
   - 已补充 low/mid/high helper 及 help/debug exact tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

163. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility controls**（已完成 [Phase174 基础实现](design/PHASE_174_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_CONTROLS.md)）
   - 已增加 default-on nested bucket-label visibility state。
   - 已增加 palette-local `*` toggle action 和 input mapping。
   - 已增加 `bucket_labels:on@*` / `bucket_labels:off@*` indicators。
   - 已保持 L/M/H bucket、percentage、distance 和 outer label profile 不变。
   - 已补充 closed no-op、toggle、persistence、help/debug exact tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

164. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility profiles**（已完成 [Phase175 基础实现](design/PHASE_175_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_PROFILES.md)）
   - 已将 nested boolean state 升级为 shown/hidden/adaptive profile。
   - 已增加 `*` 的三态循环和 shared 120-column adaptive resolver。
   - 已增加 `bucket_labels:adaptive>hidden/shown@*` indicators。
   - 已让 Help/Debug 使用 actual width 解析 effective nested-label visibility。
   - 已补充 closed no-op、cycle、wrap、boundary 和 persistence tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

165. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility threshold indicators**（已完成 [Phase176 基础实现](design/PHASE_176_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_THRESHOLD_INDICATORS.md)）
   - 已将 shared 120-column threshold 加入 adaptive nested-label indicator。
   - 已增加 `adaptive>hidden[120]` / `adaptive>shown[120]` outputs。
   - 已保持 explicit shown/hidden indicators 不变。
   - 已让 Help/Debug 继续共享 threshold constant 和格式。
   - 已补充 boundary exact tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

166. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility threshold distance indicators**（已完成 [Phase177 基础实现](design/PHASE_177_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_THRESHOLD_DISTANCE_INDICATORS.md)）
   - 已增加 shared nested-label visibility threshold distance helper。
   - 已增加 adaptive hidden `+N` distance suffix。
   - 已保持 threshold satisfied 和 explicit profiles 不显示 distance。
   - 已让 Help/Debug 共享 distance indicator。
   - 已补充 80/119/120 和 explicit profile tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

167. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width indicators**（已完成 [Phase178 基础实现](design/PHASE_178_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_INDICATORS.md)）
   - 已增加 shared nested-label visibility width helper。
   - 已将 adaptive threshold 扩展为 `current/120` width indicator。
   - 已保持 hidden `+N` distance 和 explicit profiles 输出不变。
   - 已让 Help/Debug 共享 width indicator。
   - 已补充 119/120 boundary exact tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

168. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage indicators**（已完成 [Phase179 基础实现](design/PHASE_179_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_INDICATORS.md)）
   - 已复用 shared legend width percentage helper。
   - 已将 adaptive nested-label width 扩展为 `current/120=percentage%`。
   - 已保持宽度超过 threshold 时 percentage clamp 到 100。
   - 已保持 hidden `+N` distance 和 explicit profiles 输出不变。
   - 已补充 119/120/180 helper 及 help/debug exact tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

169. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage buckets**（已完成 [Phase180 基础实现](design/PHASE_180_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKETS.md)）
   - 已增加 shared nested visibility width percentage bucket helper。
   - 已复用 legend width percentage 的 `L/M/H` bucket 规则。
   - 已将 adaptive nested indicator 扩展为 `current/120=percentage%bucket`。
   - 已保持 exact width、clamped percentage、distance 和 explicit profiles 输出不变。
   - 已补充 L/M/H helper 及 help/debug exact tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

170. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket labels**（已完成 [Phase181 基础实现](design/PHASE_181_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABELS.md)）
   - 已增加 shared nested visibility width percentage bucket label helper。
   - 已复用 legend width percentage 的 `low/mid/high` 映射。
   - 已将 adaptive nested indicator 扩展为 `current/120=percentage%bucket(label)`。
   - 已保持 exact width、percentage、bucket、distance 和 explicit profiles 不变。
   - 已补充 low/mid/high helper 及 help/debug exact tests。
   - 未新增 JSON-RPC method、transcript schema、provider API、MCP protocol 或 plugin manifest 变更。

171. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility controls**（已完成 [Phase182 基础实现](design/PHASE_182_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_CONTROLS.md)）
   - 已增加 default-on innermost bucket-label visibility state。
   - 已增加 palette-local `&` toggle、input mapping 和 on/off indicators。
   - 已保持 L/M/H、width、percentage、distance 和 outer profiles 不变。
   - 已补充 no-op、toggle、Help/Debug 和 persistence tests。
   - 未新增跨进程接口或 schema 变更。

172. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility profiles**（已完成 [Phase183 基础实现](design/PHASE_183_TUI_LIVE_SESSION_COMMAND_PALETTE_GROUP_NEIGHBOR_ADAPTIVE_THRESHOLD_PROGRESS_BUCKET_HELP_ADAPTIVE_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_PROFILES.md)）
   - 已将 Phase182 boolean state 升级为 `shown`、`hidden`、`adaptive` profile。
   - 已复用 palette-local `&` 循环 profile，并按 shared 120-column boundary 派生 effective visibility。
   - 已增加 configured/effective Help 和 Debug indicators。
   - 已补充 closed-palette no-op、完整循环、adaptive boundary 和 persistence tests。
   - 未新增跨进程接口或 schema 变更。

173. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility threshold indicators**（已完成 [Phase184 基础实现](design/PHASE_184_TUI_INNERMOST_BUCKET_LABEL_VISIBILITY_THRESHOLD_INDICATORS.md)）
   - 已在 innermost adaptive profile indicator 中显示 shared 120-column threshold。
   - 已增加 `adaptive>hidden[120]` 与 `adaptive>shown[120]` 输出。
   - 已保持 explicit profiles、profile cycle 和 effective visibility 不变。
   - 已补充 helper、Help 和 Debug exact boundary tests。
   - 未新增跨进程接口或 schema 变更。

174. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility threshold distance indicators**（已完成 [Phase185 基础实现](design/PHASE_185_TUI_INNERMOST_BUCKET_LABEL_VISIBILITY_THRESHOLD_DISTANCE_INDICATORS.md)）
   - 已增加 innermost adaptive profile threshold-distance helper。
   - 已在低于 shared 120-column threshold 时显示 `+N`。
   - 已保持 threshold 以上和 explicit profiles 无 distance suffix。
   - 已补充 helper、Help 和 Debug exact tests。
   - 未新增跨进程接口或 schema 变更。

175. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width indicators**（已完成 [Phase186 基础实现](design/PHASE_186_TUI_INNERMOST_BUCKET_LABEL_VISIBILITY_WIDTH_INDICATORS.md)）
   - 已增加 innermost adaptive profile width helper。
   - 已将 threshold detail 扩展为 `current/120`。
   - 已保持 Phase185 distance、explicit profiles 和 effective visibility 不变。
   - 已补充 helper、Help 和 Debug exact tests。
   - 未新增跨进程接口或 schema 变更。

176. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage indicators**（已完成 [Phase187 基础实现](design/PHASE_187_TUI_INNERMOST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_INDICATORS.md)）
   - 已将 innermost adaptive width helper 扩展为 normalized percentage。
   - 已复用 shared clamped percentage algorithm。
   - 已保持 exact width、distance、explicit profiles 和 effective visibility 不变。
   - 已补充 helper、Help 和 Debug exact tests。
   - 未新增跨进程接口或 schema 变更。

177. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage buckets**（已完成 [Phase188 基础实现](design/PHASE_188_TUI_INNERMOST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKETS.md)）
   - 已增加 innermost width percentage bucket helper。
   - 已复用 shared `L/M/H` bucket mapping。
   - 已保持 exact width、percentage、distance 和 profiles 不变。
   - 已补充 helper、Help 和 Debug exact tests。
   - 未新增跨进程接口或 schema 变更。

178. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket labels**（已完成 [Phase189 基础实现](design/PHASE_189_TUI_INNERMOST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABELS.md)）
   - 已增加 innermost width percentage bucket-label helper。
   - 已复用 shared `low/mid/high` mapping。
   - 已保持 exact width、percentage、bucket、distance 和 profiles 不变。
   - 已补充 helper、Help 和 Debug exact tests。
   - 未新增跨进程接口或 schema 变更。

179. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility controls**（已完成 [Phase190 基础实现](design/PHASE_190_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_CONTROLS.md)）
   - 已增加 default-on deepest bucket-label visibility state。
   - 已增加 palette-local `(` toggle、input mapping 和 on/off indicators。
   - 已保持 L/M/H、width、percentage、distance 和 outer profiles 不变。
   - 已补充 no-op、toggle、Help/Debug 和 persistence tests。
   - 未新增跨进程接口或 schema 变更。

180. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility profiles**（已完成 [Phase191 基础实现](design/PHASE_191_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_PROFILES.md)）
   - 已将 Phase190 boolean state 升级为 `shown`、`hidden`、`adaptive` profile。
   - 已复用 palette-local `(` 循环，并按 shared 120-column boundary 派生 effective visibility。
   - 已增加 configured/effective Help 和 Debug indicators。
   - 已补充 closed-palette no-op、完整循环、adaptive boundary 和 persistence tests。
   - 未新增跨进程接口或 schema 变更。

181. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility threshold indicators**（已完成 [Phase192 基础实现](design/PHASE_192_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_THRESHOLD_INDICATORS.md)）
   - 已在 deepest adaptive profile indicator 中显示 shared 120-column threshold。
   - 已增加 `adaptive>hidden[120]` 与 `adaptive>shown[120]` 输出。
   - 已保持 explicit profiles、profile cycle 和 effective visibility 不变。
   - 已补充 helper、Help 和 Debug exact boundary tests。
   - 未新增跨进程接口或 schema 变更。

182. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility threshold distance indicators**（已完成 [Phase193 基础实现](design/PHASE_193_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_THRESHOLD_DISTANCE_INDICATORS.md)）
   - 已增加 deepest adaptive profile threshold-distance helper。
   - 已在低于 shared 120-column threshold 时显示 `+N`。
   - 已保持 threshold 以上和 explicit profiles 无 distance suffix。
   - 已补充 helper、Help 和 Debug exact tests。
   - 未新增跨进程接口或 schema 变更。

183. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width indicators**（已完成 [Phase194 基础实现](design/PHASE_194_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_INDICATORS.md)）
   - 已增加 deepest adaptive profile width helper。
   - 已将 threshold detail 扩展为 `current/120`。
   - 已保持 Phase193 distance、explicit profiles 和 effective visibility 不变。
   - 已补充 helper、Help 和 Debug exact tests。
   - 未新增跨进程接口或 schema 变更。

184. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage indicators**（已完成 [Phase195 基础实现](design/PHASE_195_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_INDICATORS.md)）
   - 已在 deepest adaptive width detail 中复用 shared clamped percentage helper。
   - 已将 threshold detail 扩展为 `current/120=percentage%`。
   - 已保持 Phase194 width、Phase193 distance、explicit profiles 和 effective visibility 不变。
   - 已补充 helper、Help 和 Debug exact boundary tests。
   - 未新增跨进程接口或 schema 变更。

185. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage buckets**（已完成 [Phase196 基础实现](design/PHASE_196_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKETS.md)）
   - 已将 deepest percentage bucket delegate 接入 adaptive width formatter。
   - 已将 threshold detail 扩展为 `current/120=percentage%L|M|H`。
   - 已保持 Phase195 percentage、Phase194 width、distance 和 explicit profiles 不变。
   - 已补充 L/M/H helper、Help 和 Debug exact tests。
   - 未新增跨进程接口或 schema 变更。

186. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket labels**（已完成 [Phase197 基础实现](design/PHASE_197_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABELS.md)）
   - 已将 deepest percentage bucket-label delegate 接入 adaptive width formatter。
   - 已将 threshold detail 扩展为 `current/120=percentage%L|M|H(low|mid|high)`。
   - 已保持 Phase196 bucket、percentage、width、distance 和 explicit profiles 不变。
   - 已补充 low/mid/high helper、Help 和 Debug exact tests。
   - 未新增跨进程接口或 schema 变更。

187. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility controls**（已完成 [Phase198 基础实现](design/PHASE_198_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_CONTROLS.md)）
   - 已增加 default-on deepest bucket-label visibility state。
   - 已增加 palette-local `)` toggle action 和 input mapping。
   - 已增加 `visibility_bucket_labels_labels_labels:on|off@)` Help/Debug indicator。
   - 已保持 `L/M/H` bucket、width、percentage、distance 和 outer profiles 不变。
   - 未新增跨进程接口或 schema 变更。

188. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility profiles**（已完成 [Phase199 基础实现](design/PHASE_199_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_PROFILES.md)）
   - 已将 Phase198 boolean state 升级为 `shown|hidden|adaptive` profile。
   - 已复用 `)` 循环 profile，并在 shared 120-column boundary 解析 effective visibility。
   - 已增加 configured/effective Help 和 Debug indicators。
   - 已保持 bucket、width、percentage、distance 和 outer profiles 不变。
   - 未新增跨进程接口或 schema 变更。

189. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility threshold indicators**（已完成 [Phase200 基础实现](design/PHASE_200_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_THRESHOLD_INDICATORS.md)）
   - 已在 deepest adaptive profile indicator 中复用 shared 120-column threshold。
   - 已增加 `adaptive>hidden[120]` 和 `adaptive>shown[120]` exact output。
   - 已保持 explicit profiles、effective visibility、profile cycling 和 persistence 不变。
   - 已补充 Help、Debug 和 119/120 boundary tests。
   - 未新增跨进程接口或 schema 变更。

190. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility threshold distance indicators**（已完成 [Phase201 基础实现](design/PHASE_201_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_THRESHOLD_DISTANCE_INDICATORS.md)）
   - 已增加 deepest adaptive profile threshold-distance helper。
   - 已在低于 shared 120-column threshold 时显示 `+N`。
   - 已保持 threshold 以上和 explicit profiles 无 distance suffix。
   - 已补充 helper、Help、Debug 和 boundary exact tests。
   - 未新增跨进程接口或 schema 变更。

191. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width indicators**（已完成 [Phase202 基础实现](design/PHASE_202_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_INDICATORS.md)）
   - 已增加 deepest adaptive profile width helper。
   - 已将 threshold detail 扩展为 `current/120`。
   - 已保持 Phase201 distance、explicit profiles 和 effective visibility 不变。
   - 已补充 helper、Help、Debug 和 exact boundary tests。
   - 未新增跨进程接口或 schema 变更。

192. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage indicators**（已完成 [Phase203 基础实现](design/PHASE_203_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_INDICATORS.md)）
   - 已在 deepest adaptive width detail 中复用 shared clamped percentage helper。
   - 已将 threshold detail 扩展为 `current/120=percentage%`。
   - 已保持 Phase202 width、Phase201 distance、explicit profiles 和 effective visibility 不变。
   - 已补充 helper、Help、Debug 和 exact boundary tests。
   - 未新增跨进程接口或 schema 变更。

193. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage buckets**（已完成 [Phase204 基础实现](design/PHASE_204_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKETS.md)）
   - 已增加并接入 current-level deepest percentage bucket delegate。
   - 已将 adaptive detail 扩展为 `current/120=percentage%L|M|H`。
   - 已保持 Phase203 percentage、width、distance 和 explicit profiles 不变。
   - 已补充 L/M/H helper、Help、Debug 和 exact tests。
   - 未新增跨进程接口或 schema 变更。

194. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket labels**（已完成 [Phase205 基础实现](design/PHASE_205_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABELS.md)）
   - 已增加并接入 current-level deepest percentage bucket-label delegate。
   - 已将 adaptive detail 扩展为 `current/120=percentage%L|M|H(low|mid|high)`。
   - 已保持 Phase204 bucket、percentage、width、distance 和 explicit profiles 不变。
   - 已补充 low/mid/high helper、Help、Debug 和 exact tests。
   - 未新增跨进程接口或 schema 变更。

195. **TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility controls**（已完成 [Phase206 基础实现](design/PHASE_206_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_CONTROLS.md)）
   - 已增加 default-on current-level deepest bucket-label visibility state。
   - 已增加 palette-local `<` toggle action 和 input mapping。
   - 已增加 `visibility_bucket_labels_labels_labels_labels:on|off@<` Help/Debug indicator。
   - 已保持 `L/M/H` bucket、width、percentage、distance 和 outer profiles 不变。
   - 未新增跨进程接口或 schema 变更。

196. **TUI live session command palette current-level deepest bucket label visibility profiles**（已完成 [Phase207 基础实现](design/PHASE_207_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_PROFILES.md)）
   - 已将 Phase206 boolean control 升级为 `shown`、`hidden`、`adaptive` profiles。
   - 已复用 palette-local `<` action，按 `shown -> hidden -> adaptive -> shown` 循环。
   - 已在共享 120-column boundary 解析 adaptive effective visibility。
   - 已同步 Help、Debug、input、no-op、boundary 和 persistence tests。
   - 未新增跨进程接口或 schema 变更。

197. **TUI live session command palette current-level deepest bucket label visibility threshold indicators**（已完成 [Phase208 基础实现](design/PHASE_208_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_THRESHOLD_INDICATORS.md)）
   - 已在 adaptive indicator 中显式展示共享 120-column threshold。
   - 已输出 `adaptive>hidden[120]@<` 和 `adaptive>shown[120]@<`。
   - 已保持 explicit profiles、profile cycling、effective visibility 和 persistence 不变。
   - 已同步 helper、Help、Debug 和 exact boundary tests。
   - 未新增跨进程接口或 schema 变更。

198. **TUI live session command palette current-level deepest bucket label visibility threshold distance indicators**（已完成 [Phase209 基础实现](design/PHASE_209_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_THRESHOLD_DISTANCE_INDICATORS.md)）
   - 已增加纯函数 threshold-distance helper。
   - 已在阈值以下输出 `adaptive>hidden+distance[120]@<`。
   - 已保持阈值处及以上、explicit profiles 不显示 distance。
   - 已同步 helper、Help、Debug 和 exact boundary tests。
   - 未新增跨进程接口或 schema 变更。

199. **TUI live session command palette current-level deepest bucket label visibility width indicators**（已完成 [Phase210 基础实现](design/PHASE_210_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_INDICATORS.md)）
   - 已增加 current-level deepest `current/120` width helper。
   - 已输出 `adaptive>hidden+1[119/120]@<` 和 `adaptive>shown[120/120]@<`。
   - 已保持 Phase209 distance 和 explicit profiles 不变。
   - 已同步 helper、Help、Debug 和 exact boundary tests。
   - 未新增跨进程接口或 schema 变更。

200. **TUI live session command palette current-level deepest bucket label visibility width percentage indicators**（已完成 [Phase211 基础实现](design/PHASE_211_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_INDICATORS.md)）
   - 已复用共享 clamped width-percentage helper。
   - 已输出 `adaptive>hidden+1[119/120=99%]@<` 和 `adaptive>shown[120/120=100%]@<`。
   - 已保持 exact current width、distance 和 explicit profiles 不变。
   - 已同步 helper、Help、Debug 和 exact boundary tests。
   - 未新增跨进程接口或 schema 变更。

201. **TUI live session command palette current-level deepest bucket label visibility width percentage buckets**（已完成 [Phase212 基础实现](design/PHASE_212_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKETS.md)）
   - 已将 current-level deepest percentage-bucket helper 接入 width formatter。
   - 已输出 `adaptive>hidden+1[119/120=99%H]@<` 和 `adaptive>shown[120/120=100%H]@<`。
   - 已保持 exact width、clamped percentage、distance 和 effective visibility 不变。
   - 已同步 L/M/H helper、Help、Debug 和 exact tests。
   - 未新增跨进程接口或 schema 变更。

202. **TUI live session command palette current-level deepest bucket label visibility width percentage bucket labels**（已完成 [Phase213 基础实现](design/PHASE_213_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABELS.md)）
   - 已将 current-level deepest percentage-bucket label helper 接入 width formatter。
   - 已输出 `adaptive>hidden+1[119/120=99%H(high)]@<` 和 `adaptive>shown[120/120=100%H(high)]@<`。
   - 已保持 exact width、percentage、bucket、distance 和 effective visibility 不变。
   - 已同步 low/mid/high helper、Help、Debug 和 exact tests。
   - 未新增跨进程接口或 schema 变更。

203. **TUI live session command palette current-level deepest nested bucket label visibility controls**（已完成 [Phase214 基础实现](design/PHASE_214_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_CONTROLS.md)）
   - 已增加 default-on nested bucket-label visibility state。
   - 已增加 palette-local `>` toggle action 和 input mapping。
   - 已增加 `visibility_bucket_labels_labels_labels_labels_labels:on|off@>` Help/Debug indicator。
   - 已保持 `L/M/H` bucket、width、percentage、distance 和 outer profiles 不变。
   - 未新增跨进程接口或 schema 变更。

204. **TUI live session command palette current-level deepest nested bucket label visibility profiles**（已完成 [Phase215 基础实现](design/PHASE_215_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_PROFILES.md)）
   - 已将 Phase214 boolean control 升级为 `shown`、`hidden`、`adaptive` profiles。
   - 已复用 palette-local `>` action，按 `shown -> hidden -> adaptive -> shown` 循环。
   - 已在共享 120-column boundary 解析 adaptive effective visibility。
   - 已同步 Help、Debug、input、no-op、boundary 和 persistence tests。
   - 未新增跨进程接口或 schema 变更。

205. **TUI live session command palette current-level deepest nested bucket label visibility threshold indicators**（已完成 [Phase216 基础实现](design/PHASE_216_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_THRESHOLD_INDICATORS.md)）
   - 已在 adaptive indicator 中显式展示共享 120-column threshold。
   - 已输出 `adaptive>hidden[120]@>` 和 `adaptive>shown[120]@>`。
   - 已保持 explicit profiles、profile cycling、effective visibility 和 persistence 不变。
   - 已同步 helper、Help、Debug 和 exact boundary tests。
   - 未新增跨进程接口或 schema 变更。

206. **TUI live session command palette current-level deepest nested bucket label visibility threshold distance indicators**（已完成 [Phase217 基础实现](design/PHASE_217_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_THRESHOLD_DISTANCE_INDICATORS.md)）
   - 已增加 nested pure threshold-distance helper。
   - 已在阈值以下输出 `adaptive>hidden+distance[120]@>`。
   - 已保持阈值处及以上、explicit profiles 不显示 distance。
   - 已同步 helper、Help、Debug 和 exact boundary tests。
   - 未新增跨进程接口或 schema 变更。

207. **TUI live session command palette current-level deepest nested bucket label visibility width indicators**（已完成 [Phase218 基础实现](design/PHASE_218_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_INDICATORS.md)）
   - 已增加 nested `current/120` width helper。
   - 已输出 `adaptive>hidden+1[119/120]@>` 和 `adaptive>shown[120/120]@>`。
   - 已保持 Phase217 distance 和 explicit profiles 不变。
   - 已同步 helper、Help、Debug 和 exact boundary tests。
   - 未新增跨进程接口或 schema 变更。

208. **TUI live session command palette current-level deepest nested bucket label visibility width percentage indicators**（已完成 [Phase219 基础实现](design/PHASE_219_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_INDICATORS.md)）
   - 已复用共享 clamped width-percentage helper。
   - 已输出 `adaptive>hidden+1[119/120=99%]@>` 和 `adaptive>shown[120/120=100%]@>`。
   - 已保持 exact current width、distance 和 explicit profiles 不变。
   - 已同步 helper、Help、Debug 和 exact boundary tests。
   - 未新增跨进程接口或 schema 变更。

209. **TUI live session command palette current-level deepest nested bucket label visibility width percentage buckets**（已完成 [Phase220 基础实现](design/PHASE_220_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKETS.md)）
   - 已复用共享 `L/M/H` percentage-bucket helper。
   - 已输出 `adaptive>hidden+1[119/120=99%H]@>` 和 `adaptive>shown[120/120=100%H]@>`。
   - 已覆盖 low、mid、high、threshold 和 clamped-width 边界。
   - 已同步 helper、Help、Debug 和 exact boundary tests。
   - 未新增跨进程接口或 schema 变更。

210. **TUI live session command palette current-level deepest nested bucket label visibility width percentage bucket labels**（已完成 [Phase221 基础实现](design/PHASE_221_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABELS.md)）
   - 已复用共享 `low/mid/high` percentage-bucket label helper。
   - 已输出 `adaptive>hidden+1[119/120=99%H(high)]@>` 和 `adaptive>shown[120/120=100%H(high)]@>`。
   - 已保持 exact width、clamped percentage、bucket、distance 和 explicit profiles 不变。
   - 已同步 helper、Help、Debug 和 exact boundary tests。
   - 未新增跨进程接口或 schema 变更。

211. **TUI live session command palette current-level deepest nested bucket label visibility controls**（已完成 [Phase222 基础实现](design/PHASE_222_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_CONTROLS.md)）
   - 已增加 default-on deepest nested bucket-label visibility state。
   - 已增加 palette-local `?` toggle、action 和 input mapping。
   - 已输出 `visibility_bucket_labels_labels_labels_labels_labels_labels:on@?` 和 `off@?`。
   - 已保持 `L/M/H`、width、percentage、distance 和 outer profiles 不变。
   - 已覆盖 closed-palette no-op、toggle、persistence、Help、Debug 和 input tests。
   - 未新增跨进程接口或 schema 变更。

212. **TUI live session command palette current-level deepest nested bucket label visibility profiles**（已完成 [Phase223 基础实现](design/PHASE_223_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_PROFILES.md)）
   - 已将 boolean state 升级为 `shown/hidden/adaptive` profile。
   - 已复用 palette-local `?` 循环 profile。
   - 已在 120-column 共享边界解析 adaptive effective profile。
   - 已输出 `shown@?`、`hidden@?`、`adaptive>hidden@?` 和 `adaptive>shown@?`。
   - 已覆盖 closed-palette no-op、profile transitions、persistence、Help、Debug 和 input tests。
   - 未新增跨进程接口或 schema 变更。

213. **TUI live session command palette current-level deepest nested bucket label visibility threshold indicators**（已完成 [Phase224 基础实现](design/PHASE_224_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_THRESHOLD_INDICATORS.md)）
   - 已复用共享 120-column adaptive width constant。
   - 已输出 `adaptive>hidden[120]@?` 和 `adaptive>shown[120]@?`。
   - 已保持 explicit `shown@?`、`hidden@?`、profile cycling 和 persistence 不变。
   - 已同步 helper、Help、Debug 和 exact boundary tests。
   - 未新增状态、快捷键或跨进程接口。

214. **TUI live session command palette current-level deepest nested bucket label visibility threshold distance indicators**（已完成 [Phase225 基础实现](design/PHASE_225_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_THRESHOLD_DISTANCE_INDICATORS.md)）
   - 已增加 pure `120 - maxWidth` threshold-distance helper。
   - 已输出 `adaptive>hidden+1[120]@?`，阈值处及以上保持 `adaptive>shown[120]@?`。
   - explicit profiles 和 threshold 以上不显示 distance。
   - 已同步 helper、Help、Debug 和 exact boundary tests。
   - 未新增状态、快捷键或跨进程接口。

215. **TUI live session command palette current-level deepest nested bucket label visibility width indicators**（已完成 [Phase226 基础实现](design/PHASE_226_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_INDICATORS.md)）
   - 已增加 nested `current/120` width helper。
   - 已输出 `adaptive>hidden+1[119/120]@?` 和 `adaptive>shown[120/120]@?`。
   - 已保持 Phase225 distance、explicit profiles 和 profile persistence 不变。
   - 已同步 helper、Help、Debug 和 exact boundary tests。
   - 未新增状态、快捷键或跨进程接口。

216. **TUI live session command palette current-level deepest nested bucket label visibility width percentage indicators**（已完成 [Phase227 基础实现](design/PHASE_227_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_INDICATORS.md)）
   - 已复用共享 clamped width-percentage helper。
   - 已输出 `adaptive>hidden+1[119/120=99%]@?` 和 `adaptive>shown[120/120=100%]@?`。
   - 已保持 exact width、distance、explicit profiles 和 profile persistence 不变。
   - 已覆盖 119、120、180 三个百分比边界。
   - 已同步 helper、Help、Debug 和 exact boundary tests。
   - 未新增状态、快捷键或跨进程接口。

217. **TUI live session command palette current-level deepest nested bucket label visibility width percentage buckets**（已完成 [Phase228 基础实现](design/PHASE_228_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKETS.md)）
   - 已复用共享 `L/M/H` percentage-bucket helper。
   - 已输出 `adaptive>hidden+1[119/120=99%H]@?` 和 `adaptive>shown[120/120=100%H]@?`。
   - 已覆盖 low、mid、high、threshold 和 clamped-width 边界。
   - 已保持 exact width、percentage、distance、explicit profiles 和 persistence 不变。
   - 已同步 helper、Help、Debug 和 exact boundary tests。
   - 未新增状态、快捷键或跨进程接口。

218. **TUI live session command palette current-level deepest nested bucket label visibility width percentage bucket labels**（已完成 [Phase229 基础实现](design/PHASE_229_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABELS.md)）
219. **TUI live session command palette current-level deepest nested bucket label visibility controls**（已完成 [Phase230 基础实现](design/PHASE_230_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_CONTROLS.md)）
220. **TUI live session command palette current-level deepest nested bucket label visibility profiles**（已完成 [Phase231 基础实现](design/PHASE_231_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_PROFILES.md)）
221. **TUI live session command palette current-level deepest nested bucket label visibility threshold indicators**（已完成 [Phase232 基础实现](design/PHASE_232_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_THRESHOLD_INDICATORS.md)）
222. **TUI live session command palette current-level deepest nested bucket label visibility threshold distance indicators**（已完成 [Phase233 基础实现](design/PHASE_233_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_THRESHOLD_DISTANCE_INDICATORS.md)）
223. **TUI live session command palette current-level deepest nested bucket label visibility width indicators**（已完成 [Phase234 基础实现](design/PHASE_234_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_INDICATORS.md)）
224. **TUI live session command palette current-level deepest nested bucket label visibility width percentage indicators**（已完成 [Phase235 基础实现](design/PHASE_235_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_INDICATORS.md)）
225. **TUI live session command palette current-level deepest nested bucket label visibility width percentage buckets**（已完成 [Phase236 基础实现](design/PHASE_236_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKETS.md)）
226. **TUI live session command palette current-level deepest nested bucket label visibility width percentage bucket labels**（已完成 [Phase237 基础实现](design/PHASE_237_TUI_DEEPEST_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABELS.md)）
227. **TUI live session command palette current-level deepest nested bucket label text visibility controls**（已完成 [Phase238 基础实现](design/PHASE_238_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_CONTROLS.md)）
228. **TUI live session command palette current-level deepest nested bucket label text visibility profiles**（已完成 [Phase239 基础实现](design/PHASE_239_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_PROFILES.md)）
229. **TUI live session command palette current-level deepest nested bucket label text visibility threshold indicators**（已完成 [Phase240 基础实现](design/PHASE_240_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_THRESHOLD_INDICATORS.md)）
230. **TUI live session command palette current-level deepest nested bucket label text visibility threshold distance indicators**（已完成 [Phase241 基础实现](design/PHASE_241_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_THRESHOLD_DISTANCE_INDICATORS.md)）
231. **TUI live session command palette current-level deepest nested bucket label text visibility width indicators**（已完成 [Phase242 基础实现](design/PHASE_242_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_INDICATORS.md)）
232. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage indicators**（已完成 [Phase243 基础实现](design/PHASE_243_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_INDICATORS.md)）
233. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage buckets**（已完成 [Phase244 基础实现](design/PHASE_244_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKETS.md)）
234. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket labels**（已完成 [Phase245 基础实现](design/PHASE_245_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABELS.md)）
235. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label controls**（已完成 [Phase246 基础实现](design/PHASE_246_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_CONTROLS.md)）
236. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label profiles**（已完成 [Phase247 基础实现](design/PHASE_247_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_PROFILES.md)）
237. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label threshold indicators**（已完成 [Phase248 基础实现](design/PHASE_248_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_THRESHOLD_INDICATORS.md)）
238. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label threshold distance indicators**（已完成 [Phase249 基础实现](design/PHASE_249_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_THRESHOLD_DISTANCE_INDICATORS.md)）
239. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width indicators**（已完成 [Phase250 基础实现](design/PHASE_250_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_INDICATORS.md)）
240. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage indicators**（已完成 [Phase251 基础实现](design/PHASE_251_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_INDICATORS.md)）
241. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage buckets**（已完成 [Phase252 基础实现](design/PHASE_252_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKETS.md)）
242. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket labels**（已完成 [Phase253 基础实现](design/PHASE_253_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABELS.md)）
243. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label controls**（已完成 [Phase254 基础实现](design/PHASE_254_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_CONTROLS.md)）
244. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label profiles**（已完成 [Phase255 基础实现](design/PHASE_255_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_PROFILES.md)）
245. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label threshold indicators**（已完成 [Phase256 基础实现](design/PHASE_256_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_THRESHOLD_INDICATORS.md)）
246. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label threshold distance indicators**（已完成 [Phase257 基础实现](design/PHASE_257_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_THRESHOLD_DISTANCE_INDICATORS.md)）
   - 已新增仅对阈值以下 adaptive profile 返回剩余列数的纯距离 helper。
   - 已输出 `adaptive>hidden+1[120]@-` 和 `adaptive>shown[120]@-`。
   - 已保持 resolver、explicit profiles 和 persistence 不变。
   - 已同步 Help、Debug 和边界测试。
   - 未新增状态、快捷键或跨进程接口。
247. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width indicators**（已完成 [Phase258 基础实现](design/PHASE_258_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_INDICATORS.md)）
   - 已新增复用共享 120 列阈值的 `current/threshold` width helper。
   - 已输出 `adaptive>hidden+1[119/120]@-` 和 `adaptive>shown[120/120]@-`。
   - 已保持 threshold distance、explicit profiles 和 persistence 不变。
   - 已同步 helper、Help、Debug 和 119/120/180 列边界测试。
   - 未新增状态、快捷键或跨进程接口。
248. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage indicators**（已完成 [Phase259 基础实现](design/PHASE_259_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_INDICATORS.md)）
   - 已新增复用共享截断与 100% 封顶算法的 percentage helper。
   - 已输出 `adaptive>hidden+1[119/120=99%]@-` 和 `adaptive>shown[120/120=100%]@-`。
   - 已保持真实宽度、threshold distance、explicit profiles 和 persistence 不变。
   - 已同步 helper、Help、Debug 和 0/40/80/119/120/180 列边界测试。
   - 未新增状态、快捷键或跨进程接口。
249. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage buckets**（已完成 [Phase260 基础实现](design/PHASE_260_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKETS.md)）
   - 已新增复用共享边界的 `L/M/H` bucket helper。
   - 已输出 `adaptive>hidden+1[119/120=99%H]@-` 和 `adaptive>shown[120/120=100%H]@-`。
   - 已保持真实宽度、百分比封顶、threshold distance、explicit profiles 和 persistence 不变。
   - 已同步 helper、Help、Debug 和 0/39/40/79/80/119/180 列边界测试。
   - 未新增状态、快捷键或跨进程接口。
250. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket labels**（已完成 [Phase261 基础实现](design/PHASE_261_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABELS.md)）
   - 已新增复用共享映射的 `low/mid/high` bucket label helper。
   - 已输出 `adaptive>hidden+1[119/120=99%H(high)]@-` 和 `adaptive>shown[120/120=100%H(high)]@-`。
   - 已保持真实宽度、百分比、bucket、threshold distance、explicit profiles 和 persistence 不变。
   - 已同步 helper、Help、Debug 和 0/39/40/79/80/119/180 列边界测试。
   - 未新增状态、快捷键或跨进程接口。
251. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label controls**（已完成 [Phase262 基础实现](design/PHASE_262_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_CONTROLS.md)）
   - 已新增默认开启且跨面板重开保持的文字标签显隐状态。
   - 已使用 `#` 映射面板内 toggle action，并输出 `on@#` / `off@#` indicator。
   - 已保持 `L/M/H`、profile、阈值距离和跨进程接口不变。
   - 已同步 formatter、Help、Debug、reducer 和输入映射测试。
252. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label profiles**（已完成 [Phase263 基础实现](design/PHASE_263_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_PROFILES.md)）
   - 已将布尔状态升级为默认 `shown` 的三档本地 profile。
   - 已复用 `#` 实现循环，并在 120 列边界解析 adaptive 有效值。
   - 已同步 resolver、formatter、Help、Debug、reducer 和输入映射测试。
   - 未修改跨进程接口或 session schema。
253. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label threshold indicators**（已完成 [Phase264 基础实现](design/PHASE_264_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_THRESHOLD_INDICATORS.md)）
   - 已在最新 adaptive indicator 中显示共享 `[120]` 阈值。
   - 已覆盖 119 列 `hidden[120]` 和 120 列 `shown[120]` 边界。
   - 已保持显式 profile、resolver、formatter 和跨层接口不变。
254. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label threshold distance indicators**（已完成 [Phase265 基础实现](design/PHASE_265_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_THRESHOLD_DISTANCE_INDICATORS.md)）
   - 已新增仅对阈值以下 adaptive profile 返回剩余列数的纯 helper。
   - 已输出 `adaptive>hidden+1[120]@#` 与 `adaptive>shown[120]@#`。
   - 已保持显式 profile、resolver 和跨层接口不变。
255. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width indicators**（已完成 [Phase266 基础实现](design/PHASE_266_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_INDICATORS.md)）
   - 已新增共享阈值驱动的 `current/threshold` helper。
   - 已输出 `adaptive>hidden+1[119/120]@#` 与 `adaptive>shown[120/120]@#`。
   - 未新增状态、快捷键或跨进程接口。
256. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage indicators**（已完成 [Phase267 基础实现](design/PHASE_267_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_INDICATORS.md)）
   - 已加入共享算法驱动的百分比并在 100% 封顶。
   - 已输出 `adaptive>hidden+1[119/120=99%]@#` 与 `adaptive>shown[120/120=100%]@#`。
257. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage buckets**（已完成 [Phase268 基础实现](design/PHASE_268_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKETS.md)）
   - 已复用共享边界新增 `L/M/H` bucket helper。
   - 已输出 `adaptive>hidden+1[119/120=99%H]@#` 与 `adaptive>shown[120/120=100%H]@#`。
   - 未新增状态、快捷键或跨进程接口。
258. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket labels**（已完成 [Phase269 基础实现](design/PHASE_269_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABELS.md)）
   - 已复用共享映射新增 `low/mid/high` label helper。
   - 已输出 `adaptive>hidden+1[119/120=99%H(high)]@#` 与 `adaptive>shown[120/120=100%H(high)]@#`。
259. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label controls**（已完成 [Phase270 基础实现](design/PHASE_270_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_CONTROLS.md)）
   - 已新增 `$` 面板快捷键与本地持久布尔状态，独立控制最新 `(low/mid/high)` 标签。
   - 已让 formatter、Help 与 Debug 共享状态，关闭标签时仍保留 `L/M/H`。
   - 未改变 protocol、Python Engine 或 session schema。
260. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label profiles**（已完成 [Phase271 基础实现](design/PHASE_271_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_PROFILES.md)）
   - 已将 `$` 布尔控制升级为 `shown/hidden/adaptive` 三档配置。
   - 已在共享 120 列边界解析 adaptive，并让 formatter、Help 与 Debug 复用 resolver。
   - 未改变跨进程接口或 session schema。
261. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label threshold indicators**（已完成 [Phase272 基础实现](design/PHASE_272_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_THRESHOLD_INDICATORS.md)）
   - 已让最新 adaptive indicator 显式输出共享 `[120]` 阈值。
   - 已覆盖 119 列 `hidden[120]` 与 120 列 `shown[120]` 边界。
   - 未新增状态、action、快捷键或跨进程接口。
262. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label threshold distance indicators**（已完成 [Phase273 基础实现](design/PHASE_273_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_THRESHOLD_DISTANCE_INDICATORS.md)）
   - 已新增纯 threshold-distance helper，仅为低于 120 列的 adaptive profile 返回正距离。
   - 119 列输出 `adaptive>hidden+1[120]@$`，达到阈值后距离消失。
   - 未新增状态、action、快捷键或跨进程接口。
263. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width indicators**（已完成 [Phase274 基础实现](design/PHASE_274_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_INDICATORS.md)）
   - 已新增共享阈值驱动的 `current/threshold` width helper。
   - 已输出 `adaptive>hidden+1[119/120]@$` 与 `adaptive>shown[120/120]@$`。
   - 未新增状态、action、快捷键或跨进程接口。
264. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage indicators**（已完成 [Phase275 基础实现](design/PHASE_275_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_INDICATORS.md)）
   - 已复用同层级 percentage helper 并在 100% 封顶。
   - 已输出 `adaptive>hidden+1[119/120=99%]@$` 与 `adaptive>shown[120/120=100%]@$`。
   - 未新增状态、action、快捷键或跨进程接口。
265. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage buckets**（已完成 [Phase276 基础实现](design/PHASE_276_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKETS.md)）
   - 已复用共享边界新增 `L/M/H` bucket 输出。
   - 已输出 `adaptive>hidden+1[119/120=99%H]@$` 与 `adaptive>shown[120/120=100%H]@$`。
   - 未新增状态、action、快捷键或跨进程接口。
266. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket labels**（已完成 [Phase277 基础实现](design/PHASE_277_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABELS.md)）
   - 已复用共享映射新增 `low/mid/high` label 输出。
   - 已输出 `adaptive>hidden+1[119/120=99%H(high)]@$` 与 `adaptive>shown[120/120=100%H(high)]@$`。
   - 未新增状态、action、快捷键或跨进程接口。
267. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label controls**（已完成 [Phase278 基础实现](design/PHASE_278_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_CONTROLS.md)）
   - 已新增命令面板内 `0` 快捷键与本地持久布尔状态，独立控制最新 `(low/mid/high)` 标签。
   - 已让 formatter、Help 与 Debug 共享状态，关闭标签时仍保留 `L/M/H`。
   - 未改变 protocol、Python Engine 或 session schema。
268. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label profiles**（已完成 [Phase279 基础实现](design/PHASE_279_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_PROFILES.md)）
   - 已将 `0` 布尔控制升级为 `shown/hidden/adaptive` 三档配置。
   - 已在共享 120 列边界解析 adaptive，并让 formatter、Help 与 Debug 复用 resolver。
   - 未改变跨进程接口或 session schema。
269. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label threshold indicators**（已完成 [Phase280 基础实现](design/PHASE_280_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_THRESHOLD_INDICATORS.md)）
   - 已让最新 adaptive indicator 显式输出共享 `[120]` 阈值。
   - 已覆盖 119 列 `hidden[120]` 与 120 列 `shown[120]` 边界。
   - 未新增状态、action、快捷键或跨进程接口。
270. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label threshold distance indicators**（已完成 [Phase281 基础实现](design/PHASE_281_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_THRESHOLD_DISTANCE_INDICATORS.md)）
   - 已新增纯 threshold-distance helper，仅为低于 120 列的 adaptive profile 返回正距离。
   - 119 列输出 `adaptive>hidden+1[120]@0`，达到阈值后距离消失。
   - 未新增状态、action、快捷键或跨进程接口。
271. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width indicators**（已完成 [Phase282 基础实现](design/PHASE_282_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_INDICATORS.md)）
   - 已新增共享阈值驱动的 `current/threshold` width helper。
   - 已输出 `adaptive>hidden+1[119/120]@0` 与 `adaptive>shown[120/120]@0`。
   - 未新增状态、action、快捷键或跨进程接口。
272. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage indicators**（已完成 [Phase283 基础实现](design/PHASE_283_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_INDICATORS.md)）
   - 已复用同层 percentage helper，在最新 width indicator 中追加归一化百分比。
   - 已输出 `adaptive>hidden+1[119/120=99%]@0` 与 `adaptive>shown[120/120=100%]@0`。
   - 180 列保留真实宽度并将百分比封顶为 100%，且未新增状态、action、快捷键或跨进程接口。
273. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage buckets**（已完成 [Phase284 基础实现](design/PHASE_284_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKETS.md)）
   - 已复用同层 bucket helper，在最新百分比提示后追加 `L/M/H`。
   - 已输出 `adaptive>hidden+1[119/120=99%H]@0` 与 `adaptive>shown[120/120=100%H]@0`。
   - 未新增状态、action、快捷键、文字标签或跨进程接口。
274. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket labels**（已完成 [Phase285 基础实现](design/PHASE_285_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABELS.md)）
   - 已复用同层 label helper，在最新 `L/M/H` 后追加 `low/mid/high`。
   - 已输出 `adaptive>hidden+1[119/120=99%H(high)]@0` 与 `adaptive>shown[120/120=100%H(high)]@0`。
   - 未新增状态、action、快捷键或跨进程接口。
275. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label controls**（已完成 [Phase286 基础实现](design/PHASE_286_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_CONTROLS.md)）
   - 已新增默认开启的本地布尔状态，并用命令面板快捷键 `9` 切换。
   - 关闭时最新 formatter 从 `H(high)` 收缩为 `H`，Help 与 Debug 同步展示 `on/off@9`。
   - 状态不进入跨进程协议，面板关闭时 action no-op，重开后设置保持。
276. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label profiles**（已完成 [Phase287 基础实现](design/PHASE_287_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_PROFILES.md)）
   - 已将最新布尔状态升级为 `shown/hidden/adaptive` profile，并复用快捷键 `9` 循环。
   - adaptive resolver 在共享 120 列边界解析，formatter、Help、Debug 与 control indicator 使用同一有效值。
   - profile 保持 TS Host TUI 本地状态，不进入跨进程协议或持久化 session schema。
277. **TUI live session command palette current-level deepest nested bucket label text visibility width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label width percentage bucket label threshold indicators**（已完成 [Phase288 基础实现](design/PHASE_288_TUI_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABEL_THRESHOLD_INDICATORS.md)）
   - 已在最新 adaptive indicator 中显式追加共享 `[120]` 阈值。
   - 119 列输出 `adaptive>hidden[120]@9`，120 列输出 `adaptive>shown[120]@9`。
   - 未新增状态、action、快捷键或跨进程接口。
278. **TUI live session command palette current-level latest bucket label threshold distance indicators**（已完成 [Phase289 基础实现](design/PHASE_289_TUI_LATEST_BUCKET_LABEL_THRESHOLD_DISTANCE_INDICATORS.md)）
   - 已新增纯 threshold-distance helper，仅为低于 120 列的 adaptive profile 返回正距离。
   - 119 列输出 `adaptive>hidden+1[120]@9`，达到阈值后距离消失。
   - 未新增状态、action、快捷键或跨进程接口。
279. **TUI live session command palette current-level latest bucket label width indicators**（已完成 [Phase290 基础实现](design/PHASE_290_TUI_LATEST_BUCKET_LABEL_WIDTH_INDICATORS.md)）
   - 已新增共享阈值驱动的 `current/threshold` width helper。
   - 已输出 `adaptive>hidden+1[119/120]@9` 与 `adaptive>shown[120/120]@9`。
   - 未新增状态、action、快捷键或跨进程接口。
280. **TUI live session command palette current-level latest bucket label width percentage indicators**（已完成 [Phase291 基础实现](design/PHASE_291_TUI_LATEST_BUCKET_LABEL_WIDTH_PERCENTAGE_INDICATORS.md)）
   - 已复用既有 percentage helper，在最新 width indicator 中追加归一化百分比。
   - 已输出 `adaptive>hidden+1[119/120=99%]@9` 与 `adaptive>shown[120/120=100%]@9`。
   - 180 列保留真实宽度并将百分比封顶为 100%，且未新增状态、action、快捷键或跨进程接口。
281. **TUI live session command palette current-level latest bucket label width percentage buckets**（已完成 [Phase292 基础实现](design/PHASE_292_TUI_LATEST_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKETS.md)）
   - 已复用既有 bucket helper，在最新百分比提示后追加 `L/M/H`。
   - 已输出 `adaptive>hidden+1[119/120=99%H]@9` 与 `adaptive>shown[120/120=100%H]@9`。
   - 未新增状态、action、快捷键、文字标签或跨进程接口。
282. **TUI live session command palette current-level latest bucket label width percentage bucket labels**（已完成 [Phase293 基础实现](design/PHASE_293_TUI_LATEST_BUCKET_LABEL_WIDTH_PERCENTAGE_BUCKET_LABELS.md)）
   - 已复用既有 label helper，在最新 `L/M/H` 后追加 `low/mid/high`。
   - 已输出 `adaptive>hidden+1[119/120=99%H(high)]@9` 与 `adaptive>shown[120/120=100%H(high)]@9`。
   - 未新增状态、action、快捷键或跨进程接口。
283. **TUI live session command palette current-level latest bucket label controls**（已完成 [Phase294 基础实现](design/PHASE_294_TUI_LATEST_BUCKET_LABEL_CONTROLS.md)）
   - 已新增默认开启的本地布尔状态，并用命令面板快捷键 `8` 切换。
   - 关闭时最新 formatter 从 `H(high)` 收缩为 `H`，Help 与 Debug 同步展示 `on/off@8`。
   - 状态不进入跨进程协议，面板关闭时 action no-op，重开后设置保持。
284. **TUI live session command palette current-level latest bucket label profiles**（已完成 [Phase295 基础实现](design/PHASE_295_TUI_LATEST_BUCKET_LABEL_PROFILES.md)）
   - 已将最新布尔状态升级为 `shown/hidden/adaptive` profile，并复用快捷键 `8` 循环。
   - adaptive 按共享 120 列阈值解析，formatter、Help、Debug 与 control indicator 使用同一结果。
   - profile 不进入跨进程协议，面板关闭时 action no-op，重开后设置保持。
285. **TUI live session command palette current-level latest bucket label threshold indicators**（已完成 [Phase296 基础实现](design/PHASE_296_TUI_LATEST_BUCKET_LABEL_THRESHOLD_INDICATORS.md)）
   - 已在最新 adaptive control indicator 中显式追加共享 `[120]` 阈值。
   - 显式 `shown/hidden` 输出保持不变，Help 与 Debug 复用同一 indicator。
   - 未新增状态、action、快捷键或跨进程接口。
286. **TUI live session command palette current-level latest bucket label threshold distance**（已完成 [Phase297 基础实现](design/PHASE_297_TUI_LATEST_BUCKET_LABEL_THRESHOLD_DISTANCE.md)）
   - 已新增纯函数，仅在 adaptive 且宽度低于 120 时返回剩余列数。
   - 119 列输出 `adaptive>hidden+1[120]@8`，120 列保持 `adaptive>shown[120]@8`。
   - 未新增状态、action、快捷键、配置项或跨进程接口。
287. **TUI live session command palette current-level latest bucket label width indicator**（已完成 [Phase298 基础实现](design/PHASE_298_TUI_LATEST_BUCKET_LABEL_WIDTH_INDICATOR.md)）
   - 已新增纯 width helper，统一输出 `current/threshold`。
   - 119/120 边界输出升级为 `[119/120]` 与 `[120/120]`，Help 和 Debug 同步复用。
   - 未新增状态、action、快捷键或跨进程接口。
288. **TUI live session command palette current-level latest bucket label width percentage**（已完成 [Phase299 基础实现](design/PHASE_299_TUI_LATEST_BUCKET_LABEL_WIDTH_PERCENTAGE.md)）
   - 已新增同层 percentage helper，并复用共享整数截断与 100% 封顶规则。
   - 119/120 边界输出升级为 `[119/120=99%]` 与 `[120/120=100%]`。
   - 未新增状态、action、快捷键或跨进程接口。
289. **TUI live session command palette current-level latest bucket label width bucket**（已完成 [Phase300 基础实现](design/PHASE_300_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET.md)）
   - 已新增同层 bucket helper，并复用共享的 L/M/H 分段边界。
   - 119/120 边界输出升级为 `[119/120=99%H]` 与 `[120/120=100%H]`。
   - 未新增文字标签、状态、action、快捷键或跨进程接口。
290. **TUI live session command palette current-level latest bucket label width bucket label**（已完成 [Phase301 基础实现](design/PHASE_301_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL.md)）
   - 已新增同层 label helper，并复用共享的 low/mid/high 映射。
   - 119/120 边界输出升级为 `[119/120=99%H(high)]` 与 `[120/120=100%H(high)]`。
   - 未新增状态、action、快捷键或跨进程接口。
291. **TUI live session command palette current-level latest bucket label control**（已完成 [Phase302 基础实现](design/PHASE_302_TUI_LATEST_BUCKET_LABEL_CONTROL.md)）
   - 已新增默认开启的本地布尔状态，并用命令面板快捷键 `7` 切换。
   - 关闭时最新 formatter 从 `H(high)` 收缩为 `H`，Help 与 Debug 同步展示 `on/off@7`。
   - 状态不进入跨进程协议，面板关闭时 action no-op，重开后设置保持。
292. **TUI live session command palette current-level latest bucket label profile**（已完成 [Phase303 基础实现](design/PHASE_303_TUI_LATEST_BUCKET_LABEL_PROFILE.md)）
   - 已将最新布尔状态升级为 `shown/hidden/adaptive` profile，并复用快捷键 `7` 循环。
   - adaptive 按共享 120 列阈值解析，formatter、Help、Debug 与 control indicator 使用同一结果。
   - profile 不进入跨进程协议，面板关闭时 action no-op，重开后设置保持。
293. **TUI live session command palette current-level latest bucket label threshold indicator**（已完成 [Phase304 基础实现](design/PHASE_304_TUI_LATEST_BUCKET_LABEL_THRESHOLD_INDICATOR.md)）
   - 已在最新 adaptive control indicator 中显式追加共享 `[120]` 阈值。
   - 显式 `shown/hidden` 输出保持不变，Help 与 Debug 复用同一 indicator。
   - 未新增状态、action、快捷键或跨进程接口。
294. **TUI live session command palette current-level latest bucket label threshold distance**（已完成 [Phase305 基础实现](design/PHASE_305_TUI_LATEST_BUCKET_LABEL_THRESHOLD_DISTANCE.md)）
   - 已新增纯函数，仅在 adaptive 且宽度低于 120 时返回剩余列数。
   - 119 列输出 `adaptive>hidden+1[120]@7`，120 列保持 `adaptive>shown[120]@7`。
   - 未新增状态、action、快捷键、配置项或跨进程接口。
295. **TUI live session command palette current-level latest bucket label width indicator**（已完成 [Phase306 基础实现](design/PHASE_306_TUI_LATEST_BUCKET_LABEL_WIDTH_INDICATOR.md)）
   - 已新增纯 width helper，统一输出 `current/threshold`。
   - 119/120 边界输出升级为 `[119/120]` 与 `[120/120]`，Help 和 Debug 同步复用。
   - 未新增状态、action、快捷键或跨进程接口。
296. **TUI live session command palette current-level latest bucket label width percentage**（已完成 [Phase307 基础实现](design/PHASE_307_TUI_LATEST_BUCKET_LABEL_WIDTH_PERCENTAGE.md)）
   - 已新增同层 percentage helper，并复用共享整数截断与 100% 封顶规则。
   - 119/120 边界输出升级为 `[119/120=99%]` 与 `[120/120=100%]`。
   - 未新增状态、action、快捷键或跨进程接口。
297. **TUI live session command palette current-level latest bucket label width bucket**（已完成 [Phase308 基础实现](design/PHASE_308_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET.md)）
   - 已新增同层 bucket helper，并复用共享的 L/M/H 分段边界。
   - 119/120 边界输出升级为 `[119/120=99%H]` 与 `[120/120=100%H]`。
   - 未新增文字标签、状态、action、快捷键或跨进程接口。
298. **TUI live session command palette current-level latest bucket label width bucket label**（已完成 [Phase309 基础实现](design/PHASE_309_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL.md)）
   - 已新增同层 label helper，并复用共享的 low/mid/high 映射。
   - 119/120 边界输出升级为 `[119/120=99%H(high)]` 与 `[120/120=100%H(high)]`。
   - 未新增状态、action、快捷键或跨进程接口。
299. **TUI live session command palette current-level latest bucket label control**（已完成 [Phase310 基础实现](design/PHASE_310_TUI_LATEST_BUCKET_LABEL_CONTROL.md)）
   - 已新增默认开启的本地布尔状态，并用命令面板快捷键 `6` 切换。
   - 关闭时最新 formatter 从 `H(high)` 收缩为 `H`，Help 与 Debug 同步展示 `on/off@6`。
   - 状态不进入跨进程协议，面板关闭时 action no-op，重开后设置保持。
300. **TUI live session command palette current-level latest bucket label profile**（已完成 [Phase311 基础实现](design/PHASE_311_TUI_LATEST_BUCKET_LABEL_PROFILE.md)）
   - 已将布尔状态升级为默认 `shown` 的 `shown/hidden/adaptive` 三档 profile。
   - `adaptive` 复用共享 120 列阈值，119/120 分别解析为 `hidden/shown`。
   - Input、Reducer、formatter、Help、Debug 与 control indicator 共用配置，且不进入跨进程协议。
301. **TUI live session command palette current-level latest bucket label threshold**（已完成 [Phase312 基础实现](design/PHASE_312_TUI_LATEST_BUCKET_LABEL_THRESHOLD.md)）
   - adaptive control indicator 显式展示共享的 `[120]` 切换阈值。
   - 119/120 列分别输出 `adaptive>hidden[120]@6` 与 `adaptive>shown[120]@6`。
   - 显式 profile、状态机、标签显隐判定和跨进程协议保持不变。
302. **TUI live session command palette current-level latest bucket label threshold distance**（已完成 [Phase313 基础实现](design/PHASE_313_TUI_LATEST_BUCKET_LABEL_THRESHOLD_DISTANCE.md)）
   - 已新增纯 threshold-distance helper，仅为阈值以下的 adaptive profile 返回剩余列数。
   - 119/120 列分别输出 `adaptive>hidden+1[120]@6` 与 `adaptive>shown[120]@6`。
   - 显式 profile、状态机、标签显隐判定和跨进程协议保持不变。
303. **TUI live session command palette current-level latest bucket label width indicator**（已完成 [Phase314 基础实现](design/PHASE_314_TUI_LATEST_BUCKET_LABEL_WIDTH_INDICATOR.md)）
   - 已新增纯 width helper，复用共享阈值生成 `current/threshold`。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120]@6` 与 `adaptive>shown[120/120]@6`。
   - 显式 profile、状态机、标签显隐判定和跨进程协议保持不变。
304. **TUI live session command palette current-level latest bucket label width percentage**（已完成 [Phase315 基础实现](design/PHASE_315_TUI_LATEST_BUCKET_LABEL_WIDTH_PERCENTAGE.md)）
   - 已新增同层 percentage helper，并复用共享整数截断和 100% 封顶算法。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120=99%]@6` 与 `adaptive>shown[120/120=100%]@6`。
   - 显式 profile、状态机、标签显隐判定和跨进程协议保持不变。
305. **TUI live session command palette current-level latest bucket label width bucket**（已完成 [Phase316 基础实现](design/PHASE_316_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET.md)）
   - 已新增同层 bucket helper，并复用共享的 L/M/H 分段边界。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120=99%H]@6` 与 `adaptive>shown[120/120=100%H]@6`。
   - 未新增文字标签、状态、action、快捷键或跨进程接口。
306. **TUI live session command palette current-level latest bucket label width bucket label**（已完成 [Phase317 基础实现](design/PHASE_317_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL.md)）
   - 已新增同层 label helper，并复用共享的 low/mid/high 映射。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120=99%H(high)]@6` 与 `adaptive>shown[120/120=100%H(high)]@6`。
   - 未新增状态、action、快捷键或跨进程接口。
307. **TUI live session command palette current-level latest bucket label control**（已完成 [Phase318 基础实现](design/PHASE_318_TUI_LATEST_BUCKET_LABEL_CONTROL.md)）
   - 已新增默认开启的本地布尔状态，并用命令面板快捷键 `5` 切换。
   - 关闭时最新 formatter 从 `H(high)` 收缩为 `H`，Help 与 Debug 同步展示 `on/off@5`。
   - 状态不进入跨进程协议，面板关闭时 action no-op，重开后设置保持。
308. **TUI live session command palette current-level latest bucket label profile**（已完成 [Phase319 基础实现](design/PHASE_319_TUI_LATEST_BUCKET_LABEL_PROFILE.md)）
   - 已将布尔状态升级为默认 `shown` 的 `shown/hidden/adaptive` 三档 profile。
   - `adaptive` 复用共享 120 列阈值，119/120 分别解析为 `hidden/shown`。
   - Input、Reducer、formatter、Help、Debug 与 control indicator 共用配置，且不进入跨进程协议。
309. **TUI live session command palette current-level latest bucket label threshold**（已完成 [Phase320 基础实现](design/PHASE_320_TUI_LATEST_BUCKET_LABEL_THRESHOLD.md)）
   - adaptive control indicator 显式展示共享的 `[120]` 切换阈值。
   - 119/120 列分别输出 `adaptive>hidden[120]@5` 与 `adaptive>shown[120]@5`。
   - 显式 profile、状态机、标签显隐判定和跨进程协议保持不变。
310. **TUI live session command palette current-level latest bucket label threshold distance**（已完成 [Phase321 基础实现](design/PHASE_321_TUI_LATEST_BUCKET_LABEL_THRESHOLD_DISTANCE.md)）
   - 已新增纯 threshold-distance helper，仅为阈值以下的 adaptive profile 返回剩余列数。
   - 119/120 列分别输出 `adaptive>hidden+1[120]@5` 与 `adaptive>shown[120]@5`。
   - 显式 profile、状态机、标签显隐判定和跨进程协议保持不变。
311. **TUI live session command palette current-level latest bucket label width indicator**（已完成 [Phase322 基础实现](design/PHASE_322_TUI_LATEST_BUCKET_LABEL_WIDTH_INDICATOR.md)）
   - 已新增纯 width helper，复用共享阈值生成 `current/threshold`。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120]@5` 与 `adaptive>shown[120/120]@5`。
   - 显式 profile、状态机、标签显隐判定和跨进程协议保持不变。
312. **TUI live session command palette current-level latest bucket label width percentage**（已完成 [Phase323 基础实现](design/PHASE_323_TUI_LATEST_BUCKET_LABEL_WIDTH_PERCENTAGE.md)）
   - 已新增同层 percentage helper，并复用共享整数截断和 100% 封顶算法。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120=99%]@5` 与 `adaptive>shown[120/120=100%]@5`。
   - 显式 profile、状态机、标签显隐判定和跨进程协议保持不变。
313. **TUI live session command palette current-level latest bucket label width bucket**（已完成 [Phase324 基础实现](design/PHASE_324_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET.md)）
   - 已新增同层 bucket helper，并复用共享的 L/M/H 分段边界。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120=99%H]@5` 与 `adaptive>shown[120/120=100%H]@5`。
   - 未新增文字标签、状态、action、快捷键或跨进程接口。
314. **TUI live session command palette current-level latest bucket label width bucket label**（已完成 [Phase325 基础实现](design/PHASE_325_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL.md)）
   - 已新增同层 label helper，并复用共享的 low/mid/high 映射。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120=99%H(high)]@5` 与 `adaptive>shown[120/120=100%H(high)]@5`。
   - 未新增状态、action、快捷键或跨进程接口。
315. **TUI live session command palette current-level latest bucket label control**（已完成 [Phase326 基础实现](design/PHASE_326_TUI_LATEST_BUCKET_LABEL_CONTROL.md)）
   - 已新增默认开启的本地布尔状态，并用命令面板快捷键 `4` 切换。
   - 关闭时最新 formatter 从 `H(high)` 收缩为 `H`，Help 与 Debug 同步展示 `on`/`off` 与快捷键 `4`。
   - 状态不进入跨进程协议，面板关闭时 action no-op，重开后设置保持。
316. **TUI live session command palette current-level latest bucket label profile**（已完成 [Phase327 基础实现](design/PHASE_327_TUI_LATEST_BUCKET_LABEL_PROFILE.md)）
   - 已将布尔状态升级为 `shown/hidden/adaptive`，快捷键 `4` 循环切换并持久保持。
   - adaptive 复用共享 120 列阈值；119 列隐藏文字标签，120 列显示文字标签。
   - formatter、父级 `5` indicator、Help 与 Debug 共用 resolver，且不改变跨进程协议。
317. **TUI live session command palette current-level latest bucket label threshold**（已完成 [Phase328 基础实现](design/PHASE_328_TUI_LATEST_BUCKET_LABEL_THRESHOLD.md)）
   - adaptive control indicator 显式展示 resolver 使用的共享 `[120]` 阈值。
   - 阈值提示由固定 `[120]` 演进为当前的 `adaptive>hidden+1[119/120=99%H(high)]@4` 与 `adaptive>shown[120/120=100%H(high)]@4`。
   - 显式 profile、状态机、快捷键和跨进程协议保持不变。
318. **TUI live session command palette current-level latest bucket label threshold distance**（已完成 [Phase329 基础实现](design/PHASE_329_TUI_LATEST_BUCKET_LABEL_THRESHOLD_DISTANCE.md)）
   - 已新增纯 threshold-distance helper，仅在 adaptive 且宽度低于 120 列时返回剩余列数。
   - 80/119/120 列分别形成 `+40`、`+1` 和无距离提示。
   - Help、Debug 与 control indicator 共用 helper，不改变状态机或跨进程协议。
319. **TUI live session command palette current-level latest bucket label width indicator**（已完成 [Phase330 基础实现](design/PHASE_330_TUI_LATEST_BUCKET_LABEL_WIDTH_INDICATOR.md)）
   - 已新增纯 width indicator helper，统一输出 `current/threshold`。
   - 宽度提示已演进为当前的 `adaptive>hidden+1[119/120=99%H(high)]@4` 与 `adaptive>shown[120/120=100%H(high)]@4`。
   - Help、Debug 与 control indicator 共用 helper，不改变状态机或跨进程协议。
320. **TUI live session command palette current-level latest bucket label width percentage**（已完成 [Phase331 基础实现](design/PHASE_331_TUI_LATEST_BUCKET_LABEL_WIDTH_PERCENTAGE.md)）
   - 已新增同层 percentage helper，沿用整数截断、最小 0 和最大 100 的共享规则。
   - 百分比提示已演进为当前的 `adaptive>hidden+1[119/120=99%H(high)]@4` 与 `adaptive>shown[120/120=100%H(high)]@4`。
   - width helper、Help、Debug 与 control indicator 共用百分比结果，不改变跨进程协议。
321. **TUI live session command palette current-level latest bucket label width bucket**（已完成 [Phase332 基础实现](design/PHASE_332_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET.md)）
   - 已新增同层 bucket helper，并复用共享的 `L/M/H` 分段算法。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120=99%H(high)]@4` 与 `adaptive>shown[120/120=100%H(high)]@4`。
   - 未新增文字标签、状态、action、快捷键或跨进程接口。
322. **TUI live session command palette current-level latest bucket label width bucket label**（已完成 [Phase333 基础实现](design/PHASE_333_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL.md)）
   - 已新增同层 label helper，并复用共享的 low/mid/high 映射。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120=99%H(high)]@4` 与 `adaptive>shown[120/120=100%H(high)]@4`。
   - 未新增状态、action、快捷键或跨进程接口。
323. **TUI live session command palette current-level latest bucket label control**（已完成 [Phase334 基础实现](design/PHASE_334_TUI_LATEST_BUCKET_LABEL_CONTROL.md)）
   - 已新增默认开启的本地布尔状态，并用命令面板快捷键 `3` 切换。
   - 关闭时最新 formatter 从 `H(high)` 收缩为 `H`，Help 与 Debug 同步展示控制状态。
   - 面板外 `3` 继续关闭所选 live session；状态不进入跨进程协议。
324. **TUI live session command palette current-level latest bucket label profile**（已完成 [Phase335 基础实现](design/PHASE_335_TUI_LATEST_BUCKET_LABEL_PROFILE.md)）
   - 已将快捷键 `3` 的布尔控制升级为 `shown/hidden/adaptive` 三档 profile。
   - adaptive 复用共享 120 列阈值；119 列隐藏文字标签，120 列显示文字标签。
   - formatter、父级 `4` indicator、Help 与 Debug 共用 resolver，不改变跨进程协议。
325. **TUI live session command palette current-level latest bucket label threshold**（已完成 [Phase336 基础实现](design/PHASE_336_TUI_LATEST_BUCKET_LABEL_THRESHOLD.md)）
   - adaptive control indicator 显式展示 resolver 使用的共享 `[120]` 阈值。
   - 119/120 列分别输出 `adaptive>hidden[120]@3` 与 `adaptive>shown[120]@3`。
   - 显式 profile、状态机、快捷键和跨进程协议保持不变。
326. **TUI live session command palette current-level latest bucket label threshold distance**（已完成 [Phase337 基础实现](design/PHASE_337_TUI_LATEST_BUCKET_LABEL_THRESHOLD_DISTANCE.md)）
   - 已新增纯 threshold-distance helper，仅在 adaptive 且宽度低于 120 列时返回剩余列数。
   - 80/119/120 列分别形成 `+40`、`+1` 和无距离提示。
   - Help、Debug 与 control indicator 共用 helper，不改变状态机或跨进程协议。
327. **TUI live session command palette current-level latest bucket label width indicator**（已完成 [Phase338 基础实现](design/PHASE_338_TUI_LATEST_BUCKET_LABEL_WIDTH_INDICATOR.md)）
   - 已新增纯 width indicator helper，统一输出 `current/threshold`。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120]@3` 与 `adaptive>shown[120/120]@3`。
   - Help、Debug 与 control indicator 共用 helper，不改变状态机或跨进程协议。
328. **TUI live session command palette current-level latest bucket label width percentage**（已完成 [Phase339 基础实现](design/PHASE_339_TUI_LATEST_BUCKET_LABEL_WIDTH_PERCENTAGE.md)）
   - 已新增同层 percentage helper，沿用整数截断、最小 0 和最大 100 的共享规则。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120=99%]@3` 与 `adaptive>shown[120/120=100%]@3`。
   - width helper、Help、Debug 与 control indicator 共用百分比结果，不改变跨进程协议。
329. **TUI live session command palette current-level latest bucket label width bucket**（已完成 [Phase340 基础实现](design/PHASE_340_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET.md)）
   - 已新增同层 bucket helper，并复用共享的 `L/M/H` 分段算法。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120=99%H]@3` 与 `adaptive>shown[120/120=100%H]@3`。
   - 未新增文字标签、状态、action、快捷键或跨进程接口。
330. **TUI live session command palette current-level latest bucket label width bucket label**（已完成 [Phase341 基础实现](design/PHASE_341_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL.md)）
   - 已新增同层 label helper，并复用共享的 low/mid/high 映射。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120=99%H(high)]@3` 与 `adaptive>shown[120/120=100%H(high)]@3`。
   - 未新增状态、action、快捷键或跨进程接口。
331. **TUI live session command palette current-level latest bucket label width bucket label visibility**（已完成 [Phase342 基础实现](design/PHASE_342_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY.md)）
   - 已新增命令面板局部布尔状态，默认显示最新 `low/mid/high` 文字标签。
   - 命令面板内快捷键 `2` 切换文字标签显隐，面板外 `2` 继续执行既有 live-session pin action。
   - Help、Debug、control indicator 与 width formatter 共用状态；关闭后保留 `L/M/H`，仅移除括号文字标签。
332. **TUI live session command palette current-level latest bucket label width bucket label visibility profile**（已完成 [Phase343 基础实现](design/PHASE_343_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_PROFILE.md)）
   - 快捷键 `2` 状态升级为 `shown/hidden/adaptive`，按固定顺序循环并跨面板重开保持。
   - adaptive 复用共享 120 列阈值，119 列隐藏文字标签、120 列显示文字标签。
   - 子级 indicator、父级 `3` formatter、Help 和 Debug 共用 resolver；面板外 pin 行为不变。
333. **TUI live session command palette current-level latest bucket label width bucket label visibility threshold**（已完成 [Phase344 基础实现](design/PHASE_344_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_THRESHOLD.md)）
   - adaptive 子级 indicator 直接复用共享 120 列阈值并追加 `[120]`。
   - 119/120 列分别输出 `adaptive>hidden[120]@2` 与 `adaptive>shown[120]@2`。
   - 未新增状态、action、快捷键或跨进程接口，显式 profile 输出保持不变。
334. **TUI live session command palette current-level latest bucket label width bucket label visibility threshold distance**（已完成 [Phase345 基础实现](design/PHASE_345_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_THRESHOLD_DISTANCE.md)）
   - 新增纯距离 helper，仅在 adaptive 且宽度低于 120 列时返回剩余列数。
   - 80/119/120 列分别输出 `adaptive>hidden+40[120]@2`、`adaptive>hidden+1[120]@2`、`adaptive>shown[120]@2`。
   - Help、Debug 与 indicator 共用 helper，不改变 resolver、状态机或跨进程接口。
335. **TUI live session command palette current-level latest bucket label width bucket label visibility width indicator**（已完成 [Phase346 基础实现](design/PHASE_346_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_INDICATOR.md)）
   - 新增纯 width helper，统一输出 `current/threshold` 并复用共享 120 列常量。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120]@2` 与 `adaptive>shown[120/120]@2`。
   - Help、Debug 与 indicator 共用 helper，不改变状态机、resolver 或跨进程协议。
336. **TUI live session command palette current-level latest bucket label width bucket label visibility width percentage**（已完成 [Phase347 基础实现](design/PHASE_347_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE.md)）
   - 最新 percentage helper 复用共享整数截断、最小 0、最大 100 的归一化算法。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120=99%]@2` 与 `adaptive>shown[120/120=100%]@2`。
   - width helper、Help、Debug 与 indicator 共用百分比结果，不改变跨进程接口。
337. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket**（已完成 [Phase348 基础实现](design/PHASE_348_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET.md)）
   - 最新 bucket helper 复用共享 `L/M/H` 分段算法和既有边界。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120=99%H]@2` 与 `adaptive>shown[120/120=100%H]@2`。
   - 未新增文字标签、状态、action、快捷键或跨进程接口。
338. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket label**（已完成 [Phase349 基础实现](design/PHASE_349_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL.md)）
   - 最新 label helper 复用共享 low/mid/high 映射并组合为 `L(low)`、`M(mid)`、`H(high)`。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120=99%H(high)]@2` 与 `adaptive>shown[120/120=100%H(high)]@2`。
   - 未新增状态、action、快捷键或跨进程接口。
339. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket label visibility**（已完成 [Phase350 基础实现](design/PHASE_350_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY.md)）
   - 新增命令面板局部布尔状态，默认显示快捷键 `2` 详情中的 low/mid/high 文字标签。
   - 命令面板内快捷键 `1` 切换文字标签显隐，面板外 `1` 继续执行既有 live-session activate action。
   - Help、Debug、快捷键 `2` indicator 与 width formatter 共用状态；关闭后保留 `L/M/H`。
340. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket label visibility profile**（已完成 [Phase351 基础实现](design/PHASE_351_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_PROFILE.md)）
   - 快捷键 `1` 状态升级为 `shown/hidden/adaptive`，按固定顺序循环并跨面板重开保持。
   - adaptive 复用共享 120 列阈值，119 列隐藏文字标签、120 列显示文字标签。
   - 子级 indicator、快捷键 `2` formatter、Help 和 Debug 共用 resolver；面板外 activate 行为不变。
341. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket label visibility threshold**（已完成 [Phase352 基础实现](design/PHASE_352_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_THRESHOLD.md)）
   - adaptive 子级 indicator 直接复用共享 120 列阈值并追加 `[120]`。
   - 119/120 列分别输出 `adaptive>hidden[120]@1` 与 `adaptive>shown[120]@1`。
   - 未新增状态、action、快捷键或跨进程接口，显式 profile 输出保持不变。
342. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket label visibility threshold distance**（已完成 [Phase353 基础实现](design/PHASE_353_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_THRESHOLD_DISTANCE.md)）
   - 新增纯距离 helper，仅在 adaptive 且宽度低于 120 列时返回剩余列数。
   - 80/119/120 列分别输出 `adaptive>hidden+40[120]@1`、`adaptive>hidden+1[120]@1`、`adaptive>shown[120]@1`。
   - Help、Debug 与 indicator 共用 helper，不改变 resolver、状态机或跨进程接口。
343. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket label visibility width indicator**（已完成 [Phase354 基础实现](design/PHASE_354_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_INDICATOR.md)）
   - 新增纯 width helper，统一输出 `current/threshold` 并复用共享 120 列常量。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120]@1` 与 `adaptive>shown[120/120]@1`。
   - Help、Debug 与 indicator 共用 helper，不改变状态机、resolver 或跨进程协议。
344. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket label visibility width percentage**（已完成 [Phase355 基础实现](design/PHASE_355_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE.md)）
   - 最新 percentage helper 复用共享整数截断、最小 0、最大 100 的归一化算法。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120=99%]@1` 与 `adaptive>shown[120/120=100%]@1`。
   - width helper、Help、Debug 与 indicator 共用百分比结果，不改变跨进程接口。
345. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket label visibility width bucket**（已完成 [Phase356 基础实现](design/PHASE_356_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET.md)）
   - 最新 bucket helper 复用共享 `L/M/H` 分段算法和既有边界。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120=99%H]@1` 与 `adaptive>shown[120/120=100%H]@1`。
   - 未新增文字标签、状态、action、快捷键或跨进程接口。
346. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket label visibility width bucket label**（已完成 [Phase357 基础实现](design/PHASE_357_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL.md)）
   - 最新 label helper 复用共享 `low/mid/high` 分段标签算法。
   - 119/120 列分别输出 `adaptive>hidden+1[119/120=99%H(high)]@1` 与 `adaptive>shown[120/120=100%H(high)]@1`。
   - 未新增状态、action、快捷键、profile 或跨进程接口。
347. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket label visibility width bucket label visibility**（已完成 [Phase358 基础实现](design/PHASE_358_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY.md)）
   - 新增默认开启的 TS Host TUI 本地文字标签显隐状态。
   - 命令面板内使用 `F2` 切换，关闭时 `H(high)` 变为 `H`，命令面板外 `F2` 保持 no-op。
   - Help、Debug 和快捷键 `1` 父级 indicator 共用状态，不改变跨进程接口。
348. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket label visibility width bucket label visibility profile**（已完成 [Phase359 基础实现](design/PHASE_359_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_PROFILE.md)）
   - F2 状态升级为默认 `shown` 的 `shown/hidden/adaptive` 三态 profile。
   - adaptive 在 119 列及以下隐藏文字标签，在 120 列及以上显示文字标签。
   - 父级 formatter、Help 和 Debug 共用 resolver，不改变跨进程接口。
349. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket label visibility width bucket label visibility threshold**（已完成 [Phase360 基础实现](design/PHASE_360_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_THRESHOLD.md)）
   - F2 adaptive indicator 复用共享 120 列阈值并显式输出 `[120]`。
   - 119/120 列分别输出 `adaptive>hidden[120]@F2` 与 `adaptive>shown[120]@F2`。
   - 不改变 resolver、父级 formatter、状态机或跨进程接口。
350. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket label visibility width bucket label visibility threshold distance**（已完成 [Phase361 基础实现](design/PHASE_361_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_THRESHOLD_DISTANCE.md)）
   - 新增纯 threshold-distance helper，仅在 adaptive 且低于 120 列时返回剩余列数。
   - 80/119/120 列分别输出 `hidden+40`、`hidden+1` 和无距离的 `shown`。
   - 不新增状态、action、快捷键或跨进程接口。
351. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket label visibility width bucket label visibility width indicator**（已完成 [Phase362 基础实现](design/PHASE_362_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_INDICATOR.md)）
   - 新增纯 width helper，统一输出 `current/120` 并保留超过阈值后的真实宽度。
   - 119/120 列分别输出 `[119/120]` 与 `[120/120]`。
   - Help、Debug 和 indicator 共用结果，不改变跨进程接口。
352. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket label visibility width bucket label visibility width percentage**（已完成 [Phase363 基础实现](design/PHASE_363_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE.md)）
   - percentage helper 复用共享整数截断、最小 0、最大 100 的归一化算法。
   - 119/120 列分别输出 `[119/120=99%]` 与 `[120/120=100%]`。
   - width helper、Help、Debug 和 indicator 共用结果，不改变跨进程接口。
353. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket label visibility width bucket label visibility width bucket**（已完成 [Phase364 基础实现](design/PHASE_364_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET.md)）
   - bucket helper 复用共享 `L/M/H` 分段算法及既有边界。
   - 119/120 列分别输出 `[119/120=99%H]` 与 `[120/120=100%H]`。
   - 不新增文字标签、状态、action、快捷键或跨进程接口。
354. **TUI live session command palette current-level latest bucket label width bucket label visibility width bucket label visibility width bucket label visibility width bucket label**（已完成 [Phase365 基础实现](design/PHASE_365_TUI_LATEST_BUCKET_LABEL_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL_VISIBILITY_WIDTH_BUCKET_LABEL.md)）
   - label helper 复用共享 `low/mid/high` 标签映射。
   - 119/120 列分别输出 `[119/120=99%H(high)]` 与 `[120/120=100%H(high)]`。
   - 不新增状态、action、快捷键、profile 或跨进程接口。
355. **TUI Help 溢出治理**（已完成 [Phase366 基础实现](design/PHASE_366_TUI_HELP_OVERFLOW_REMEDIATION.md)）
   - 帮助拆分为稳定 section，并在 ` | ` token 边界按终端宽度换行。
   - TUI 本地 `helpScrollOffset` 支持 Up/Down、PageUp/PageDown；full/compact renderer 共用滚动窗口与位置标题。
   - 不新增 command profile、command action、命令面板快捷键或跨进程接口。
356. **TUI profile cycle registry 基础**（已完成 [Phase367 基础实现](design/PHASE_367_TUI_PROFILE_CYCLE_REGISTRY_FOUNDATION.md)）
   - 新增独立通用 registry helper，并迁移 latest family 的 10 个重复 reducer case。
   - action、state field、profile 顺序、shortcut、Help、Debug 和跨进程 contract 保持不变。
357. **TUI profile cycle registry family migration**（已完成 [Phase368 基础实现](design/PHASE_368_TUI_PROFILE_CYCLE_REGISTRY_FAMILY_MIGRATION.md)）
   - neighbor legend 9 个、deepest nested 7 个 action 接入统一 registry，总覆盖达到 26 个。
   - reducer 重复 cycle case 从 24 个降至 8 个，用户可见 contract 和跨层接口保持不变。
358. **TUI enum cycle registry completion**（已完成 [Phase369 基础实现](design/PHASE_369_TUI_ENUM_CYCLE_REGISTRY_COMPLETION.md)）
   - 剩余 8 个 enum/profile cycle action 接入统一 registry，总覆盖达到 34 个。
   - category/sort 派生选择重置保持不变，reducer 重复 cycle switch case 降至 0。
359. **TUI adaptive visibility formatter foundation**（已完成 [Phase370 基础实现](design/PHASE_370_TUI_ADAPTIVE_VISIBILITY_FORMATTER_FOUNDATION.md)）
   - 抽取共享 visibility resolver、threshold distance 和 adaptive indicator formatter。
   - 首批迁移 deepest、latest 与 F2 三条代表链路，公开 wrapper 和输出 contract 保持不变。
360. **TUI adaptive visibility resolver migration**（已完成 [Phase371 基础实现](design/PHASE_371_TUI_ADAPTIVE_VISIBILITY_RESOLVER_MIGRATION.md)）
   - 25 个 shown/hidden resolver 与 26 个通用 distance wrapper 使用共享 helper。
   - compact/full resolver 和独立 adaptive threshold distance 因语义不同保留原实现。
361. **TUI adaptive indicator formatter migration**（已完成 [Phase372 基础实现](design/PHASE_372_TUI_ADAPTIVE_INDICATOR_FORMATTER_MIGRATION.md)）
   - 剩余 23 个 indicator wrapper 接入共享 formatter，总覆盖达到 26 个。
   - legend 的 compact/full 有效值通过显式注入保持，重复 profileLabel 组合块清零。
362. **TUI width metrics formatter migration**（已完成 [Phase373 基础实现](design/PHASE_373_TUI_WIDTH_METRICS_FORMATTER_MIGRATION.md)）
   - percentage、bucket、label 根算法进入纯 metrics helper。
   - 26 个 width indicator 全部共享 formatter，33/66 分段和真实宽度输出保持不变。
363. **TUI width metrics accessor aliases**（已完成 [Phase374 基础实现](design/PHASE_374_TUI_WIDTH_METRICS_ACCESSOR_ALIASES.md)）
364. **TUI command palette constants module**（已完成 [Phase375 基础实现](design/PHASE_375_TUI_COMMAND_PALETTE_CONSTANTS_MODULE.md)）
365. **TUI type model module**（已完成 [Phase376 基础实现](design/PHASE_376_TUI_TYPE_MODEL_MODULE.md)）
366. **TUI command catalog module**（已完成 [Phase377 基础实现](design/PHASE_377_TUI_COMMAND_CATALOG_MODULE.md)）
367. **TUI command selectors module**（已完成 [Phase378 基础实现](design/PHASE_378_TUI_COMMAND_SELECTORS_MODULE.md)）
368. **TUI command actions module**（已完成 [Phase379 基础实现](design/PHASE_379_TUI_COMMAND_ACTIONS_MODULE.md)）
369. **TUI command palette subreducer**（已完成 [Phase380 基础实现](design/PHASE_380_TUI_COMMAND_PALETTE_SUBREDUCER.md)）
370. **TUI live session subreducer**（已完成 [Phase381 基础实现](design/PHASE_381_TUI_LIVE_SESSION_SUBREDUCER.md)）
371. **TUI history/timeline subreducer**（已完成 [Phase382 基础实现](design/PHASE_382_TUI_HISTORY_TIMELINE_SUBREDUCER.md)）
372. **TUI shell/approval subreducer**（已完成 [Phase383 基础实现](design/PHASE_383_TUI_SHELL_APPROVAL_SUBREDUCER.md)）
373. **TUI prompt/turn subreducer**（已完成 [Phase384 基础实现](design/PHASE_384_TUI_PROMPT_TURN_SUBREDUCER.md)）
374. **TUI event-stream subreducer and composition**（已完成 [Phase385 基础实现](design/PHASE_385_TUI_EVENT_STREAM_SUBREDUCER.md)）
375. **TUI reducer composer module**（已完成 [Phase386 基础实现](design/PHASE_386_TUI_REDUCER_COMPOSER_MODULE.md)）
376. **TUI cycle registries module**（已完成 [Phase387 基础实现](design/PHASE_387_TUI_CYCLE_REGISTRIES_MODULE.md)）
377. **TUI state factory module**（已完成 [Phase388 基础实现](design/PHASE_388_TUI_STATE_FACTORY_MODULE.md)）
378. **TUI neighbor adaptive foundation**（已完成 [Phase389 基础实现](design/PHASE_389_TUI_NEIGHBOR_ADAPTIVE_FOUNDATION.md)）
379. **TUI neighbor legend presentation module**（48 个 helper/alias，已完成 [Phase390 基础实现](design/PHASE_390_TUI_NEIGHBOR_LEGEND_PRESENTATION.md)）
380. **TUI nested presentation module and pure state facade**（104 个 helper/alias，已完成 [Phase391 基础实现](design/PHASE_391_TUI_NESTED_PRESENTATION_MODULE.md)）
381. **TUI facade dependency boundary and configured reducer**（已完成 [Phase392 基础实现](design/PHASE_392_TUI_FACADE_DEPENDENCY_BOUNDARY.md)）
382. **TUI module graph and architecture contract**（已完成 [Phase393 基础实现](design/PHASE_393_TUI_MODULE_GRAPH_CONTRACT.md)）
383. **TS Host batch tool API**（已完成 [Phase394 基础实现](design/PHASE_394_TS_HOST_BATCH_TOOL_API.md)）
384. **Batch tool capability negotiation and legacy fallback**（已完成 [Phase395 基础实现](design/PHASE_395_BATCH_TOOL_CAPABILITY_NEGOTIATION.md)）
385. **Batch size negotiation and Host enforcement**（已完成 [Phase396 基础实现](design/PHASE_396_BATCH_SIZE_NEGOTIATION.md)）
386. **Batch executor failure isolation**（已完成 [Phase397 基础实现](design/PHASE_397_BATCH_FAILURE_ISOLATION.md)）
387. **Batch tool call identity integrity**（已完成 [Phase398 基础实现](design/PHASE_398_BATCH_TOOL_CALL_ID_INTEGRITY.md)）
388. **Tool action boundary validation**（已完成 [Phase399 基础实现](design/PHASE_399_TOOL_ACTION_BOUNDARY_VALIDATION.md)）
389. **Tool result schema boundary**（已完成 [Phase400 基础实现](design/PHASE_400_TOOL_RESULT_SCHEMA_BOUNDARY.md)）
390. **Tool result explicit-null parity**（已完成 [Phase401 基础实现](design/PHASE_401_TOOL_RESULT_NULL_PARITY.md)）
391. **Tool result state invariant**（已完成 [Phase402 基础实现](design/PHASE_402_TOOL_RESULT_STATE_INVARIANT.md)）
392. **Tool result construction invariant**（已完成 [Phase403 基础实现](design/PHASE_403_TOOL_RESULT_CONSTRUCTION_INVARIANT.md)）
393. **Tool error construction invariant**（已完成 [Phase404 基础实现](design/PHASE_404_TOOL_ERROR_CONSTRUCTION_INVARIANT.md)）
394. **Tool result recursive JSON safety**（已完成 [Phase405 基础实现](design/PHASE_405_TOOL_RESULT_JSON_SAFETY.md)）
395. **Tool input recursive JSON safety**（已完成 [Phase406 基础实现](design/PHASE_406_TOOL_INPUT_JSON_SAFETY.md)）
396. **Non-blank protocol identity and error text**（已完成 [Phase407 基础实现](design/PHASE_407_NON_BLANK_PROTOCOL_TEXT.md)）
397. **Session-scoped tool cancellation identity**（已完成 [Phase408 基础实现](design/PHASE_408_SESSION_SCOPED_TOOL_CANCELLATION.md)）
398. **Pre-dispatch cancellation tombstone**（已完成 [Phase409 基础实现](design/PHASE_409_PRE_DISPATCH_CANCELLATION_TOMBSTONE.md)）
399. **Host pre-dispatch cancellation enforcement**（已完成 [Phase410 基础实现](design/PHASE_410_HOST_PRE_DISPATCH_CANCELLATION.md)）
400. **Batch per-slot cancellation gate**（已完成 [Phase411 基础实现](design/PHASE_411_BATCH_SLOT_CANCELLATION_GATE.md)）
401. **Cancellation result precedence**（已完成 [Phase412 基础实现](design/PHASE_412_CANCELLATION_RESULT_PRECEDENCE.md)）
402. **Turn controller lease and deferred cleanup**（已完成 [Phase413 基础实现](design/PHASE_413_TURN_CONTROLLER_LEASE_CLEANUP.md)）
403. **Not-found lease-aware cleanup**（已完成 [Phase414 基础实现](design/PHASE_414_NOT_FOUND_LEASE_CLEANUP.md)）
404. **Bounded finalized-turn late-message guard**（已完成 [Phase415 基础实现](design/PHASE_415_FINALIZED_TURN_GUARD.md)）
405. **God-code event envelope runtime boundary**（已完成 [Phase416 基础实现](design/PHASE_416_EVENT_ENVELOPE_BOUNDARY.md)）
406. **God-code event payload schema boundary**（已完成 [Phase417 基础实现](design/PHASE_417_EVENT_PAYLOAD_SCHEMA_BOUNDARY.md)）
407. **Engine event construction invariant**（已完成 [Phase418 基础实现](design/PHASE_418_ENGINE_EVENT_CONSTRUCTION_INVARIANT.md)）
408. **Cross-language event conformance corpus**（已完成 [Phase419 基础实现](design/PHASE_419_CROSS_LANGUAGE_EVENT_CONFORMANCE_CORPUS.md)）
409. **Finalized event fan-out guard**（已完成 [Phase420 基础实现](design/PHASE_420_FINALIZED_EVENT_FANOUT_GUARD.md)）
410. **Turn event sequence contract**（已完成 [Phase421 基础实现](design/PHASE_421_TURN_EVENT_SEQUENCE_CONTRACT.md)）
411. **Protocol version lock**（已完成 [Phase422 基础实现](design/PHASE_422_PROTOCOL_VERSION_LOCK.md)）
412. **Initialization state machine**（已完成 [Phase423 基础实现](design/PHASE_423_INITIALIZATION_STATE_MACHINE.md)）
413. **Initialize response schema boundary**（已完成 [Phase424 基础实现](design/PHASE_424_INITIALIZE_RESPONSE_SCHEMA_BOUNDARY.md)）
414. **Initialize request schema boundary**（已完成 [Phase425 基础实现](design/PHASE_425_INITIALIZE_REQUEST_SCHEMA_BOUNDARY.md)）
415. **Create session response schema and identity boundary**（已完成 [Phase426 基础实现](design/PHASE_426_CREATE_SESSION_RESPONSE_BOUNDARY.md)）
416. **Create session request schema boundary**（已完成 [Phase427 基础实现](design/PHASE_427_CREATE_SESSION_REQUEST_BOUNDARY.md)）
417. **Submit turn response schema and identity boundary**（已完成 [Phase428 基础实现](design/PHASE_428_SUBMIT_TURN_RESPONSE_BOUNDARY.md)）
418. **Submit turn request schema boundary**（已完成 [Phase429 基础实现](design/PHASE_429_SUBMIT_TURN_REQUEST_BOUNDARY.md)）
419. **Cancel turn response schema and identity boundary**（已完成 [Phase430 基础实现](design/PHASE_430_CANCEL_TURN_RESPONSE_BOUNDARY.md)）
420. **Cancel turn request schema boundary**（已完成 [Phase431 基础实现](design/PHASE_431_CANCEL_TURN_REQUEST_BOUNDARY.md)）
421. **Shutdown response schema boundary**（已完成 [Phase432 基础实现](design/PHASE_432_SHUTDOWN_RESPONSE_BOUNDARY.md)）
422. **Shutdown request schema boundary**（已完成 [Phase433 基础实现](design/PHASE_433_SHUTDOWN_REQUEST_BOUNDARY.md)）
423. **Host tool response schema boundary**（已完成 [Phase434 基础实现](design/PHASE_434_HOST_TOOL_RESPONSE_BOUNDARY.md)）
424. **Host tool request construction boundary**（已完成 [Phase435 基础实现](design/PHASE_435_HOST_TOOL_REQUEST_CONSTRUCTION_BOUNDARY.md)）
425. **Tool cancellation notification boundary**（已完成 [Phase436 基础实现](design/PHASE_436_TOOL_CANCELLATION_NOTIFICATION_BOUNDARY.md)）
426. **JSON-RPC error response boundary**（已完成 [Phase437 基础实现](design/PHASE_437_JSON_RPC_ERROR_RESPONSE_BOUNDARY.md)）
427. **JSON-RPC success response boundary**（已完成 [Phase438 基础实现](design/PHASE_438_JSON_RPC_SUCCESS_RESPONSE_BOUNDARY.md)）
428. **JSON-RPC transport identity boundary**（已完成 [Phase439 基础实现](design/PHASE_439_JSON_RPC_TRANSPORT_IDENTITY_BOUNDARY.md)）
429. **JSON-RPC params boundary**（已完成 [Phase440 基础实现](design/PHASE_440_JSON_RPC_PARAMS_BOUNDARY.md)）
430. **JSON-RPC message shape exclusivity**（已完成 [Phase441 基础实现](design/PHASE_441_JSON_RPC_MESSAGE_SHAPE_EXCLUSIVITY.md)）
431. **JSON-RPC handler response construction**（已完成 [Phase442 基础实现](design/PHASE_442_JSON_RPC_HANDLER_RESPONSE_CONSTRUCTION.md)）
432. **JSON-RPC writer boundary**（已完成 [Phase443 基础实现](design/PHASE_443_JSON_RPC_WRITER_BOUNDARY.md)）
433. **JSON-RPC reader resource boundary**（已完成 [Phase444 基础实现](design/PHASE_444_JSON_RPC_READER_RESOURCE_BOUNDARY.md)）
434. **JSON-RPC outbound frame size boundary**（已完成 [Phase445 基础实现](design/PHASE_445_JSON_RPC_OUTBOUND_FRAME_SIZE_BOUNDARY.md)）
435. **JSON-RPC pending request capacity**（已完成 [Phase446 基础实现](design/PHASE_446_JSON_RPC_PENDING_REQUEST_CAPACITY.md)）
436. **JSON-RPC request timeout boundary**（已完成 [Phase447 基础实现](design/PHASE_447_JSON_RPC_REQUEST_TIMEOUT_BOUNDARY.md)）
437. **JSON-RPC request ID exhaustion boundary**（已完成 [Phase448 基础实现](design/PHASE_448_JSON_RPC_REQUEST_ID_EXHAUSTION.md)）
438. **JSON-RPC response lifecycle diagnostics**（已完成 [Phase449 基础实现](design/PHASE_449_JSON_RPC_RESPONSE_LIFECYCLE_DIAGNOSTICS.md)）
439. **JSON-RPC notification handler failure boundary**（已完成 [Phase450 基础实现](design/PHASE_450_JSON_RPC_NOTIFICATION_HANDLER_FAILURE_BOUNDARY.md)）
440. **JSON-RPC protocol diagnostic isolation**（已完成 [Phase451 基础实现](design/PHASE_451_JSON_RPC_PROTOCOL_DIAGNOSTIC_ISOLATION.md)）
441. **JSON-RPC close observer failure boundary**（已完成 [Phase452 基础实现](design/PHASE_452_JSON_RPC_CLOSE_OBSERVER_FAILURE_BOUNDARY.md)）
442. **JSON-RPC async writer backpressure boundary**（已完成 [Phase453 基础实现](design/PHASE_453_JSON_RPC_ASYNC_WRITER_BACKPRESSURE.md)）
443. **JSON-RPC outbound queue capacity**（已完成 [Phase454 基础实现](design/PHASE_454_JSON_RPC_OUTBOUND_QUEUE_CAPACITY.md)）
444. **JSON-RPC transport listener lifecycle**（已完成 [Phase455 基础实现](design/PHASE_455_JSON_RPC_TRANSPORT_LISTENER_LIFECYCLE.md)）
445. **JSON-RPC inbound request admission**（已完成 [Phase456 基础实现](design/PHASE_456_JSON_RPC_INBOUND_REQUEST_ADMISSION.md)）
446. **JSON-RPC inbound notification admission**（已完成 [Phase457 基础实现](design/PHASE_457_JSON_RPC_INBOUND_NOTIFICATION_ADMISSION.md)）
447. **JSON-RPC inbound frame capacity**（已完成 [Phase458 基础实现](design/PHASE_458_JSON_RPC_INBOUND_FRAME_CAPACITY.md)）
448. **JSON-RPC queued request cancellation**（已完成 [Phase459 基础实现](design/PHASE_459_JSON_RPC_QUEUED_REQUEST_CANCELLATION.md)）
449. **JSON-RPC notification registry snapshot**（已完成 [Phase460 基础实现](design/PHASE_460_JSON_RPC_NOTIFICATION_REGISTRY_SNAPSHOT.md)）
450. **JSON-RPC notification subscription lifecycle**（已完成 [Phase461 基础实现](design/PHASE_461_JSON_RPC_NOTIFICATION_SUBSCRIPTION_LIFECYCLE.md)）
451. **JSON-RPC request handler ownership**（已完成 [Phase462 基础实现](design/PHASE_462_JSON_RPC_REQUEST_HANDLER_OWNERSHIP.md)）
452. **JSON-RPC handler registry close disposal**（已完成 [Phase463 基础实现](design/PHASE_463_JSON_RPC_HANDLER_REGISTRY_CLOSE_DISPOSAL.md)）
453. **Python JSON-RPC stop pending rejection**（已完成 [Phase464 基础实现](design/PHASE_464_PYTHON_JSON_RPC_STOP_PENDING_REJECTION.md)）
454. **Python JSON-RPC reader exit terminalization**（已完成 [Phase465 基础实现](design/PHASE_465_PYTHON_JSON_RPC_READER_EXIT_TERMINALIZATION.md)）
455. **Python JSON-RPC post-stop outbound gate**（已完成 [Phase466 基础实现](design/PHASE_466_PYTHON_JSON_RPC_POST_STOP_OUTBOUND_GATE.md)）
456. **JSON-RPC event listener close disposal**（已完成 [Phase467 基础实现](design/PHASE_467_JSON_RPC_EVENT_LISTENER_CLOSE_DISPOSAL.md)）
457. **JSON-RPC post-close observer gate**（已完成 [Phase468 基础实现](design/PHASE_468_JSON_RPC_POST_CLOSE_OBSERVER_GATE.md)）
458. **JSON-RPC terminal residual state disposal**（已完成 [Phase469 基础实现](design/PHASE_469_JSON_RPC_TERMINAL_RESIDUAL_STATE_DISPOSAL.md)）
459. **JSON-RPC active write close abort**（已完成 [Phase470 基础实现](design/PHASE_470_JSON_RPC_ACTIVE_WRITE_CLOSE_ABORT.md)）
460. **Python JSON-RPC writer failure terminalization**（已完成 [Phase471 基础实现](design/PHASE_471_PYTHON_JSON_RPC_WRITER_FAILURE_TERMINALIZATION.md)）
461. **Python JSON-RPC terminal cause propagation**（已完成 [Phase472 基础实现](design/PHASE_472_PYTHON_JSON_RPC_TERMINAL_CAUSE_PROPAGATION.md)）
462. **TS JSON-RPC terminal cause propagation**（已完成 [Phase473 基础实现](design/PHASE_473_TS_JSON_RPC_TERMINAL_CAUSE_PROPAGATION.md)）
463. **Python JSON-RPC registration terminal cause**（已完成 [Phase474 基础实现](design/PHASE_474_PYTHON_JSON_RPC_REGISTRATION_TERMINAL_CAUSE.md)）
464. **Python JSON-RPC structured terminal error**（已完成 [Phase475 基础实现](design/PHASE_475_PYTHON_JSON_RPC_STRUCTURED_TERMINAL_ERROR.md)）
465. **Python JSON-RPC terminal error normalization**（已完成 [Phase476 基础实现](design/PHASE_476_PYTHON_JSON_RPC_TERMINAL_ERROR_NORMALIZATION.md)）
466. **Python JSON-RPC terminal admission precedence**（已完成 [Phase477 基础实现](design/PHASE_477_PYTHON_JSON_RPC_TERMINAL_ADMISSION_PRECEDENCE.md)）
467. **Python JSON-RPC outbound preparation terminal precedence**（已完成 [Phase478 基础实现](design/PHASE_478_PYTHON_JSON_RPC_OUTBOUND_PREPARATION_TERMINAL_PRECEDENCE.md)）
468. **Python JSON-RPC outbound encoding failure containment**（已完成 [Phase479 基础实现](design/PHASE_479_PYTHON_JSON_RPC_OUTBOUND_ENCODING_FAILURE_CONTAINMENT.md)）
469. **Python JSON-RPC safe terminal data snapshot**（已完成 [Phase480 基础实现](design/PHASE_480_PYTHON_JSON_RPC_SAFE_TERMINAL_DATA_SNAPSHOT.md)）
470. **Python JSON-RPC terminal metadata containment**（已完成 [Phase481 基础实现](design/PHASE_481_PYTHON_JSON_RPC_TERMINAL_METADATA_CONTAINMENT.md)）
471. **TS JSON-RPC outbound encoding failure containment**（已完成 [Phase482 基础实现](design/PHASE_482_TS_JSON_RPC_OUTBOUND_ENCODING_FAILURE_CONTAINMENT.md)）
472. **TS JSON-RPC handler error response preparation fallback**（已完成 [Phase483 基础实现](design/PHASE_483_TS_JSON_RPC_HANDLER_ERROR_RESPONSE_PREPARATION_FALLBACK.md)）
473. **Python JSON-RPC handler error safe snapshot**（已完成 [Phase484 基础实现](design/PHASE_484_PYTHON_JSON_RPC_HANDLER_ERROR_SAFE_SNAPSHOT.md)）
474. **Python JSON-RPC handler result safe snapshot**（已完成 [Phase485 基础实现](design/PHASE_485_PYTHON_JSON_RPC_HANDLER_RESULT_SAFE_SNAPSHOT.md)）
475. **TS JSON-RPC handler result safe snapshot**（已完成 [Phase486 基础实现](design/PHASE_486_TS_JSON_RPC_HANDLER_RESULT_SAFE_SNAPSHOT.md)）
476. **Python JSON-RPC outbound params safe snapshot**（已完成 [Phase487 基础实现](design/PHASE_487_PYTHON_JSON_RPC_OUTBOUND_PARAMS_SAFE_SNAPSHOT.md)）
477. **TS JSON-RPC outbound params safe snapshot**（已完成 [Phase488 基础实现](design/PHASE_488_TS_JSON_RPC_OUTBOUND_PARAMS_SAFE_SNAPSHOT.md)）
478. **TS JSON snapshot prototype-key preservation**（已完成 [Phase489 基础实现](design/PHASE_489_TS_JSON_SNAPSHOT_PROTOTYPE_KEY_PRESERVATION.md)）
479. **TS JSON-RPC notification payload consumer isolation**（已完成 [Phase490 基础实现](design/PHASE_490_TS_JSON_RPC_NOTIFICATION_PAYLOAD_CONSUMER_ISOLATION.md)）
480. **Python JSON-RPC notification payload consumer isolation**（已完成 [Phase491 基础实现](design/PHASE_491_PYTHON_JSON_RPC_NOTIFICATION_PAYLOAD_CONSUMER_ISOLATION.md)）
481. **TS JSON-RPC protocol diagnostic observer isolation**（已完成 [Phase492 基础实现](design/PHASE_492_TS_JSON_RPC_PROTOCOL_DIAGNOSTIC_OBSERVER_ISOLATION.md)）
482. **TS JSON-RPC close observer Error isolation**（已完成 [Phase493 基础实现](design/PHASE_493_TS_JSON_RPC_CLOSE_OBSERVER_ERROR_ISOLATION.md)）
483. **Python JSON-RPC inbound response safe snapshot ownership**（已完成 [Phase494 基础实现](design/PHASE_494_PYTHON_JSON_RPC_INBOUND_RESPONSE_SAFE_SNAPSHOT.md)）
484. **TS JSON-RPC inbound response safe snapshot ownership**（已完成 [Phase495 基础实现](design/PHASE_495_TS_JSON_RPC_INBOUND_RESPONSE_SAFE_SNAPSHOT.md)）
485. **Host tool approval unavailable audit completeness**（已完成 [Phase496 基础实现](design/PHASE_496_HOST_TOOL_APPROVAL_UNAVAILABLE_AUDIT.md)）
486. **Host tool post-policy failure committed-result preservation**（已完成 [Phase497 基础实现](design/PHASE_497_HOST_TOOL_POST_POLICY_RESULT_PRESERVATION.md)）
487. **Host tool opt-in JSONL audit persistence**（已完成 [Phase498 基础实现](design/PHASE_498_HOST_TOOL_JSONL_AUDIT_PERSISTENCE.md)）
488. **Host tool audit failure caller visibility**（已完成 [Phase499 基础实现](design/PHASE_499_HOST_TOOL_AUDIT_FAILURE_VISIBILITY.md)）
489. **Host tool bounded JSONL audit rotation**（已完成 [Phase500 基础实现](design/PHASE_500_HOST_TOOL_BOUNDED_JSONL_AUDIT_ROTATION.md)）
490. **Host tool JSONL audit no-follow path enforcement**（已完成 [Phase501 基础实现](design/PHASE_501_HOST_TOOL_AUDIT_NO_FOLLOW_PATH.md)）
491. **Host tool JSONL audit private file mode enforcement**（已完成 [Phase502 基础实现](design/PHASE_502_HOST_TOOL_AUDIT_PRIVATE_FILE_MODE.md)）
492. **Host tool JSONL audit preparation failure promise containment**（已完成 [Phase503 基础实现](design/PHASE_503_HOST_TOOL_AUDIT_PREPARATION_FAILURE_PROMISE.md)）
493. **Host tool JSONL audit structured secret redaction**（已完成 [Phase504 基础实现](design/PHASE_504_HOST_TOOL_AUDIT_STRUCTURED_SECRET_REDACTION.md)）
494. **Host tool JSONL audit descriptor-safe pre-redaction snapshot**（已完成 [Phase505 基础实现](design/PHASE_505_HOST_TOOL_AUDIT_DESCRIPTOR_SAFE_SNAPSHOT.md)）
495. **Host tool JSONL audit bounded snapshot preparation**（已完成 [Phase506 基础实现](design/PHASE_506_HOST_TOOL_AUDIT_BOUNDED_SNAPSHOT_PREPARATION.md)）
496. **Host tool JSONL audit path identity and in-process coordination**（已完成 [Phase507 基础实现](design/PHASE_507_HOST_TOOL_AUDIT_PATH_IDENTITY_COORDINATION.md)）
497. **Host tool JSONL audit constructor invariant validation**（已完成 [Phase508 基础实现](design/PHASE_508_HOST_TOOL_AUDIT_CONSTRUCTOR_INVARIANTS.md)）
498. **Host tool JSONL audit configurable redaction key extensions**（已完成 [Phase509 基础实现](design/PHASE_509_HOST_TOOL_AUDIT_REDACTION_KEY_EXTENSIONS.md)）
499. **Host tool audit configuration inspection diagnostics**（已完成 [Phase510 基础实现](design/PHASE_510_HOST_TOOL_AUDIT_CONFIG_INSPECTION.md)）
500. **Host tool audit path readiness inspection diagnostics**（已完成 [Phase511 基础实现](design/PHASE_511_HOST_TOOL_AUDIT_PATH_READINESS_INSPECTION.md)）
501. **Host tool audit target append readiness diagnostics**（已完成 [Phase512 基础实现](design/PHASE_512_HOST_TOOL_AUDIT_TARGET_APPEND_READINESS.md)）
502. **Host tool audit rotated generation readiness inspection**（已完成 [Phase513 基础实现](design/PHASE_513_HOST_TOOL_AUDIT_ROTATED_GENERATION_READINESS.md)）
503. **Host tool audit current-generation capacity readiness diagnostics**（已完成 [Phase514 基础实现](design/PHASE_514_HOST_TOOL_AUDIT_CURRENT_GENERATION_CAPACITY_READINESS.md)）
504. **Host tool audit shared capacity decision parity**（已完成 [Phase515 基础实现](design/PHASE_515_HOST_TOOL_AUDIT_SHARED_CAPACITY_DECISION_PARITY.md)）
505. **Host tool audit current-generation inspection parity**（已完成 [Phase516 基础实现](design/PHASE_516_HOST_TOOL_AUDIT_CURRENT_GENERATION_INSPECTION_PARITY.md)）
506. **Host tool audit descriptor identity binding**（已完成 [Phase517 基础实现](design/PHASE_517_HOST_TOOL_AUDIT_DESCRIPTOR_IDENTITY_BINDING.md)）
507. **Host tool audit final append expectation binding**（已完成 [Phase518 基础实现](design/PHASE_518_HOST_TOOL_AUDIT_FINAL_APPEND_EXPECTATION_BINDING.md)）
508. **Host tool audit final descriptor capacity revalidation**（已完成 [Phase519 基础实现](design/PHASE_519_HOST_TOOL_AUDIT_FINAL_DESCRIPTOR_CAPACITY_REVALIDATION.md)）
509. **Host tool audit configurable append durability**（已完成 [Phase520 基础实现](design/PHASE_520_HOST_TOOL_AUDIT_CONFIGURABLE_APPEND_DURABILITY.md)）
510. **Host tool audit full-durability parent metadata sync**（已完成 [Phase521 基础实现](design/PHASE_521_HOST_TOOL_AUDIT_FULL_DURABILITY_PARENT_METADATA_SYNC.md)）
511. **Host tool audit parent-directory identity binding**（已完成 [Phase522 基础实现](design/PHASE_522_HOST_TOOL_AUDIT_PARENT_DIRECTORY_IDENTITY_BINDING.md)）
512. **Host tool audit pre-append parent identity revalidation**（已完成 [Phase523 基础实现](design/PHASE_523_HOST_TOOL_AUDIT_PRE_APPEND_PARENT_IDENTITY_REVALIDATION.md)）
513. **Host tool audit post-create parent identity revalidation**（已完成 [Phase524 基础实现](design/PHASE_524_HOST_TOOL_AUDIT_POST_CREATE_PARENT_IDENTITY_REVALIDATION.md)）
514. **Host tool audit pre-write current path identity revalidation**（已完成 [Phase525 基础实现](design/PHASE_525_HOST_TOOL_AUDIT_PRE_WRITE_CURRENT_PATH_IDENTITY_REVALIDATION.md)）
515. **Host tool audit post-write current path identity revalidation**（已完成 [Phase526 基础实现](design/PHASE_526_HOST_TOOL_AUDIT_POST_WRITE_CURRENT_PATH_IDENTITY_REVALIDATION.md)）
516. **Host tool audit cooperative cross-process coordination lock**（已完成 [Phase527 基础实现](design/PHASE_527_HOST_TOOL_AUDIT_COOPERATIVE_CROSS_PROCESS_COORDINATION_LOCK.md)）
517. **Host tool audit lock readiness inspection**（已完成 [Phase528 基础实现](design/PHASE_528_HOST_TOOL_AUDIT_LOCK_READINESS_INSPECTION.md)）
518. **Host tool audit lock owner metadata and release identity binding**（已完成 [Phase529 基础实现](design/PHASE_529_HOST_TOOL_AUDIT_LOCK_OWNER_METADATA_AND_RELEASE_IDENTITY_BINDING.md)）
519. **Host tool audit guarded residual lock cleanup**（已完成 [Phase530 基础实现](design/PHASE_530_HOST_TOOL_AUDIT_GUARDED_RESIDUAL_LOCK_CLEANUP.md)）
520. **Host tool audit bounded lock quarantine inspection**（已完成 [Phase531 基础实现](design/PHASE_531_HOST_TOOL_AUDIT_BOUNDED_LOCK_QUARANTINE_INSPECTION.md)）
521. **Host tool audit guarded owner-only quarantine cleanup**（已完成 [Phase532 基础实现](design/PHASE_532_HOST_TOOL_AUDIT_GUARDED_OWNER_ONLY_QUARANTINE_CLEANUP.md)）
522. **Host tool audit guarded pre-commit quarantine recovery**（已完成 [Phase533 基础实现](design/PHASE_533_HOST_TOOL_AUDIT_GUARDED_PRECOMMIT_QUARANTINE_RECOVERY.md)）
523. **Host tool audit bounded lock disposal inspection**（已完成 [Phase534 基础实现](design/PHASE_534_HOST_TOOL_AUDIT_BOUNDED_LOCK_DISPOSAL_INSPECTION.md)）
524. **Host tool audit guarded owner-only disposal cleanup**（已完成 [Phase535 基础实现](design/PHASE_535_HOST_TOOL_AUDIT_GUARDED_OWNER_ONLY_DISPOSAL_CLEANUP.md)）
525. **Host tool audit guarded empty disposal cleanup**（已完成 [Phase536 基础实现](design/PHASE_536_HOST_TOOL_AUDIT_GUARDED_EMPTY_DISPOSAL_CLEANUP.md)）
526. **Host tool audit targeted lock disposal inspection**（已完成 [Phase537 基础实现](design/PHASE_537_HOST_TOOL_AUDIT_TARGETED_LOCK_DISPOSAL_INSPECTION.md)）
527. **Host tool audit targeted lock quarantine inspection**（已完成 [Phase538 基础实现](design/PHASE_538_HOST_TOOL_AUDIT_TARGETED_LOCK_QUARANTINE_INSPECTION.md)）
528. **Host tool audit guarded empty quarantine cleanup**（已完成 [Phase539 基础实现](design/PHASE_539_HOST_TOOL_AUDIT_GUARDED_EMPTY_QUARANTINE_CLEANUP.md)）
529. **Host tool audit owner cleanup directory descriptor binding**（已完成 [Phase540 基础实现](design/PHASE_540_HOST_TOOL_AUDIT_OWNER_CLEANUP_DIRECTORY_DESCRIPTOR_BINDING.md)）
530. **Host tool audit quarantine recovery directory descriptor binding**（已完成 [Phase541 基础实现](design/PHASE_541_HOST_TOOL_AUDIT_QUARANTINE_RECOVERY_DIRECTORY_DESCRIPTOR_BINDING.md)）
531. **Host tool audit owner metadata file descriptor binding**（已完成 [Phase542 基础实现](design/PHASE_542_HOST_TOOL_AUDIT_OWNER_METADATA_FILE_DESCRIPTOR_BINDING.md)）
532. **Host tool audit runtime lock owner descriptor lifecycle**（已完成 [Phase543 基础实现](design/PHASE_543_HOST_TOOL_AUDIT_RUNTIME_LOCK_OWNER_DESCRIPTOR_LIFECYCLE.md)）
533. **Host tool audit descriptor-backed mutation detachment proof**（已完成 [Phase544 基础实现](design/PHASE_544_HOST_TOOL_AUDIT_DESCRIPTOR_BACKED_MUTATION_DETACHMENT_PROOF.md)）
534. **Host tool audit private wrapper root descriptor binding**（已完成 [Phase545 基础实现](design/PHASE_545_HOST_TOOL_AUDIT_PRIVATE_WRAPPER_ROOT_DESCRIPTOR_BINDING.md)）
535. **Host tool audit descriptor-relative private transaction mutation capability**（已完成 [Phase546 基础实现](design/PHASE_546_HOST_TOOL_AUDIT_DESCRIPTOR_RELATIVE_PRIVATE_TRANSACTION_MUTATION_CAPABILITY.md)）
536. **Host tool audit descriptor-relative runtime and maintenance mutation rollout**（已完成 [Phase547 基础实现](design/PHASE_547_HOST_TOOL_AUDIT_DESCRIPTOR_RELATIVE_RUNTIME_AND_MAINTENANCE_MUTATION_ROLLOUT.md)）
537. **Host tool audit descriptor-relative generation mutation transaction**（已完成 [Phase548 基础实现](design/PHASE_548_HOST_TOOL_AUDIT_DESCRIPTOR_RELATIVE_GENERATION_MUTATION_TRANSACTION.md)）
538. **Host tool audit descriptor-relative parent chain bootstrap**（已完成 [Phase549 基础实现](design/PHASE_549_HOST_TOOL_AUDIT_DESCRIPTOR_RELATIVE_PARENT_CHAIN_BOOTSTRAP.md)）
539. **Host tool audit runtime owner creation failure descriptor handoff**（已完成 [Phase550 基础实现](design/PHASE_550_HOST_TOOL_AUDIT_RUNTIME_OWNER_CREATION_FAILURE_DESCRIPTOR_HANDOFF.md)）
540. **Host tool audit failed append bounded rollback**（已完成 [Phase551 基础实现](design/PHASE_551_HOST_TOOL_AUDIT_FAILED_APPEND_BOUNDED_ROLLBACK.md)）
541. **Host tool audit exclusive generation pre-commit cleanup**（已完成 [Phase552 基础实现](design/PHASE_552_HOST_TOOL_AUDIT_EXCLUSIVE_GENERATION_PRECOMMIT_CLEANUP.md)）
542. **Host tool audit transactional rotation pre-commit rollback**（已完成 [Phase553 基础实现](design/PHASE_553_HOST_TOOL_AUDIT_TRANSACTIONAL_ROTATION_PRECOMMIT_ROLLBACK.md)）
543. **Host tool audit target-bound rotation staging inspection**（已完成 [Phase554 基础实现](design/PHASE_554_HOST_TOOL_AUDIT_TARGET_BOUND_ROTATION_STAGING_INSPECTION.md)）
544. **Host tool audit rotation staging recovery readiness**（已完成 [Phase555 基础实现](design/PHASE_555_HOST_TOOL_AUDIT_ROTATION_STAGING_RECOVERY_READINESS.md)）
545. **Host tool audit guarded rotation staging recovery**（已完成 [Phase556 基础实现](design/PHASE_556_HOST_TOOL_AUDIT_GUARDED_ROTATION_STAGING_RECOVERY.md)）
546. **Host tool audit recovery commit evidence and lock finalization**（已完成 [Phase557 基础实现](design/PHASE_557_HOST_TOOL_AUDIT_RECOVERY_COMMIT_EVIDENCE_AND_LOCK_FINALIZATION.md)）
547. **Host tool audit recovery failure evidence and rollback status**（已完成 [Phase558 基础实现](design/PHASE_558_HOST_TOOL_AUDIT_RECOVERY_FAILURE_EVIDENCE_AND_ROLLBACK_STATUS.md)）
548. **Host tool audit recovery candidate-open failure handle handoff**（已完成 [Phase559 基础实现](design/PHASE_559_HOST_TOOL_AUDIT_RECOVERY_CANDIDATE_OPEN_FAILURE_HANDLE_HANDOFF.md)）
549. **Host tool audit recovery close invocation settlement**（已完成 [Phase560 基础实现](design/PHASE_560_HOST_TOOL_AUDIT_RECOVERY_CLOSE_INVOCATION_SETTLEMENT.md)）
550. **Host tool audit recovery error summary normalization**（已完成 [Phase561 基础实现](design/PHASE_561_HOST_TOOL_AUDIT_RECOVERY_ERROR_SUMMARY_NORMALIZATION.md)）
551. **Host tool audit recovery post-failure namespace observation**（已完成 [Phase562 基础实现](design/PHASE_562_HOST_TOOL_AUDIT_RECOVERY_POST_FAILURE_NAMESPACE_OBSERVATION.md)）
552. **Host tool audit rotation staging bounded child scan**（已完成 [Phase563 基础实现](design/PHASE_563_HOST_TOOL_AUDIT_ROTATION_STAGING_BOUNDED_CHILD_SCAN.md)）
553. **Host tool audit lock maintenance bounded child scan**（已完成 [Phase564 基础实现](design/PHASE_564_HOST_TOOL_AUDIT_LOCK_MAINTENANCE_BOUNDED_CHILD_SCAN.md)）
554. **Host tool audit active lock stable bounded observation**（已完成 [Phase565 基础实现](design/PHASE_565_HOST_TOOL_AUDIT_ACTIVE_LOCK_STABLE_BOUNDED_OBSERVATION.md)）
555. **Host tool audit active lock terminal directory binding**（已完成 [Phase566 基础实现](design/PHASE_566_HOST_TOOL_AUDIT_ACTIVE_LOCK_TERMINAL_DIRECTORY_BINDING.md)）
556. **Host tool audit active lock directory generation continuity**（已完成 [Phase567 基础实现](design/PHASE_567_HOST_TOOL_AUDIT_ACTIVE_LOCK_DIRECTORY_GENERATION_CONTINUITY.md)）
557. **Host tool audit lock residue stable authority observation**（已完成 [Phase568 基础实现](design/PHASE_568_HOST_TOOL_AUDIT_LOCK_RESIDUE_STABLE_AUTHORITY_OBSERVATION.md)）
558. **Host tool audit disposal source quarantine terminal continuity**（已完成 [Phase569 基础实现](design/PHASE_569_HOST_TOOL_AUDIT_DISPOSAL_SOURCE_QUARANTINE_TERMINAL_CONTINUITY.md)）
559. **Host tool audit terminal owner file generation continuity**（已完成 [Phase570 基础实现](design/PHASE_570_HOST_TOOL_AUDIT_TERMINAL_OWNER_FILE_GENERATION_CONTINUITY.md)）
560. **Host tool audit candidate-bound owner confirmation fingerprint**（已完成 [Phase571 基础实现](design/PHASE_571_HOST_TOOL_AUDIT_CANDIDATE_BOUND_OWNER_CONFIRMATION_FINGERPRINT.md)）
561. **Host tool audit runtime-confirmed maintenance fingerprint projection**（已完成 [Phase572 基础实现](design/PHASE_572_HOST_TOOL_AUDIT_RUNTIME_CONFIRMED_MAINTENANCE_FINGERPRINT_PROJECTION.md)）
562. **Host tool audit runtime-confirmed cleanup target absence projection**（已完成 [Phase573 基础实现](design/PHASE_573_HOST_TOOL_AUDIT_RUNTIME_CONFIRMED_CLEANUP_TARGET_ABSENCE_PROJECTION.md)）
563. **Host tool audit residual locator existence uncertainty projection**（已完成 [Phase574 基础实现](design/PHASE_574_HOST_TOOL_AUDIT_RESIDUAL_LOCATOR_EXISTENCE_UNCERTAINTY_PROJECTION.md)）
564. **Host tool audit runtime-missing preflight snapshot withdrawal**（已完成 [Phase575 基础实现](design/PHASE_575_HOST_TOOL_AUDIT_RUNTIME_MISSING_PREFLIGHT_SNAPSHOT_WITHDRAWAL.md)）
565. **Host tool audit maintenance result-preserving handle finalization**（已完成 [Phase576 基础实现](design/PHASE_576_HOST_TOOL_AUDIT_MAINTENANCE_RESULT_PRESERVING_HANDLE_FINALIZATION.md)）
566. **Host tool audit maintenance rejection handle finalization evidence**（已完成 [Phase577 基础实现](design/PHASE_577_HOST_TOOL_AUDIT_MAINTENANCE_REJECTION_HANDLE_FINALIZATION_EVIDENCE.md)）
567. **Host tool audit maintenance transient opener handle handoff**（已完成 [Phase578 基础实现](design/PHASE_578_HOST_TOOL_AUDIT_MAINTENANCE_TRANSIENT_OPENER_HANDLE_HANDOFF.md)）
568. **Host tool audit maintenance directory stream finalization evidence**（已完成 [Phase579 基础实现](design/PHASE_579_HOST_TOOL_AUDIT_MAINTENANCE_DIRECTORY_STREAM_FINALIZATION_EVIDENCE.md)）
569. **Host tool audit maintenance descriptor close settlement timeout**（已完成 [Phase580 基础实现](design/PHASE_580_HOST_TOOL_AUDIT_MAINTENANCE_DESCRIPTOR_CLOSE_SETTLEMENT_TIMEOUT.md)）
570. **Host tool audit inspection descriptor close settlement timeout**（已完成 [Phase581 基础实现](design/PHASE_581_HOST_TOOL_AUDIT_INSPECTION_DESCRIPTOR_CLOSE_SETTLEMENT_TIMEOUT.md)）
571. **Host tool audit rotation recovery candidate descriptor close settlement timeout**（已完成 [Phase582 基础实现](design/PHASE_582_HOST_TOOL_AUDIT_ROTATION_RECOVERY_CANDIDATE_DESCRIPTOR_CLOSE_SETTLEMENT_TIMEOUT.md)）
572. **Host tool audit cooperative lock lifecycle descriptor close settlement timeout**（已完成 [Phase583 基础实现](design/PHASE_583_HOST_TOOL_AUDIT_COOPERATIVE_LOCK_LIFECYCLE_DESCRIPTOR_CLOSE_SETTLEMENT_TIMEOUT.md)）
573. **Host tool audit lock acquisition descriptor close settlement timeout**（已完成 [Phase584 基础实现](design/PHASE_584_HOST_TOOL_AUDIT_LOCK_ACQUISITION_DESCRIPTOR_CLOSE_SETTLEMENT_TIMEOUT.md)）
574. **Host tool audit writer descriptor close settlement timeout**（已完成 [Phase585 基础实现](design/PHASE_585_HOST_TOOL_AUDIT_WRITER_DESCRIPTOR_CLOSE_SETTLEMENT_TIMEOUT.md)）
575. **Host tool audit cooperative lock lifecycle directory stream close settlement timeout**（已完成 [Phase586 基础实现](design/PHASE_586_HOST_TOOL_AUDIT_COOPERATIVE_LOCK_LIFECYCLE_DIRECTORY_STREAM_CLOSE_SETTLEMENT_TIMEOUT.md)）
576. **Host tool audit rotation recovery candidate directory stream close settlement timeout**（已完成 [Phase587 基础实现](design/PHASE_587_HOST_TOOL_AUDIT_ROTATION_RECOVERY_CANDIDATE_DIRECTORY_STREAM_CLOSE_SETTLEMENT_TIMEOUT.md)）
577. **Host MCP runtime close settlement timeout**（已完成 [Phase588 基础实现](design/PHASE_588_HOST_MCP_RUNTIME_CLOSE_SETTLEMENT_TIMEOUT.md)）
578. **Host prepared runtime lifecycle finalization**（已完成 [Phase589 基础实现](design/PHASE_589_HOST_PREPARED_RUNTIME_LIFECYCLE_FINALIZATION.md)）
579. **Host headless composite finalization continuity**（已完成 [Phase590 基础实现](design/PHASE_590_HOST_HEADLESS_COMPOSITE_FINALIZATION_CONTINUITY.md)）
580. **Host REPL composite cleanup lifecycle**（已完成 [Phase591 基础实现](design/PHASE_591_HOST_REPL_COMPOSITE_CLEANUP_LIFECYCLE.md)）
581. **Host engine process terminal stop lifecycle**（已完成 [Phase592 基础实现](design/PHASE_592_HOST_ENGINE_PROCESS_TERMINAL_STOP_LIFECYCLE.md)）
582. **Host doctor engine cleanup primary continuity**（已完成 [Phase593 基础实现](design/PHASE_593_HOST_DOCTOR_ENGINE_CLEANUP_PRIMARY_CONTINUITY.md)）
583. **Host doctor tool catalog cleanup primary continuity**（已完成 [Phase594 基础实现](design/PHASE_594_HOST_DOCTOR_TOOL_CATALOG_CLEANUP_PRIMARY_CONTINUITY.md)）
584. **Host CLI tools catalog cleanup primary continuity**（已完成 [Phase595 基础实现](design/PHASE_595_HOST_CLI_TOOLS_CATALOG_CLEANUP_PRIMARY_CONTINUITY.md)）
585. **Host plugin diagnostic runtime cleanup primary continuity**（已完成 [Phase596 基础实现](design/PHASE_596_HOST_PLUGIN_DIAGNOSTIC_RUNTIME_CLEANUP_PRIMARY_CONTINUITY.md)）
586. **Host MCP diagnostic runtime cleanup primary continuity**（已完成 [Phase597 基础实现](design/PHASE_597_HOST_MCP_DIAGNOSTIC_RUNTIME_CLEANUP_PRIMARY_CONTINUITY.md)）
587. **Host synchronous CLI finalizer primary continuity**（已完成 [Phase598 基础实现](design/PHASE_598_HOST_SYNCHRONOUS_CLI_FINALIZER_PRIMARY_CONTINUITY.md)）
588. **Host TUI controller composite lifecycle**（已完成 [Phase599 基础实现](design/PHASE_599_HOST_TUI_CONTROLLER_COMPOSITE_LIFECYCLE.md)）
589. **Host transcript watcher finalization continuity**（已完成 [Phase600 基础实现](design/PHASE_600_HOST_TRANSCRIPT_WATCHER_FINALIZATION_CONTINUITY.md)）
590. **Host provider log descriptor finalization continuity**（已完成 [Phase601 基础实现](design/PHASE_601_HOST_PROVIDER_LOG_DESCRIPTOR_FINALIZATION_CONTINUITY.md)）

## 4. 中期路线

中期目标是让现有骨架更容易真实使用和扩展：

- Permission / runtime：
  - 交互式权限确认 UI（已完成 Phase80 基础实现）
  - 多 session runtime（已完成 Phase81 基础实现）
  - 多工具并发调度（Phase82 Python Engine 内部基础实现已完成；provider-native parallel tool calls 已完成 Phase84 显式 opt-in 基础实现）
  - tool dependency graph scheduling（已完成 Phase85 基础实现）
  - TUI session dashboard（已完成 Phase86 基础实现）
  - TUI interaction polish（已完成 Phase87 基础实现，后续可增强 PTY smoke）
  - TUI modal approval（已完成 Phase88 基础实现）
  - TUI pane scrolling（已完成 Phase89 基础实现）
  - TUI assistant stream coalescing（已完成 Phase90 基础实现）
  - TUI keyboard help overlay（已完成 Phase91 基础实现）
  - TUI adaptive layout（已完成 Phase92 基础实现）
  - TUI debug diagnostics（已完成 Phase93 基础实现）
  - TUI pane focus style（已完成 Phase94 基础实现）
  - TUI PTY smoke harness（已完成 Phase95 基础实现）
  - TUI session switcher（已完成 Phase96 基础实现）
  - TUI live session switching（已完成 Phase97 基础实现）
  - TUI live session list pane（已完成 Phase98 基础实现）
  - TUI per-session event buffers（已完成 Phase99 基础实现）
  - TUI per-session status indicators（已完成 Phase100 基础实现）
  - TUI per-session unread counters（已完成 Phase101 基础实现）
  - TUI live session close command（已完成 Phase102 基础实现）
  - TUI live session pin command（已完成 Phase103 基础实现）
  - TUI live session rename command（已完成 Phase104 基础实现）
  - TUI live session filter（已完成 Phase105 基础实现）
  - TUI live session sort modes（已完成 Phase106 基础实现）
  - TUI live session quick actions（已完成 Phase107 基础实现）
  - TUI live session bulk actions（已完成 Phase108 基础实现）
  - TUI live session command palette（已完成 Phase109 基础实现）
  - TUI live session command search（已完成 Phase110 基础实现）
  - TUI live session command categories（已完成 Phase111 基础实现）
  - TUI live session command grouping UI（已完成 Phase112 基础实现）
  - TUI live session command favorites（已完成 Phase113 基础实现）
  - TUI live session command history（已完成 Phase114 基础实现）
  - TUI live session command pinned history（已完成 Phase115 基础实现）
  - TUI live session command history clear（已完成 Phase116 基础实现）
  - TUI live session command usage counts（已完成 Phase117 基础实现）
  - TUI live session command usage sorting（已完成 Phase118 基础实现）
  - TUI live session command usage ranking summary（已完成 Phase119 基础实现）
  - TUI live session command usage ranking visibility（已完成 Phase120 基础实现）
  - TUI live session command usage ranking size（已完成 Phase121 基础实现）
  - TUI live session command usage ranking adaptive layout（已完成 Phase122 基础实现）
  - TUI live session command usage ranking overflow indicator（已完成 Phase123 基础实现）
  - TUI live session command usage ranking multi-line layout（已完成 Phase124 基础实现）
  - TUI live session command usage ranking line-count controls（已完成 Phase125 基础实现）
  - TUI live session command usage ranking row-budget safeguards（已完成 Phase126 基础实现）
  - TUI live session command summary priority controls（已完成 Phase127 基础实现）
  - TUI live session command summary visibility profiles（已完成 Phase128 基础实现）
  - TUI live session command palette scrolling（已完成 Phase129 基础实现）
  - TUI live session command palette scroll position indicators（已完成 Phase130 基础实现）
  - TUI live session command palette page-size controls（已完成 Phase131 基础实现）
  - TUI live session command palette Home/End navigation（已完成 Phase132 基础实现）
  - TUI live session command palette selection wrapping controls（已完成 Phase133 基础实现）
  - TUI live session command palette group navigation（已完成 Phase134 基础实现）
  - TUI live session command palette group position indicators（已完成 Phase135 基础实现）
  - TUI live session command palette group size indicators（已完成 Phase136 基础实现）
  - TUI live session command palette in-group position indicators（已完成 Phase137 基础实现）
  - TUI live session command palette group neighbor indicators（已完成 Phase138 基础实现）
  - TUI live session command palette group neighbor size indicators（已完成 Phase139 基础实现）
  - TUI live session command palette group neighbor command-key indicators（已完成 Phase140 基础实现）
  - TUI live session command palette group neighbor command-position indicators（已完成 Phase141 基础实现）
  - TUI live session command palette group neighbor command-id indicators（已完成 Phase142 基础实现）
  - TUI live session command palette group neighbor visibility profiles（已完成 Phase143 基础实现）
  - TUI live session command palette group neighbor adaptive visibility（已完成 Phase144 基础实现）
  - TUI live session command palette group neighbor adaptive threshold controls（已完成 Phase145 基础实现）
  - TUI live session command palette group neighbor adaptive threshold indicators（已完成 Phase146 基础实现）
  - TUI live session command palette group neighbor adaptive threshold distance indicators（已完成 Phase147 基础实现）
  - TUI live session command palette group neighbor adaptive threshold target indicators（已完成 Phase148 基础实现）
  - TUI live session command palette group neighbor adaptive threshold progress indicators（已完成 Phase149 基础实现）
  - TUI live session command palette group neighbor adaptive threshold progress buckets（已完成 Phase150 基础实现）
  - TUI live session command palette group neighbor adaptive threshold progress bucket labels（已完成 Phase151 基础实现）
  - TUI live session command palette group neighbor adaptive threshold progress bucket help visibility（已完成 Phase152 基础实现）
  - TUI live session command palette group neighbor adaptive threshold progress bucket help status indicators（已完成 Phase153 基础实现）

- Session history：
  - `sessions search`（已完成 Phase16 基础实现）
  - `sessions delete`（已完成 Phase16 基础实现）
  - `sessions replay --json`（已完成 Phase16 基础实现）
  - `sessions resume` 从历史 session 继续对话（已完成 Phase21 基础实现）
  - `sessions cleanup` transcript 批量清理 / 归档 / 删除（已完成 Phase22 基础实现）
  - `sessions archive` 查看 / 回放 / 恢复归档 session（已完成 Phase23 基础实现）
  - `sessions archive search/delete` 搜索和删除归档 session（已完成 Phase24 基础实现）
  - archived transcript gzip 压缩（已完成 Phase30 基础实现）
  - `sessions index build/search` 本地搜索索引（已完成 Phase31 基础实现）
  - `sessions index refresh` 增量刷新（已完成 Phase32 基础实现）
  - `sessions timeline` / `sessions archive timeline` 单 session 事件时间线（已完成 Phase70 基础实现）
  - 跨目录 global transcript search（已完成 Phase75 基础实现）
  - 受限 transcript root discovery diagnostics（已完成 Phase76 基础实现）
  - discovery-backed global transcript search（已完成 Phase77 基础实现）
  - 短生命周期 transcript watch diagnostics（已完成 Phase78 基础实现）
  - 显式 index watch-refresh diagnostics（已完成 Phase79 基础实现）
  - session advanced recovery（已完成 Phase83 基础实现）
  - 后续再考虑后台 daemon、无界/自动 root discovery 或语义搜索

- Provider：
  - provider health check（已完成 Phase17 基础实现）
  - 更清楚的 provider config error（已完成 Phase17 基础实现）
  - provider config inspection（已完成 Phase20 基础实现）
  - OpenAI-compatible / Responses 的 contract tests（已完成 Phase19 基础实现）
  - provider retry policy（已完成 Phase53 基础实现）
  - provider fallback chain（已完成 Phase54 基础实现）
  - Anthropic Messages provider（已完成 Phase55 基础实现）
  - context budget / deterministic compaction（已完成 Phase56 基础实现）
  - local OpenAI-compatible provider（已完成 Phase57 基础实现）
  - provider usage accounting / budget guard（已完成 Phase58 基础实现）
  - provider-specific error mapping（已完成 Phase59 基础实现）
  - provider rate limit policy（已完成 Phase64 基础实现）
  - local provider daemon lifecycle（已完成 Phase65 基础实现）
  - local provider model discovery（已完成 Phase66 基础实现）
  - local provider model pull command（已完成 Phase67 基础实现）
  - local provider model remove command（已完成 Phase68 基础实现）
  - local provider model prune command（已完成 Phase69 基础实现）
  - 后续再考虑 runtime-native API 或自动缓存配额管理

- Prompt / Context：
  - context budget / deterministic compaction（已完成 Phase56 基础实现）
  - system prompt builder（已完成 Phase60 基础实现）
  - token budget manager（已完成 Phase61 基础实现）
  - summary compaction strategy（已完成 Phase62 基础实现）
  - prompt injection guard（已完成 Phase63 基础实现）
  - 后续再考虑 provider-backed semantic summarization、retrieval / summarization 或 LLM-backed classifier

- MCP：
  - MCP server 配置文件（已完成 Phase25 基础实现）
  - MCP tool schema 更完整展示（已完成 Phase26 基础实现）
  - MCP runtime 错误诊断（已完成 Phase18 基础实现，Phase27 补强结构化错误详情）
  - Streamable HTTP 配置诊断（已完成 Phase33 基础实现）
  - Streamable HTTP runtime 连接（已完成 Phase34 基础实现）
  - legacy SSE transport（已完成 Phase52 基础实现）
  - resources / prompts 连接诊断（已完成 Phase38 基础实现）
  - resource read / prompt get 显式诊断（已完成 Phase39 基础实现）
  - resource templates 连接诊断（已完成 Phase40 基础实现）
  - resource subscriptions 请求诊断（已完成 Phase41 基础实现）
  - completion 请求诊断（已完成 Phase42 基础实现）
  - resource update wait 诊断（已完成 Phase43 基础实现）
  - resource update watch 诊断（已完成 Phase44 基础实现）
  - resource update loop 诊断（已完成 Phase48 基础实现）
  - 显式 MCP context 注入（已完成 Phase49 基础实现）
  - Streamable HTTP env-backed auth header 和脱敏诊断（已完成 Phase50 基础实现）
  - MCP context 去重、限额和截断统计（已完成 Phase51 基础实现）
  - completion candidate 输出（已完成 Phase45 基础实现）
  - completion bash/zsh hook script（已完成 Phase46 基础实现）
  - completion guarded rc install（已完成 Phase47 基础实现）
  - 后续再考虑后台 daemon / 跨命令持久 resource update event loop、prompt/resource 自动发现注入或 OAuth / token refresh flow

- Plugin / Skill：
  - manifest schema 文档化（已完成 Phase28 基础实现）
  - manifest 校验 CLI（已完成 Phase18 基础实现）
  - 示例 plugin 包（已完成 Phase29 基础实现）
  - sandbox runtime 基础路径（已完成 Phase35 基础实现）
  - 显式配置入口和配置诊断（已完成 Phase36 基础实现）
  - 本地 registry 和 list / inspect（已完成 Phase37 基础实现）
  - local registry install command（已完成 Phase71 基础实现）
  - local registry uninstall command（已完成 Phase72 基础实现）
  - local registry enable / disable command（已完成 Phase73 基础实现）
  - local registry tags command（已完成 Phase74 基础实现）
  - 后续再考虑远程 marketplace、下载安装、安装脚本、持久 daemon 或系统级 sandbox

## 5. 长期路线

长期目标是从“架构骨架”继续走向更完整的 coding agent runtime：

- 交互式权限确认 UI（已完成 Phase80 基础实现）。
- 多 session runtime（已完成 Phase81 基础实现）。
- provider-native parallel tool calls（已完成 Phase84 显式 opt-in 基础实现）和更高级的多工具依赖图调度（已完成 Phase85 基础实现）。
- 更完整的 TUI（Phase86 已完成 TUI session dashboard 基础实现；Phase87 已完成 TUI interaction polish 基础实现；Phase88 已完成 TUI modal approval 基础实现；Phase89 已完成 TUI pane scrolling 基础实现；Phase90 已完成 TUI assistant stream coalescing 基础实现；Phase91 已完成 TUI keyboard help overlay 基础实现；Phase92 已完成 TUI adaptive layout 基础实现；Phase93 已完成 TUI debug diagnostics 基础实现；Phase94 已完成 TUI pane focus style 基础实现；Phase95 已完成 TUI PTY smoke harness 基础实现；Phase96 已完成 TUI session switcher 基础实现；Phase97 已完成 TUI live session switching 基础实现；Phase98 已完成 TUI live session list pane 基础实现；Phase99 已完成 TUI per-session event buffers 基础实现；Phase100 已完成 TUI per-session status indicators 基础实现；Phase101 已完成 TUI per-session unread counters 基础实现；Phase102 已完成 TUI live session close command 基础实现；Phase103 已完成 TUI live session pin command 基础实现；Phase104 已完成 TUI live session rename command 基础实现；Phase105 已完成 TUI live session filter 基础实现；Phase106 已完成 TUI live session sort modes 基础实现；Phase107 已完成 TUI live session quick actions 基础实现；Phase108 已完成 TUI live session bulk actions 基础实现；Phase109 已完成 TUI live session command palette 基础实现；Phase110 已完成 TUI live session command search 基础实现；Phase111 已完成 TUI live session command categories 基础实现；Phase112 已完成 TUI live session command grouping UI 基础实现；Phase113 已完成 TUI live session command favorites 基础实现；Phase114 已完成 TUI live session command history 基础实现；Phase115 已完成 TUI live session command pinned history 基础实现；Phase116 已完成 TUI live session command history clear 基础实现；Phase117 已完成 TUI live session command usage counts 基础实现；Phase118 已完成 TUI live session command usage sorting 基础实现；Phase119 已完成 TUI live session command usage ranking summary 基础实现；Phase120 已完成 TUI live session command usage ranking visibility 基础实现；Phase121 已完成 TUI live session command usage ranking size 基础实现；Phase122 已完成 TUI live session command usage ranking adaptive layout 基础实现；Phase123 已完成 TUI live session command usage ranking overflow indicator 基础实现；Phase124 已完成 TUI live session command usage ranking multi-line layout 基础实现；Phase125 已完成 TUI live session command usage ranking line-count controls 基础实现；Phase126 已完成 TUI live session command usage ranking row-budget safeguards 基础实现；Phase127 已完成 TUI live session command summary priority controls 基础实现；Phase128 已完成 TUI live session command summary visibility profiles 基础实现；Phase129 已完成 TUI live session command palette scrolling 基础实现；Phase130 已完成 TUI live session command palette scroll position indicators 基础实现；Phase131 已完成 TUI live session command palette page-size controls 基础实现；Phase132 已完成 TUI live session command palette Home/End navigation 基础实现；Phase133 已完成 TUI live session command palette selection wrapping controls 基础实现；Phase134 已完成 TUI live session command palette group navigation 基础实现；Phase135 已完成 TUI live session command palette group position indicators 基础实现；Phase136 已完成 TUI live session command palette group size indicators 基础实现；Phase137 已完成 TUI live session command palette in-group position indicators 基础实现；Phase138 已完成 TUI live session command palette group neighbor indicators 基础实现；Phase139 已完成 TUI live session command palette group neighbor size indicators 基础实现；Phase140 已完成 TUI live session command palette group neighbor command-key indicators 基础实现；Phase141 已完成 TUI live session command palette group neighbor command-position indicators 基础实现；Phase142 已完成 TUI live session command palette group neighbor command-id indicators 基础实现；Phase143 已完成 TUI live session command palette group neighbor visibility profiles 基础实现；Phase144 已完成 TUI live session command palette group neighbor adaptive visibility 基础实现；Phase145 已完成 TUI live session command palette group neighbor adaptive threshold controls 基础实现；Phase146 已完成 TUI live session command palette group neighbor adaptive threshold indicators 基础实现；Phase147 已完成 TUI live session command palette group neighbor adaptive threshold distance indicators 基础实现；Phase148 已完成 TUI live session command palette group neighbor adaptive threshold target indicators 基础实现；Phase149 已完成 TUI live session command palette group neighbor adaptive threshold progress indicators 基础实现；Phase150 已完成 TUI live session command palette group neighbor adaptive threshold progress buckets 基础实现；Phase151 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket labels 基础实现；Phase152 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help visibility 基础实现；Phase153 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help status indicators 基础实现；Phase154 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help shortcut indicators 基础实现；Phase155 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help compact indicators 基础实现；Phase156 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help compact legend indicators 基础实现；Phase157 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help legend display profiles 基础实现；Phase158 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend profiles 基础实现；Phase159 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend effective-profile indicators 基础实现；Phase160 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend threshold indicators 基础实现；Phase161 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend threshold distance indicators 基础实现；Phase162 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width indicators 基础实现；Phase163 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage indicators 基础实现；Phase164 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage buckets 基础实现；Phase165 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket labels 基础实现；Phase166 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility controls 基础实现；Phase167 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility profiles 基础实现；Phase168 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility threshold indicators 基础实现；Phase169 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility threshold distance indicators 基础实现；Phase170 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width indicators 基础实现；Phase171 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage indicators 基础实现；Phase172 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage buckets 基础实现；Phase173 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket labels 基础实现；Phase174 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility controls 基础实现；Phase175 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility profiles 基础实现；Phase176 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility threshold indicators 基础实现；Phase177 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility threshold distance indicators 基础实现；Phase178 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width indicators 基础实现；Phase179 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage indicators 基础实现；Phase180 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage buckets 基础实现；Phase181 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket labels 基础实现；Phase182 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility controls 基础实现；Phase183 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility profiles 基础实现；Phase184 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility threshold indicators 基础实现；Phase185 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility threshold distance indicators 基础实现；Phase186 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width indicators 基础实现；Phase187 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage indicators 基础实现；Phase188 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage buckets 基础实现；Phase189 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket labels 基础实现；Phase190 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility controls 基础实现；Phase191 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility profiles 基础实现；Phase192 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility threshold indicators 基础实现；Phase193 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility threshold distance indicators 基础实现；Phase194 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width indicators 基础实现；Phase195 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage indicators 基础实现；Phase196 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage buckets 基础实现；Phase197 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket labels 基础实现；Phase198 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility controls 基础实现；Phase199 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility profiles 基础实现；Phase200 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility threshold indicators 基础实现；Phase201 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility threshold distance indicators 基础实现；Phase202 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width indicators 基础实现；Phase203 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage indicators 基础实现；Phase204 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage buckets 基础实现；Phase205 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket labels 基础实现；Phase206 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility controls 基础实现，后续可增强 live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility profiles）。
- 长上下文 compaction（已完成 Phase56 deterministic character-budget 基础实现）。
- System prompt builder（已完成 Phase60 基础实现）。
- Token budget manager（已完成 Phase61 基础实现）。
- Summary compaction strategy（已完成 Phase62 基础实现）。
- Prompt injection guard（已完成 Phase63 基础实现）。
- Local OpenAI-compatible provider（已完成 Phase57 基础实现）。
- provider usage accounting / budget guard（已完成 Phase58 基础实现）。
- provider-specific error mapping（已完成 Phase59 基础实现）。
- Provider rate limit policy（已完成 Phase64 基础实现）。
- Local provider daemon lifecycle（已完成 Phase65 基础实现）。
- Local provider model discovery（已完成 Phase66 基础实现）。
- Local provider model pull command（已完成 Phase67 基础实现）。
- Local provider model remove command（已完成 Phase68 基础实现）。
- Local provider model prune command（已完成 Phase69 基础实现）。
- 更强的 transcript 查询和可视化（Phase70 已完成 session transcript timeline diagnostics 基础实现；Phase75 已完成 session global transcript search 基础实现；Phase76 已完成 transcript root discovery diagnostics 基础实现；Phase77 已完成 discovery-backed global transcript search 基础实现；Phase78 已完成 session transcript watch diagnostics 基础实现；Phase79 已完成 session index watch-refresh diagnostics 基础实现）。
- MCP 后台 daemon / 跨命令持久 resource update event loop、prompt/resource 自动发现注入和 OAuth / token refresh flow。
- Plugin / Skill local registry install command（已完成 Phase71 基础实现）。
- Plugin / Skill local registry uninstall command（已完成 Phase72 基础实现）。
- Plugin / Skill local registry enable / disable command（已完成 Phase73 基础实现）。
- Plugin / Skill local registry tags command（已完成 Phase74 基础实现）。
- Session global transcript search（已完成 Phase75 基础实现）。
- Session transcript root discovery diagnostics（已完成 Phase76 基础实现）。
- Discovery-backed global transcript search（已完成 Phase77 基础实现）。
- Session transcript watch diagnostics（已完成 Phase78 基础实现）。
- Session index watch-refresh diagnostics（已完成 Phase79 基础实现）。
- Session advanced recovery（已完成 Phase83 基础实现）。
- 远程 plugin marketplace、下载安装、安装脚本、持久 daemon 或系统级 sandbox。

## 6. 验收基线

当前阶段建议使用统一脚本作为基础验收：

```bash
./tools/check.sh
```

分项调试时可以单独运行：

```bash
./tools/run-python-tests.sh
./tools/run-ts-tests.sh
./tools/run-integration-tests.sh
./tools/run-cli-smoke.sh
```

`./tools/check.sh` 会依次运行 Python 测试、TS typecheck / Vitest、TS 构建、integration tests 和 CLI smoke。integration / smoke 固定走 fake model；provider contract-test 使用离线 fixtures，不调用真实 provider HTTP。

```bash
node ts-host/dist/cli/main.js doctor
node ts-host/dist/cli/main.js doctor --json
node ts-host/dist/cli/main.js doctor provider-health
node ts-host/dist/cli/main.js doctor provider-health --json
node ts-host/dist/cli/main.js provider inspect-config --json
node ts-host/dist/cli/main.js provider contract-test --json
node ts-host/dist/cli/main.js mcp inspect-config --json
GOD_CODE_MCP_CONFIG_FILE=examples/config/mcp-stdio-servers.json node ts-host/dist/cli/main.js mcp inspect-config --json
GOD_CODE_MCP_CONFIG_FILE=examples/config/mcp-stdio-servers.json GOD_CODE_MCP_CONTEXT='[{"type":"resource","uri":"memory://demo/readme"},{"type":"prompt","name":"summarize","arguments":{"text":"hello"}}]' node ts-host/dist/cli/main.js mcp inspect-context --json
GOD_CODE_DEMO_MCP_TOKEN=replace-me GOD_CODE_MCP_CONFIG_FILE=examples/config/mcp-streamable-http-auth-servers.json node ts-host/dist/cli/main.js mcp inspect-config --json
GOD_CODE_DEMO_MCP_TOKEN=replace-me GOD_CODE_MCP_CONFIG_FILE=examples/config/mcp-sse-servers.json node ts-host/dist/cli/main.js mcp inspect-config --json
GOD_CODE_MCP_CONFIG_FILE=examples/config/mcp-stdio-servers.json node ts-host/dist/cli/main.js mcp wait-resource-update memory://demo/readme --timeout-ms 1000 --json
GOD_CODE_MCP_CONFIG_FILE=examples/config/mcp-stdio-servers.json node ts-host/dist/cli/main.js mcp watch-resource-updates memory://demo/readme --max-events 3 --timeout-ms 1000 --json
GOD_CODE_MCP_CONFIG_FILE=examples/config/mcp-stdio-servers.json node ts-host/dist/cli/main.js mcp complete-prompt summarize text alph --values-only
GOD_CODE_MCP_CONFIG_FILE=examples/config/mcp-streamable-http-servers.json node ts-host/dist/cli/main.js mcp inspect-config --json
GOD_CODE_PLUGIN_CONFIG_FILE=examples/config/plugin-runtime.json node ts-host/dist/cli/main.js plugins inspect-config --json
GOD_CODE_PLUGIN_REGISTRY_FILE=examples/config/plugin-registry.json node ts-host/dist/cli/main.js plugins list --json
node ts-host/dist/cli/main.js plugins schema --json
node ts-host/dist/cli/main.js plugins validate examples/plugins/demo-plugin/plugin.json --json
node ts-host/dist/cli/main.js tools list
node ts-host/dist/cli/main.js tools list --json
node ts-host/dist/cli/main.js tools inspect Read --json
node ts-host/dist/cli/main.js run --json "bash printf ok"
node ts-host/dist/cli/main.js run --json --raw-events "bash printf ok"
node ts-host/dist/cli/main.js sessions list
node ts-host/dist/cli/main.js sessions search bash --json
node ts-host/dist/cli/main.js sessions replay <session_id> --json
node ts-host/dist/cli/main.js sessions resume <session_id> --json "bash printf resumed"
node ts-host/dist/cli/main.js sessions cleanup --older-than-days 30 --json
node ts-host/dist/cli/main.js sessions index build --include-archive --json
node ts-host/dist/cli/main.js sessions index refresh --include-archive --json
node ts-host/dist/cli/main.js sessions index search bash --json
node ts-host/dist/cli/main.js sessions index search bash --refresh --include-archive --json
node ts-host/dist/cli/main.js sessions archive list --json
node ts-host/dist/cli/main.js sessions archive search bash --json
node ts-host/dist/cli/main.js sessions archive compress <session_id> --yes --json
node ts-host/dist/cli/main.js sessions delete <session_id> --yes
node ts-host/dist/cli/main.js rpc-smoke
```

如果未来把 `GOD-code/` 单独发布成独立仓库，需要同步保留 `tools/` 下这些脚本和 README 中的命令说明。

## 7. 推进原则

- 先保持默认路径稳定，再扩展 provider / MCP / plugin。
- 新能力优先挂在现有边界上，不绕过 `TurnEngine`、`ProviderRegistry` 或 `HostToolRegistry.executeRequest(...)`。
- CLI 新命令优先做可测试的 headless 行为，再考虑交互体验。
- 文档必须明确“已实现”和“设计中”，避免开源用户误解。
- 能用 fake / fake transport / fake MCP server 测的路径，不依赖真实网络做单测。
