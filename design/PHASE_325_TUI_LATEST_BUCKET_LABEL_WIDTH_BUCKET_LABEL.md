# Phase325 TUI Latest Bucket Label Width Bucket Label

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase324 最新 `L/M/H` 分段后补充 `low/mid/high` 文字标签。

- 新增 `liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(maxWidth)`。
- helper 委托既有共享标签映射，避免重复维护分段和文字标签的对应关系。
- 最新组合形成 `L(low)`、`M(mid)`、`H(high)`。
- 119 列输出 `adaptive>hidden+1[119/120=99%H(high)]@5`。
- 120 列输出 `adaptive>shown[120/120=100%H(high)]@5`。
- 180 列保留真实宽度并输出 `180/120=100%H(high)`。

## 接口边界与验收

- 不新增状态、action、快捷键或配置项。
- 不改变 profile resolver、距离、百分比或 bucket 算法。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或 session schema。
- label helper 覆盖 low、mid、high 映射。
- width helper、control indicator、Help 和 Debug 共用 label 结果。
- TypeScript 编译、聚焦测试和全量测试通过。
- Phase326 已为最新文字标签增加独立显隐控制。
