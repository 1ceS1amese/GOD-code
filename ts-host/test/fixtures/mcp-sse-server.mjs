#!/usr/bin/env node

import http from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

const transports = new Map();
const servers = new Map();

function createServerInstance() {
  const server = new Server(
    {
      name: "god-code-test-mcp-sse-server",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "echo",
        description: "Echo a value from the fake SSE MCP server.",
        inputSchema: {
          type: "object",
          properties: {
            value: {
              type: "string"
            }
          }
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const value = String(request.params.arguments?.value ?? "");
    return {
      content: [
        {
          type: "text",
          text: value
        }
      ],
      structuredContent: {
        echoed: value
      }
    };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: "memory://sse/readme",
        name: "SSE Demo README",
        description: "A fake SSE MCP resource for diagnostics.",
        mimeType: "text/plain"
      }
    ]
  }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [
      {
        uriTemplate: "memory://sse/item/{id}",
        name: "SSE Demo Item",
        description: "A fake SSE MCP resource template for diagnostics.",
        mimeType: "text/plain"
      }
    ]
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri !== "memory://sse/readme") {
      throw new Error(`unknown resource: ${request.params.uri}`);
    }
    return {
      contents: [
        {
          uri: "memory://sse/readme",
          mimeType: "text/plain",
          text: "SSE Demo README resource body."
        }
      ]
    };
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: "sseSummarize",
        description: "Summarize a value from the fake SSE MCP server.",
        arguments: [
          {
            name: "text",
            description: "Text to summarize.",
            required: true
          }
        ]
      }
    ]
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== "sseSummarize") {
      throw new Error(`unknown prompt: ${request.params.name}`);
    }
    return {
      description: "Summarize prompt from the fake SSE MCP server.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `SSE summarize: ${request.params.arguments?.text ?? ""}`
          }
        }
      ]
    };
  });

  return server;
}

function checkAuthorization(req, res) {
  const expectedAuthorization = process.env.MCP_EXPECT_AUTHORIZATION;
  if (!expectedAuthorization || req.headers.authorization === expectedAuthorization) {
    return true;
  }
  res.writeHead(401, { "content-type": "application/json" }).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Unauthorized."
      },
      id: null
    })
  );
  return false;
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  if (req.method === "GET" && url.pathname === "/sse") {
    if (!checkAuthorization(req, res)) {
      return;
    }
    const transport = new SSEServerTransport("/messages", res);
    const server = createServerInstance();
    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);
    servers.set(sessionId, server);
    transport.onclose = () => {
      transports.delete(sessionId);
      servers.delete(sessionId);
      server.close().catch(() => undefined);
    };
    try {
      await server.connect(transport);
    } catch (error) {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      transports.delete(sessionId);
      servers.delete(sessionId);
      if (!res.headersSent) {
        res.writeHead(500).end("failed to establish SSE transport");
      }
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/messages") {
    if (!checkAuthorization(req, res)) {
      return;
    }
    const sessionId = url.searchParams.get("sessionId");
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.writeHead(404).end("session not found");
      return;
    }
    await transport.handlePostMessage(req, res);
    return;
  }

  res.writeHead(404).end("not found");
});

httpServer.listen(0, "127.0.0.1", () => {
  const address = httpServer.address();
  if (typeof address === "object" && address) {
    process.stdout.write(`http://127.0.0.1:${address.port}/sse\n`);
  }
});

process.on("SIGTERM", () => {
  for (const transport of transports.values()) {
    transport.close().catch(() => undefined);
  }
  for (const server of servers.values()) {
    server.close().catch(() => undefined);
  }
  httpServer.close(() => process.exit(0));
});
