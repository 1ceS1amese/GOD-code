# Phase508 Host Tool Audit Constructor Invariants

## 状态

代码、测试与文档已完成。

## 审计结论

`createConfiguredAuditSink`会校验`GOD_CODE_AUDIT_MAX_BYTES`，但JsonlAuditSink是公开类，嵌入方和Host setup可以直接注入实例。此前constructor接受zero、negative、fraction、NaN、Infinity和超安全整数。尤其NaN/Infinity会让`lineBytes > maxBytes`和rotation比较失去预期效果，直接注入可绕过Phase500容量边界。空字符串path还会被`path.resolve("")`静默解释为cwd目录。

## 目标

- Constructor拒绝empty或whitespace-only path。
- Constructor要求maxBytes为positive safe integer。
- 拒绝zero、negative、fraction、NaN和Infinity。
- 拒绝超过`Number.MAX_SAFE_INTEGER`的容量。
- 校验发生在absolute path identity和writer coordination之前。
- 环境配置与直接构造复用同一numeric validator。
- 环境变量错误继续命名`GOD_CODE_AUDIT_MAX_BYTES`。
- 直接构造错误明确命名`JSONL audit maxBytes`。
- 无效构造不创建文件、不登记tail，也不进入best-effort warning路径。
- 不改变合法默认值和显式合法容量行为。

## Constructor Boundary

Constructor首先验证`filePath`是non-empty string，再调用`validateJsonlAuditMaxBytes(maxBytes)`。只有全部成功后才执行`path.resolve`、设置coordination key和公开字段。因此无效实例不会形成部分初始化状态或共享writer entry。

## Shared Numeric Validation

`validateJsonlAuditMaxBytes(value, source)`使用`Number.isSafeInteger(value) && value > 0`作为唯一numeric invariant。Config parser仍先拒绝非decimal string，再把parsed number交给该函数并传入环境变量source label。这样string grammar属于adapter，数值安全属于sink core。

## Failure Semantics

Constructor error表示部署/编程配置错误，与运行期间单条audit event失败不同，因此同步阻止实例创建，不通过`AuditSink.record()`或`output.audit_warnings`报告。该语义与其他Host setup config validation一致。

## 验收标准

- Whitespace path直接拒绝。
- 0、-1、1.5、NaN、Infinity和2^53容量直接拒绝。
- 错误文本区分direct constructor与environment config source。
- 无效构造不创建target文件。
- 合法direct sink、configured sink和Host injection tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- Constructor新增path和maxBytes validation。
- 新增exported shared numeric validator。
- Config parser复用shared validator并保持原错误契约。
- tests覆盖direct invalid path/capacity injection和no-file side effect。
- README、SECURITY、protocol、architecture和extension docs同步constructor boundary。
