# Phase267 TUI Deepest Bucket Label Text Visibility Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Bucket Label Width Percentage Indicators

## 目标与实现

在 Phase266 最新宽度提示后追加相对共享 120 列阈值的归一化百分比。

- 新增 `liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(maxWidth)`。
- 复用共享整数截断和 100% 封顶算法。
- 119 列输出 `adaptive>hidden+1[119/120=99%]@#`。
- 120 列输出 `adaptive>shown[120/120=100%]@#`。
- 180 列保留真实宽度并输出 `180/120=100%`。
- 不新增状态、action、快捷键或跨层接口。

## 验收与下一阶段

- helper 和 Help/Debug 边界测试通过，TypeScript 编译及全量测试通过。
- Phase268 可增加 `L/M/H` 分段。
