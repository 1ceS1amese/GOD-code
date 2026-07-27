# Phase372 TUI Adaptive Indicator Formatter Migration

## 状态

代码、测试与文档已完成。

## 审计结论

Phase371 已统一 resolver 与 distance，但仍有 23 个 indicator wrapper 重复组合 effective profile、distance、width detail、name 和 shortcut。其中 22 个使用 shown/hidden，有 1 个 legend 使用 compact/full。

## 目标

- 将剩余 23 个 adaptive indicator wrapper 全部委托给共享 formatter。
- 扩展 formatter 以支持 legend 的显式 effective profile 和 distance。
- 保持所有 wrapper、name、shortcut、width callback 和输出文本不变。

## 验收标准

- `tuiState.ts` 中 `const profileLabel = profile === "adaptive"` 重复块为 0。
- 共享 formatter 调用达到 26 个。
- legend 的 compact/full adaptive 输出保持不变。
- 显式 profile 不执行 width callback。
- 编译、专项测试和全量测试通过。

## 实现结果

- 22 个 shown/hidden wrapper 和 1 个 compact/full legend wrapper 已迁移。
- 共享 formatter 当前承载全部 26 个 adaptive indicator wrapper。
- formatter 支持可选 effective profile 与 distance，特殊 legend 仍通过原 resolver/distance wrapper 注入结果。
- `tuiState.ts` 中重复 `profileLabel` 组合块已清零。

## 后续边界

Phase373 已完成 width metrics helper 和 26 个 width indicator 迁移，percentage、bucket、label 根算法也已收敛。
