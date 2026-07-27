#!/usr/bin/env python3

from __future__ import annotations

import json
import sys


TOOLS = [
    {
        "name": "echo",
        "description": "Echo a value from the fake MCP server.",
        "inputSchema": {
            "type": "object",
            "properties": {"value": {"type": "string"}},
        },
    },
    {
        "name": "noDescription",
        "inputSchema": {"type": "object"},
    },
    {
        "name": "fail",
        "description": "Return a tool error.",
        "inputSchema": {"type": "object"},
    },
]

RESOURCES = [
    {
        "uri": "memory://demo/readme",
        "name": "Demo README",
        "description": "A fake MCP resource for diagnostics.",
        "mimeType": "text/plain",
    }
]

RESOURCE_TEMPLATES = [
    {
        "uriTemplate": "memory://demo/item/{id}",
        "name": "Demo Item",
        "description": "A fake MCP resource template for diagnostics.",
        "mimeType": "text/plain",
    }
]

PROMPTS = [
    {
        "name": "summarize",
        "description": "Summarize a value from the fake MCP server.",
        "arguments": [
            {
                "name": "text",
                "description": "Text to summarize.",
                "required": True,
            }
        ],
    }
]


def send(payload: dict[str, object]) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def respond(message_id: object, result: dict[str, object]) -> None:
    send({"jsonrpc": "2.0", "id": message_id, "result": result})


def respond_error(message_id: object, code: int, message: str) -> None:
    send({"jsonrpc": "2.0", "id": message_id, "error": {"code": code, "message": message}})


for line in sys.stdin:
    message = json.loads(line)
    message_id = message.get("id")
    if message_id is None:
        continue

    method = message.get("method")
    params = message.get("params")
    if not isinstance(params, dict):
        params = {}

    if method == "initialize":
        respond(
            message_id,
            {
                "protocolVersion": params.get("protocolVersion", "2025-06-18"),
                "capabilities": {"tools": {}, "resources": {"subscribe": True}, "prompts": {}, "completions": {}},
                "serverInfo": {"name": "god-code-test-mcp-server", "version": "0.1.0"},
            },
        )
        continue

    if method == "tools/list":
        respond(message_id, {"tools": TOOLS})
        continue

    if method == "resources/list":
        respond(message_id, {"resources": RESOURCES})
        continue

    if method == "resources/templates/list":
        respond(message_id, {"resourceTemplates": RESOURCE_TEMPLATES})
        continue

    if method == "resources/read":
        uri = params.get("uri")
        if uri == "memory://demo/readme":
            respond(
                message_id,
                {
                    "contents": [
                        {
                            "uri": "memory://demo/readme",
                            "mimeType": "text/plain",
                            "text": "Demo README resource body.",
                        }
                    ]
                },
            )
        else:
            respond_error(message_id, -32004, f"unknown resource: {uri}")
        continue

    if method == "resources/subscribe":
        uri = params.get("uri")
        if uri == "memory://demo/readme":
            respond(message_id, {})
            for _ in range(3):
                send(
                    {
                        "jsonrpc": "2.0",
                        "method": "notifications/resources/updated",
                        "params": {"uri": uri},
                    }
                )
        else:
            respond_error(message_id, -32004, f"unknown resource: {uri}")
        continue

    if method == "resources/unsubscribe":
        uri = params.get("uri")
        if uri == "memory://demo/readme":
            respond(message_id, {})
        else:
            respond_error(message_id, -32004, f"unknown resource: {uri}")
        continue

    if method == "prompts/list":
        respond(message_id, {"prompts": PROMPTS})
        continue

    if method == "prompts/get":
        name = params.get("name")
        arguments = params.get("arguments")
        if not isinstance(arguments, dict):
            arguments = {}
        if name == "summarize":
            text = str(arguments.get("text", ""))
            respond(
                message_id,
                {
                    "description": "Summarize prompt from the fake MCP server.",
                    "messages": [
                        {
                            "role": "user",
                            "content": {
                                "type": "text",
                                "text": f"Summarize: {text}",
                            },
                        }
                    ],
                },
            )
        else:
            respond_error(message_id, -32005, f"unknown prompt: {name}")
        continue

    if method == "completion/complete":
        ref = params.get("ref")
        argument = params.get("argument")
        if not isinstance(ref, dict) or not isinstance(argument, dict):
            respond_error(message_id, -32602, "invalid completion params")
            continue
        value = str(argument.get("value", ""))
        if ref.get("type") == "ref/prompt" and ref.get("name") == "summarize":
            values = [item for item in ["alpha", "alphabet", "beta"] if item.startswith(value)]
            respond(message_id, {"completion": {"values": values, "total": len(values), "hasMore": False}})
            continue
        if ref.get("type") == "ref/resource" and ref.get("uri") == "memory://demo/item/{id}":
            values = [item for item in ["item-1", "item-2", "other"] if item.startswith(value)]
            respond(message_id, {"completion": {"values": values, "total": len(values), "hasMore": False}})
            continue
        respond_error(message_id, -32006, "unknown completion reference")
        continue

    if method == "tools/call":
        name = params.get("name")
        arguments = params.get("arguments")
        if not isinstance(arguments, dict):
            arguments = {}

        if name == "echo":
            value = str(arguments.get("value", ""))
            respond(
                message_id,
                {
                    "content": [{"type": "text", "text": value}],
                    "structuredContent": {"echoed": value},
                },
            )
            continue

        if name == "fail":
            respond(
                message_id,
                {
                    "isError": True,
                    "content": [{"type": "text", "text": "intentional MCP failure"}],
                },
            )
            continue

        respond_error(message_id, -32602, f"Unknown tool: {name}")
        continue

    respond_error(message_id, -32601, f"Unknown method: {method}")
