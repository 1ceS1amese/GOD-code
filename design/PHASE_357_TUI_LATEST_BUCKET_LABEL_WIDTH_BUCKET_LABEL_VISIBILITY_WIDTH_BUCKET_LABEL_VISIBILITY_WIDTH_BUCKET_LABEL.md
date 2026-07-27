# Phase357 TUI Latest Bucket Label Width Bucket Label Visibility Width Bucket Label Visibility Width Bucket Label

## 状态

代码、测试与文档已完成。

## 目标与实现

在 Phase356 最新 `L/M/H` 分段后追加对应的 `low/mid/high` 文字标签。

- 复用 Phase349 已有 label helper，并继续委托共享分段标签算法。
- 80 列输出 `adaptive>hidden+40[80/120=66%H(high)]@1`。
- 119 列输出 `adaptive>hidden+1[119/120=99%H(high)]@1`。
- 120 列输出 `adaptive>shown[120/120=100%H(high)]@1`。
- 180 列保留真实宽度并输出 `180/120=100%H(high)`。

## 接口边界与验收

- 不新增状态、action、快捷键、profile 或配置项。
- 不改变 profile resolver、距离计算、阈值、百分比或 bucket 判定。
- 不修改 protocol、Python Engine、provider、MCP、plugin 或 session schema。
- label helper 覆盖 `low/mid/high` 三类结果。
- width helper、indicator、Help 和 Debug 共用文字标签结果。
- TypeScript 编译、聚焦测试、全量测试和跨层接口扫描通过。

后续 Phase358 已为本级文字标签增加独立显隐控制，并使用不与可打印搜索冲突的 `F2` 命令面板快捷键。
