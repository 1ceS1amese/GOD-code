# Phase 25: MCP Server Config File

Phase25 为 MCP stdio runtime 增加显式配置文件入口，避免只能通过 `GOD_CODE_MCP_SERVERS` 塞入整段 JSON。

本阶段仍然是 TS Host 本地能力：不新增 JSON-RPC 方法，不改变 Python Engine payload，不自动启用 MCP。配置文件必须通过环境变量显式指定。

## 配置入口

```bash
GOD_CODE_MCP_CONFIG_FILE=examples/config/mcp-stdio-servers.json
```

配置文件内容沿用 `GOD_CODE_MCP_SERVERS` 的 JSON array schema：

```json
[
  {
    "id": "demo",
    "command": "python3",
    "args": ["ts-host/test/fixtures/mcp-demo-server.py"],
    "cwd": ".",
    "env": {
      "EXAMPLE": "value"
    }
  }
]
```

## 行为边界

- `GOD_CODE_MCP_SERVERS` 非空时优先使用 env JSON。
- `GOD_CODE_MCP_SERVERS` 为空且 `GOD_CODE_MCP_CONFIG_FILE` 非空时读取配置文件。
- `GOD_CODE_MCP_CONFIG_FILE` 相对路径按当前工作目录解析。
- 默认不读取隐式路径；未配置时仍是 no MCP servers。
- 诊断输出只展示 sanitized metadata：source、config file path、server id、command、args count、cwd、env keys。
- 不支持 YAML、JSON object wrapper、include/extends、secret interpolation 或自动发现。

## 验收

- `god-code mcp inspect-config --json` 能报告 file source 和 sanitized server metadata。
- `god-code mcp inspect-config --connect --json` 能连接 file-configured stdio server。
- Headless host setup 能把 file-configured MCP tools 加入 tool catalog。
- `./tools/check.sh` 全量通过。
