# Release Process

GOD-code 当前源码版本为 `0.1.0`，定位是实验性架构骨架。仓库使用 [MIT License](LICENSE)，但当前发布策略仍以源码协作为主。

## Versioning

项目采用语义化版本（SemVer）原则：

- **Patch**：兼容的 bug fix、测试、文档和安全修复。
- **Minor**：兼容的新 CLI、provider、MCP/plugin 能力或协议扩展。
- **Major**：破坏 JSON-RPC wire contract、CLI contract、持久化格式或核心架构边界的变化。

在 `1.0.0` 前，minor 版本仍可能调整实验性接口。任何不兼容变化都必须在 `CHANGELOG.md` 和 release notes 中明确标注，并提供迁移说明。

## Current Publish Policy

`ts-host/package.json` 保留 `"private": true`。因此当前策略是：

- 允许 Fork、源码分发和本地运行。
- 不发布 npm 包。
- 不承诺生成二进制或平台安装包。
- 版本号用于标识源码和接口基线，不自动表示存在 GitHub Release 或 package registry artifact。

准备 npm 发布前，至少需要重新评估：

- package `name`、`bin`、`files`、`repository`、`homepage` 和 `bugs` 元数据。
- 打包后的 README、LICENSE、类型声明和 runtime 文件是否完整。
- npm provenance、发布权限、2FA 和 release automation。
- Node.js 支持矩阵、安装后 smoke 和撤回策略。

## Release Preparation

1. 确认目标版本和发布范围。
2. 更新 `CHANGELOG.md`，把目标内容从 `Unreleased` 移入带日期的版本条目。
3. 同步更新 `ts-host/package.json`、`ts-host/package-lock.json` 和 `py-engine/pyproject.toml` 中的版本号。
4. 检查 README、协议、配置示例、安全边界和已知限制是否仍准确。
5. 从干净环境安装依赖并执行完整门禁。
6. 评审 release diff，确认没有生成物、凭据、私有路径或敏感日志。
7. 当前仅在明确决定发布时创建签名或受保护 tag；不要把普通开发提交误标记为 release。

## Pre-release Checklist

发布前运行：

```bash
./tools/check.sh
```

同时确认：

- `LICENSE` 是完整的 MIT License，且包元数据使用 `MIT` SPDX 标识。
- `README.md` 的安装方式、状态说明和限制与实现一致。
- `CONTRIBUTING.md`、`SECURITY.md`、`SUPPORT.md` 和本文件没有过时描述。
- `CHANGELOG.md` 包含版本、ISO 日期、兼容性变化、已知限制和安全影响。
- `protocol/examples/` 与 `protocol/goldens/` 匹配当前 JSON-RPC 行为。
- 默认门禁仍使用 `fake` provider，不依赖真实网络或 API key。
- `ts-host/package-lock.json` 与 `ts-host/package.json` 一致。
- Python 和 TypeScript 包元数据可以被各自工具正常解析。
- 工作区不存在需要随版本发布的未跟踪配置或临时产物。

## Release Notes

每次 release notes 应至少包含：

- 版本号和发布日期。
- 主要新增能力和修复。
- Breaking changes 与迁移步骤。
- 安全相关变化。
- 已知限制。
- 实际执行的验收命令和结果。
- Artifact 类型、校验方式和许可证说明。

不要在 release notes 中包含 API key、token、私有路径、未脱敏日志或未公开漏洞细节。

## Post-release Verification

如果未来开始发布 artifact，应在发布后从公开渠道重新安装并执行最小 smoke，确认版本、CLI 入口、LICENSE 和文档可访问。发现阻断性问题时，应优先发布修复版本；不要静默替换已经发布的 artifact。
