# Phase277 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Labels

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase276 最新 `L/M/H` 分段后补充 `low/mid/high` 文字标签。

- 复用 Phase269 已存在的同层级 `liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(maxWidth)`。
- 复用共享标签映射，形成 `L(low)`、`M(mid)`、`H(high)`。
- 119 列输出 `adaptive>hidden+1[119/120=99%H(high)]@$`。
- 120 列输出 `adaptive>shown[120/120=100%H(high)]@$`。
- 180 列保留真实宽度并输出 `180/120=100%H(high)`。
- 不新增状态、action、快捷键或跨层接口。

## 验收与下一阶段

- label helper、width indicator、Help、Debug、TypeScript 编译及全量测试通过。
- Phase278 已增加最新文字标签的独立显隐控制。
