#!/usr/bin/env node

import http from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  CompleteRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

function createServerInstance() {
  const server = new Server(
    {
      name: "god-code-test-mcp-http-server",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {},
        resources: {
          subscribe: true
        },
        prompts: {},
        completions: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "echo",
        description: "Echo a value from the fake HTTP MCP server.",
        inputSchema: {
          type: "object",
          properties: {
            value: {
              type: "string"
            }
          }
        }
      },
      {
        name: "fail",
        description: "Return a tool error over HTTP.",
        inputSchema: {
          type: "object"
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "fail") {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "intentional HTTP MCP failure"
          }
        ]
      };
    }

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
        uri: "memory://remote/http-readme",
        name: "HTTP Demo README",
        description: "A fake HTTP MCP resource for diagnostics.",
        mimeType: "text/plain"
      }
    ]
  }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [
      {
        uriTemplate: "memory://remote/item/{id}",
        name: "HTTP Demo Item",
        description: "A fake HTTP MCP resource template for diagnostics.",
        mimeType: "text/plain"
      }
    ]
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri !== "memory://remote/http-readme") {
      throw new Error(`unknown resource: ${request.params.uri}`);
    }
    return {
      contents: [
        {
          uri: "memory://remote/http-readme",
          mimeType: "text/plain",
          text: "HTTP Demo README resource body."
        }
      ]
    };
  });

  server.setRequestHandler(SubscribeRequestSchema, async (request) => {
    if (request.params.uri !== "memory://remote/http-readme") {
      throw new Error(`unknown resource: ${request.params.uri}`);
    }
    return {};
  });

  server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
    if (request.params.uri !== "memory://remote/http-readme") {
      throw new Error(`unknown resource: ${request.params.uri}`);
    }
    return {};
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: "httpSummarize",
        description: "Summarize a value from the fake HTTP MCP server.",
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
    if (request.params.name !== "httpSummarize") {
      throw new Error(`unknown prompt: ${request.params.name}`);
    }
    return {
      description: "Summarize prompt from the fake HTTP MCP server.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `HTTP summarize: ${request.params.arguments?.text ?? ""}`
          }
        }
      ]
    };
  });

  server.setRequestHandler(CompleteRequestSchema, async (request) => {
    const value = String(request.params.argument.value ?? "");
    if (request.params.ref.type === "ref/prompt" && request.params.ref.name === "httpSummarize") {
      const values = ["http-alpha", "http-alphabet", "http-beta"].filter((item) => item.startsWith(value));
      return {
        completion: {
          values,
          total: values.length,
          hasMore: false
        }
      };
    }
    if (request.params.ref.type === "ref/resource" && request.params.ref.uri === "memory://remote/item/{id}") {
      const values = ["remote-1", "remote-2", "other"].filter((item) => item.startsWith(value));
      return {
        completion: {
          values,
          total: values.length,
          hasMore: false
        }
      };
    }
    throw new Error("unknown completion reference");
  });

  return server;
}

const httpServer = http.createServer(async (req, res) => {
  if (req.url !== "/mcp") {
    res.writeHead(404).end("not found");
    return;
  }

  const expectedAuthorization = process.env.MCP_EXPECT_AUTHORIZATION;
  if (expectedAuthorization && req.headers.authorization !== expectedAuthorization) {
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
    return;
  }

  if (req.method === "GET" || req.method === "DELETE") {
    res.writeHead(405, { "content-type": "application/json" }).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed."
        },
        id: null
      })
    );
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }

  const mcpServer = createServerInstance();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" }).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        })
      );
    }
  } finally {
    res.on("close", () => {
      transport.close().catch(() => undefined);
      mcpServer.close().catch(() => undefined);
    });
  }
});

httpServer.listen(0, "127.0.0.1", () => {
  const address = httpServer.address();
  if (typeof address === "object" && address) {
    process.stdout.write(`http://127.0.0.1:${address.port}/mcp\n`);
  }
});

process.on("SIGTERM", () => {
  httpServer.close(() => process.exit(0));
});
