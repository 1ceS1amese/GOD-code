# Phase275 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Indicators

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase274 最新宽度提示后追加相对共享 120 列阈值的归一化百分比。

- 复用 Phase269 已存在的同层级 `liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(maxWidth)`，避免重复定义相同算法。
- percentage helper 继续复用共享整数截断和 100% 封顶算法。
- 119 列输出 `adaptive>hidden+1[119/120=99%]@$`。
- 120 列输出 `adaptive>shown[120/120=100%]@$`。
- 180 列保留真实宽度并输出 `180/120=100%`。
- 不新增状态、action、快捷键或跨层接口。

## 验收与下一阶段

- helper 覆盖 0、40、80、119、120、180，Help/Debug 边界和 100% 封顶测试通过。
- TypeScript 编译、聚焦测试和全量测试通过。
- Phase276 已增加 `L/M/H` 分段。
