# Phase 14: Open Source Release Baseline

Phase 14 补齐开源协作所需的仓库级文档、许可证声明和 GitHub 社区入口。

它不新增 runtime 能力，不改变 JSON-RPC wire contract，不改变 CLI 命令，也不改变 `ts-host/package.json` 当前 `"private": true` 的发布状态。

## 当前状态

基础实现已经落地：

- `LICENSE`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `SUPPORT.md`
- `GOVERNANCE.md`
- `CHANGELOG.md`
- `RELEASE.md`
- `.github/ISSUE_TEMPLATE/`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `design/PHASE_14_OPEN_SOURCE_RELEASE.md`

许可证采用 MIT License；TypeScript 和 Python 包元数据均声明 `MIT`，但 TypeScript package 继续保留 `"private": true`。

## 设计目标

Phase 14 的目标是让仓库具备基本开源协作入口：

- 明确许可证。
- 明确贡献流程、行为准则和贡献许可。
- 明确安全边界、私密漏洞报告建议和支持范围。
- 明确维护者职责、版本变更记录和 GitHub Issue/PR 输入格式。
- 明确当前 release / npm publish 策略。
- 清理 README 中“尚未声明许可证”的旧状态描述。

## 架构边界

保持不变：

- JSON-RPC wire contract
- TS Host / Python Engine runtime API
- CLI command set
- Provider / MCP / plugin runtime 行为
- 默认 provider 为 `fake`
- `ts-host/package.json` 保留 `"private": true`

## 不做

Phase 14 当前不做：

- 发布 npm 包。
- 移除 `private: true`。
- 生成 release artifact。
- 新增 provider 配置示例。
- provider HTTP health check。
- Phase14 本身不做 MCP HTTP / SSE / Streamable HTTP runtime transport；Streamable HTTP 配置诊断已在 Phase33 补齐，Streamable HTTP runtime 已在 Phase34 补齐。
- TUI、多 session 并发或并发 tool calls。

## 验收

结构检查：

```bash
ls LICENSE CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md SUPPORT.md GOVERNANCE.md CHANGELOG.md RELEASE.md
ls .github/ISSUE_TEMPLATE .github/PULL_REQUEST_TEMPLATE.md
```

完整验收：

```bash
./tools/check.sh
```

文档一致性：

- README 不再出现“目前仓库还没有声明许可证”。
- README 能链接到 License、Contributing、Code of Conduct、Security、Support、Governance、Changelog 和 Release 文档。
- `PROJECT_PLAN.md` 标记 Phase14 基础实现完成。
