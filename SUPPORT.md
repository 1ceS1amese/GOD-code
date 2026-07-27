# Support

GOD-code 是实验性开源项目，当前不提供商业支持、响应时间保证或生产环境 SLA。社区会在可用时间内以 best-effort 方式处理问题。

## 使用问题

在提交问题前，请先：

1. 阅读 [`README.md`](README.md) 的快速开始、配置和限制说明。
2. 运行 `node ts-host/dist/cli/main.js doctor --json` 获取基础诊断。
3. 使用当前源码和 deterministic `fake` provider 复现问题。
4. 搜索已有 Issue，确认问题尚未被报告。

如果仍需帮助，可以创建公开 Issue，并提供最小复现、环境版本、实际行为和预期行为。请删除 API key、token、私有路径、用户数据和敏感日志。

## Bug 报告

请使用 Bug Report 模板，并尽量包含：

- 使用的 commit 或版本。
- 操作系统、Node.js、npm 和 Python 版本。
- 最小复现步骤和输入。
- 预期结果与实际结果。
- 相关测试、CLI 输出或脱敏日志。
- 问题是否能在默认 `fake` provider 下复现。

## 功能建议

请使用 Feature Request 模板，说明使用场景、现有限制、建议边界、兼容性影响和可验证的完成标准。大型协议或架构变化应先讨论设计，再开始实现。

## 安全问题

疑似凭据泄漏、路径逃逸、命令执行绕过、权限绕过、MCP/plugin 边界绕过或 provider 配置泄漏时，不要创建公开 Issue。请按照 [`SECURITY.md`](SECURITY.md) 使用私密漏洞报告渠道。

## 不属于支持范围的内容

- 第三方 provider、MCP server 或 plugin 自身的账户、计费和服务可用性问题。
- 未经项目配置或测试覆盖的生产部署保证。
- 与当前仓库无关的系统管理、模型质量或通用编程咨询。
- 要求维护者处理真实凭据、私有数据或不可公开环境。

## 自助诊断

常用命令：

```bash
node ts-host/dist/cli/main.js doctor
node ts-host/dist/cli/main.js doctor --json
node ts-host/dist/cli/main.js provider inspect-config --json
node ts-host/dist/cli/main.js mcp inspect-config --json
node ts-host/dist/cli/main.js plugins list --json
./tools/check.sh
```

完整命令和配置说明见 [`README.md`](README.md)。
