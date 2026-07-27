# Contributing to GOD-code

感谢你考虑为 GOD-code 提交贡献。GOD-code 是一个实验性的 AI Coding Agent 架构骨架；贡献时应优先保证架构边界清晰、默认路径可离线验证、接口行为可回归测试。

## 开始之前

- 遵守 [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)。
- 使用问题和一般讨论请参考 [`SUPPORT.md`](SUPPORT.md)。
- 安全漏洞不要提交到公开 issue，请遵循 [`SECURITY.md`](SECURITY.md)。
- 大型功能、协议变更或架构调整建议先创建 issue，说明目标、边界、兼容性和验证方案，避免重复实现。

## 开发环境

需要：

- Node.js 18.19+ 与 npm。
- Python 3.12+。
- Bash，以及常见 POSIX 命令行工具。

首次准备：

```bash
cd ts-host
npm ci
cd ..
```

Python 测试脚本会自动创建或复用仓库内的 `.venv-test`，并在缺少 `pytest` 时安装它。

## 推荐贡献流程

1. Fork 仓库，并从当前默认分支创建一个短生命周期分支。
2. 让每个分支和 Pull Request 只解决一个清晰问题。
3. 在修改前确认受影响的 Host、Engine、Protocol、Provider、MCP 或 Plugin 边界。
4. 同步补充测试、协议样例和用户文档。
5. 运行适用的分项检查，并在提交 Pull Request 前运行完整门禁。
6. 在 Pull Request 中说明动机、实现方式、兼容性影响和实际执行的验证命令。

推荐的分支名称示例：

```text
fix/session-cleanup
feat/provider-adapter
docs/contribution-guide
test/mcp-contract
```

项目不强制特定 commit message 规范，但提交信息应使用祈使语气并准确描述变化，例如 `Fix provider log cleanup`。请避免把无关格式化、生成物或多个独立功能混入同一提交。

## 架构边界

提交代码时必须保持以下约束：

- 工具执行只发生在 TS Host；Python Engine 不直接读写宿主文件系统或运行 shell。
- 工具执行必须经过 `HostToolRegistry.executeRequest(...)`，保留 permission、path policy、audit 和 cancel 行为。
- Provider 细节保留在 Python `providers/` 层，不放入 `TurnEngine` 主循环。
- MCP、plugin 和 skill 默认不启用，必须由用户显式配置。
- JSON-RPC wire contract 不应隐式变化。修改协议时必须同步更新 `protocol/README.md`、examples、goldens 和 integration tests。
- 已知 primary error 不应被 cleanup/finalization secondary error 覆盖；资源所有权和关闭语义需要可验证。
- 公共 CLI、JSON、wire、audit 和 transcript 输出不得泄露 secret、原始凭据或内部资源句柄。

详细设计边界见：

- [`ARCHITECTURE.md`](ARCHITECTURE.md)
- [`INTERNAL_DESIGN.md`](INTERNAL_DESIGN.md)
- [`EXTENSION_POINTS.md`](EXTENSION_POINTS.md)
- [`protocol/README.md`](protocol/README.md)

## 测试与验证

完整检查：

```bash
./tools/check.sh
```

该命令依次执行 Python 测试、TypeScript 类型检查与测试、TypeScript 构建、integration tests 和 CLI smoke。

分项检查：

```bash
./tools/run-python-tests.sh
./tools/run-ts-tests.sh
cd ts-host && npm run build && cd ..
./tools/run-integration-tests.sh
./tools/run-cli-smoke.sh
```

默认测试、integration 和 smoke 使用 deterministic `fake` provider，不需要 API key，也不访问真实 provider HTTP。新增 provider、MCP 或 plugin 能力时，应优先使用 fake transport、fixture server 或离线 contract test。

最低测试要求：

- 新 CLI 行为需要 TypeScript 单元测试或 integration 覆盖。
- 新 JSON 输出需要稳定 contract，并优先提供 `--json` 形式。
- 新协议字段需要 protocol example 和 normalized golden event 校验。
- Bug fix 应增加能够在修复前失败、修复后通过的回归测试。
- 涉及资源生命周期的变更应覆盖成功、primary failure、cleanup failure、取消和重复关闭等路径。

## 文档要求

如果变更影响用户可见行为，请同步更新相应文档：

- 安装、命令或配置：`README.md`。
- 架构和内部边界：`ARCHITECTURE.md`、`INTERNAL_DESIGN.md` 或 `EXTENSION_POINTS.md`。
- 跨进程接口：`protocol/README.md`、`protocol/examples/` 和 `protocol/goldens/`。
- 安全假设或敏感数据处理：`SECURITY.md`。
- 用户可见版本变化：`CHANGELOG.md`。

文档中的示例必须能够从仓库根目录复现，不得包含真实 API key、token、私有路径或不可公开日志。

## Pull Request 检查项

Pull Request 应包含：

- 问题背景和目标。
- 主要实现选择及其取舍。
- 对 CLI、JSON-RPC、配置、持久化数据和兼容性的影响。
- 已执行的验证命令与结果。
- 未解决的限制或后续工作。

维护者会重点检查正确性、边界完整性、测试覆盖、文档一致性、安全影响和维护成本。评审可能要求拆分范围或补充验证，这不表示必须扩大原始需求。

## 依赖与生成物

- 添加运行时依赖前，请说明为什么标准库或现有依赖无法满足需求。
- 修改 npm 依赖时提交对应的 `ts-host/package-lock.json`。
- 不要提交 `node_modules`、`dist`、`.venv-test`、`.pytest_cache`、`__pycache__` 或 `.god-code`。
- 不要提交真实凭据、私有服务地址或包含敏感信息的测试产物。

需要恢复到仅保留源码和必要元数据的状态时，可以运行 `./tools/clean.sh --all`。该命令会删除已安装依赖和本地 runtime state，后续需要重新执行 `npm ci`。

## 贡献许可

本项目使用 [MIT License](LICENSE)。提交贡献即表示：

1. 你有权提交相关代码、文档或其他内容。
2. 该贡献可以按照项目的 MIT License 发布。
3. 你会保留第三方代码要求保留的版权和许可证声明。

当前不要求单独签署 CLA。

## 当前发布状态

`ts-host/package.json` 保留 `"private": true`。仓库当前以源码形式开放协作，不发布 npm 包；发布规则见 [`RELEASE.md`](RELEASE.md)。
