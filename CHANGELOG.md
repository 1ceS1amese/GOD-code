# Changelog

本文件记录 GOD-code 面向用户和贡献者的重要变化。项目采用 [`RELEASE.md`](RELEASE.md) 中定义的语义化版本规则；内部 Phase 设计记录不替代版本变更日志。

## Unreleased

### Added

- 标准化开源项目入口、社区行为准则、支持政策、治理说明和 GitHub Issue/Pull Request 模板。
- TypeScript Host 与 Python Engine 的 MIT 许可证包元数据。
- 可重复执行的 `tools/clean.sh` 仓库清理入口。
- `CONTRIBUTORS.md` 以及 OpenAI Codex 的 AI 辅助开发披露。

### Changed

- README 增加项目导航、核心特性、环境版本和开源协作入口。
- 贡献、安全和发布文档与当前实现边界保持一致。
- 扩展 `.gitignore`，覆盖构建输出、测试缓存、runtime state、包产物和编辑器临时文件。

## 0.1.0 - 2026-07-27

> 此条目记录当前源码基线，不表示已经发布 npm 包、GitHub Release 或其他二进制制品。

### Added

- TypeScript Host、Python Engine 和 JSON-RPC over stdio 协议的分层架构。
- `Read`、`Edit`、`Bash`、`ListFiles`、`Search` 和 `Write` 内置工具。
- 权限、路径策略、命令 denylist、audit 和取消传播基础能力。
- Deterministic `fake` model，以及 OpenAI-compatible、Responses、Anthropic 和本地 provider 基础路径。
- MCP stdio、Streamable HTTP、legacy SSE 和本地 plugin/skill runtime 基础能力。
- Session transcript、history、diagnostics、REPL 和 TUI 基础能力。
- Python、TypeScript、integration、built integration 和 CLI smoke 验证门禁。
- Phase1 至 Phase601 的设计、实现和 lifecycle hardening 记录。

### Security

- 工具执行集中在 TS Host，并通过统一 registry 应用权限、路径、审计和取消策略。
- 完成 Phase601 后的 lifecycle release audit；详细证据见 [`design/FINAL_RELEASE_AUDIT_AFTER_PHASE_601.md`](design/FINAL_RELEASE_AUDIT_AFTER_PHASE_601.md)。

### License

- 源代码按照 [MIT License](LICENSE) 发布。
