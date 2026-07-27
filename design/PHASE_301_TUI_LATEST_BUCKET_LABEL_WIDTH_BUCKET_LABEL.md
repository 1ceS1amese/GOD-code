# Phase301 TUI Latest Bucket Label Width Bucket Label

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase300 最新 `L/M/H` 分段后补充 `low/mid/high` 文字标签。

- 新增 `liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabel(maxWidth)`。
- helper 委托既有共享标签映射，避免重复维护 `L/M/H` 与文字标签的对应关系。
- 最新组合形成 `L(low)`、`M(mid)`、`H(high)`。
- 119 列输出 `adaptive>hidden+1[119/120=99%H(high)]@8`。
- 120 列输出 `adaptive>shown[120/120=100%H(high)]@8`。
- 180 列保留真实宽度并输出 `180/120=100%H(high)`。

## 接口边界与验收

- 不新增状态、action、快捷键或跨进程接口。
- label helper 覆盖 low、mid、high 映射。
- width indicator、Help 和 Debug 共用同一 label helper 结果。
- TypeScript 编译、聚焦测试和全量测试通过。
- Phase302 已为最新文字标签增加独立显隐控制。
