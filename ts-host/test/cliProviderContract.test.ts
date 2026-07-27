import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  inspectProviderConfig,
  inspectLocalProviderDaemon,
  listLocalProviderModels,
  pruneLocalProviderModels,
  pullLocalProviderModel,
  removeLocalProviderModel,
  type ProviderContractReport,
  renderLocalProviderDaemonReport,
  renderLocalProviderDaemonReportJson,
  renderLocalProviderModelRemoveReport,
  renderLocalProviderModelRemoveReportJson,
  renderLocalProviderModelPruneReport,
  renderLocalProviderModelPruneReportJson,
  renderLocalProviderModelPullReport,
  renderLocalProviderModelPullReportJson,
  renderLocalProviderModelsReport,
  renderLocalProviderModelsReportJson,
  renderProviderContractReport,
  renderProviderContractReportJson,
  renderProviderConfigReport,
  renderProviderConfigReportJson,
  runProviderContractTests,
  startLocalProviderDaemon,
  stopLocalProviderDaemon
} from "../src/cli/provider.js";

describe("provider inspect-config CLI helper", () => {
  it("reports fake provider config by default", () => {
    const report = inspectProviderConfig({});
    const details = report.checks[0]?.details as Record<string, unknown>;

    expect(report.ok).toBe(true);
    expect(report.checks[0]?.status).toBe("ok");
    expect(report.checks[0]?.message).toBe("using fake provider");
    expect(details.provider).toBe("fake");
    expect(details.api_key_present).toBe(false);
    expect(details.tool_use).toEqual({ parallel_tool_calls: false });
  });

  it("reports complete known provider config without leaking secrets", () => {
    const report = inspectProviderConfig({
      GOD_CODE_PROVIDER: "openai",
      GOD_CODE_MODEL: "gpt-test",
      GOD_CODE_API_KEY_ENV: "OPENAI_API_KEY",
      OPENAI_API_KEY: "secret-value",
      GOD_CODE_PROVIDER_TIMEOUT_S: "12",
      GOD_CODE_PROVIDER_MAX_RETRIES: "2",
      GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS: "10",
      GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS: "40",
      GOD_CODE_PROVIDER_PARALLEL_TOOL_CALLS: "true"
    });
    const details = report.checks[0]?.details as Record<string, unknown>;
    const retry = details.retry as Record<string, unknown>;
    const toolUse = details.tool_use as Record<string, unknown>;
    const text = renderProviderConfigReport(report);
    const json = renderProviderConfigReportJson(report);

    expect(report.ok).toBe(true);
    expect(report.checks[0]?.status).toBe("ok");
    expect(details.provider).toBe("openai");
    expect(details.model).toBe("gpt-test");
    expect(details.api_key_env).toBe("OPENAI_API_KEY");
    expect(details.api_key_present).toBe(true);
    expect(details.effective_base_url).toBe("https://api.openai.com/v1");
    expect(details.timeout_s).toBe(12);
    expect(details.known_family).toBe(true);
    expect(retry.max_retries).toBe(2);
    expect(retry.base_delay_ms).toBe(10);
    expect(retry.max_delay_ms).toBe(40);
    expect(toolUse.parallel_tool_calls).toBe(true);
    expect(text).toContain("OK provider_config:");
    expect(text).toContain("retry: max_retries=2");
    expect(text).toContain("tool_use: parallel_tool_calls=true");
    expect(json).not.toContain("secret-value");
  });

  it("reports provider fallback metadata without leaking secrets", () => {
    const report = inspectProviderConfig({
      GOD_CODE_PROVIDER: "openai",
      GOD_CODE_MODEL: "gpt-test",
      GOD_CODE_API_KEY_ENV: "OPENAI_API_KEY",
      OPENAI_API_KEY: "primary-secret",
      GOD_CODE_PROVIDER_FALLBACKS: JSON.stringify([
        {
          provider: "openai-compatible",
          model: "fallback-model",
          api_key_env: "FALLBACK_API_KEY",
          base_url: "https://fallback.example.test/v1",
          timeout_s: 20,
          max_retries: 1,
          retry_base_delay_ms: 10,
          retry_max_delay_ms: 40
        }
      ]),
      FALLBACK_API_KEY: "fallback-secret"
    });
    const details = report.checks[0]?.details as Record<string, unknown>;
    const fallbacks = details.fallbacks as Record<string, unknown>[];
    const fallback = fallbacks[0] as Record<string, unknown>;
    const retry = fallback.retry as Record<string, unknown>;
    const text = renderProviderConfigReport(report);
    const json = renderProviderConfigReportJson(report);

    expect(report.ok).toBe(true);
    expect(fallbacks).toHaveLength(1);
    expect(fallback.provider).toBe("openai-compatible");
    expect(fallback.model).toBe("fallback-model");
    expect(fallback.api_key_env).toBe("FALLBACK_API_KEY");
    expect(fallback.api_key_present).toBe(true);
    expect(fallback.configured_base_url).toBe("https://fallback.example.test/v1");
    expect(fallback.effective_base_url).toBe("https://fallback.example.test/v1");
    expect(fallback.timeout_s).toBe(20);
    expect(fallback.known_family).toBe(true);
    expect(retry).toEqual({ max_retries: 1, base_delay_ms: 10, max_delay_ms: 40 });
    expect(text).toContain("fallback[0]: provider=openai-compatible");
    expect(json).not.toContain("primary-secret");
    expect(json).not.toContain("fallback-secret");
  });

  it("reports provider usage budget metadata", () => {
    const report = inspectProviderConfig({
      GOD_CODE_PROVIDER: "openai",
      GOD_CODE_MODEL: "gpt-test",
      GOD_CODE_API_KEY_ENV: "OPENAI_API_KEY",
      OPENAI_API_KEY: "secret-value",
      GOD_CODE_PROVIDER_MAX_INPUT_TOKENS: "100",
      GOD_CODE_PROVIDER_MAX_OUTPUT_TOKENS: "20",
      GOD_CODE_PROVIDER_MAX_TOTAL_TOKENS: "120",
      GOD_CODE_PROVIDER_REQUIRE_USAGE: "true"
    });
    const details = report.checks[0]?.details as Record<string, unknown>;
    const budget = details.budget as Record<string, unknown>;
    const text = renderProviderConfigReport(report);
    const json = renderProviderConfigReportJson(report);

    expect(report.ok).toBe(true);
    expect(budget).toEqual({
      max_input_tokens: 100,
      max_output_tokens: 20,
      max_total_tokens: 120,
      require_usage: true
    });
    expect(text).toContain("budget: max_input_tokens=100");
    expect(json).not.toContain("secret-value");
  });

  it("reports provider rate limit metadata", () => {
    const report = inspectProviderConfig({
      GOD_CODE_PROVIDER: "openai",
      GOD_CODE_MODEL: "gpt-test",
      GOD_CODE_API_KEY_ENV: "OPENAI_API_KEY",
      OPENAI_API_KEY: "secret-value",
      GOD_CODE_PROVIDER_RATE_LIMIT_ENABLED: "true",
      GOD_CODE_PROVIDER_RATE_LIMIT_STRATEGY: "wait",
      GOD_CODE_PROVIDER_RATE_LIMIT_REQUESTS_PER_MINUTE: "30",
      GOD_CODE_PROVIDER_RATE_LIMIT_MIN_INTERVAL_MS: "1000",
      GOD_CODE_PROVIDER_RATE_LIMIT_MAX_WAIT_MS: "2500",
      GOD_CODE_PROVIDER_RATE_LIMIT_SCOPE: "process"
    });
    const details = report.checks[0]?.details as Record<string, unknown>;
    const rateLimit = details.rate_limit as Record<string, unknown>;
    const text = renderProviderConfigReport(report);
    const json = renderProviderConfigReportJson(report);

    expect(report.ok).toBe(true);
    expect(rateLimit).toEqual({
      enabled: true,
      strategy: "wait",
      requests_per_minute: 30,
      min_interval_ms: 1000,
      max_wait_ms: 2500,
      scope: "process"
    });
    expect(text).toContain("rate_limit: enabled=true strategy=wait");
    expect(text).toContain("requests_per_minute=30");
    expect(json).not.toContain("secret-value");
  });

  it("reports invalid provider rate limit metadata as errors", () => {
    const report = inspectProviderConfig({
      GOD_CODE_PROVIDER: "openai",
      GOD_CODE_MODEL: "gpt-test",
      GOD_CODE_API_KEY_ENV: "OPENAI_API_KEY",
      OPENAI_API_KEY: "secret-value",
      GOD_CODE_PROVIDER_RATE_LIMIT_ENABLED: "maybe",
      GOD_CODE_PROVIDER_RATE_LIMIT_STRATEGY: "adaptive",
      GOD_CODE_PROVIDER_RATE_LIMIT_REQUESTS_PER_MINUTE: "0",
      GOD_CODE_PROVIDER_RATE_LIMIT_MIN_INTERVAL_MS: "-1",
      GOD_CODE_PROVIDER_RATE_LIMIT_SCOPE: "global"
    });

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.message).toContain("GOD_CODE_PROVIDER_RATE_LIMIT_ENABLED");
    expect(report.checks[0]?.message).toContain("GOD_CODE_PROVIDER_RATE_LIMIT_STRATEGY");
    expect(report.checks[0]?.message).toContain("GOD_CODE_PROVIDER_RATE_LIMIT_REQUESTS_PER_MINUTE");
    expect(report.checks[0]?.message).toContain("GOD_CODE_PROVIDER_RATE_LIMIT_MIN_INTERVAL_MS");
    expect(report.checks[0]?.message).toContain("GOD_CODE_PROVIDER_RATE_LIMIT_SCOPE");
    expect(renderProviderConfigReportJson(report)).not.toContain("secret-value");
  });

  it("reports invalid provider usage budget metadata as errors", () => {
    const report = inspectProviderConfig({
      GOD_CODE_PROVIDER: "openai",
      GOD_CODE_MODEL: "gpt-test",
      GOD_CODE_API_KEY_ENV: "OPENAI_API_KEY",
      OPENAI_API_KEY: "secret-value",
      GOD_CODE_PROVIDER_MAX_TOTAL_TOKENS: "0",
      GOD_CODE_PROVIDER_REQUIRE_USAGE: "maybe"
    });

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.message).toContain("GOD_CODE_PROVIDER_MAX_TOTAL_TOKENS");
    expect(report.checks[0]?.message).toContain("GOD_CODE_PROVIDER_REQUIRE_USAGE");
    expect(renderProviderConfigReportJson(report)).not.toContain("secret-value");
  });

  it("reports invalid provider tool-use metadata as errors", () => {
    const report = inspectProviderConfig({
      GOD_CODE_PROVIDER: "openai",
      GOD_CODE_MODEL: "gpt-test",
      GOD_CODE_API_KEY_ENV: "OPENAI_API_KEY",
      OPENAI_API_KEY: "secret-value",
      GOD_CODE_PROVIDER_PARALLEL_TOOL_CALLS: "maybe"
    });

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.message).toContain("GOD_CODE_PROVIDER_PARALLEL_TOOL_CALLS");
    expect(renderProviderConfigReportJson(report)).not.toContain("secret-value");
  });

  it("reports Anthropic provider config as a known provider family", () => {
    const report = inspectProviderConfig({
      GOD_CODE_PROVIDER: "anthropic",
      GOD_CODE_MODEL: "claude-test",
      GOD_CODE_API_KEY_ENV: "ANTHROPIC_API_KEY",
      ANTHROPIC_API_KEY: "anthropic-secret"
    });
    const details = report.checks[0]?.details as Record<string, unknown>;
    const json = renderProviderConfigReportJson(report);

    expect(report.ok).toBe(true);
    expect(report.checks[0]?.status).toBe("ok");
    expect(details.provider).toBe("anthropic");
    expect(details.model).toBe("claude-test");
    expect(details.api_key_env).toBe("ANTHROPIC_API_KEY");
    expect(details.api_key_present).toBe(true);
    expect(details.effective_base_url).toBe("https://api.anthropic.com");
    expect(details.known_family).toBe(true);
    expect(json).not.toContain("anthropic-secret");
  });

  it("reports local OpenAI-compatible provider config without requiring an API key", () => {
    const report = inspectProviderConfig({
      GOD_CODE_PROVIDER: "local-openai-compatible",
      GOD_CODE_MODEL: "local-model"
    });
    const details = report.checks[0]?.details as Record<string, unknown>;
    const text = renderProviderConfigReport(report);

    expect(report.ok).toBe(true);
    expect(report.checks[0]?.status).toBe("ok");
    expect(details.provider).toBe("local-openai-compatible");
    expect(details.model).toBe("local-model");
    expect(details.api_key_env).toBeUndefined();
    expect(details.api_key_present).toBe(false);
    expect(details.api_key_required).toBe(false);
    expect(details.effective_base_url).toBe("http://127.0.0.1:11434/v1");
    expect(details.known_family).toBe(true);
    expect(text).toContain("api_key_required: false");
  });

  it("reports local OpenAI-compatible optional API key without leaking it", () => {
    const report = inspectProviderConfig({
      GOD_CODE_PROVIDER: "local-openai-compatible",
      GOD_CODE_MODEL: "local-model",
      GOD_CODE_BASE_URL: "http://localhost:8000/v1",
      GOD_CODE_API_KEY_ENV: "LOCAL_API_KEY",
      LOCAL_API_KEY: "local-secret"
    });
    const details = report.checks[0]?.details as Record<string, unknown>;
    const json = renderProviderConfigReportJson(report);

    expect(report.ok).toBe(true);
    expect(details.api_key_env).toBe("LOCAL_API_KEY");
    expect(details.api_key_present).toBe(true);
    expect(details.api_key_required).toBe(false);
    expect(details.effective_base_url).toBe("http://localhost:8000/v1");
    expect(json).not.toContain("local-secret");
  });

  it("reports local OpenAI-compatible fallback metadata without requiring an API key", () => {
    const report = inspectProviderConfig({
      GOD_CODE_PROVIDER: "openai",
      GOD_CODE_MODEL: "gpt-test",
      GOD_CODE_API_KEY_ENV: "OPENAI_API_KEY",
      OPENAI_API_KEY: "primary-secret",
      GOD_CODE_PROVIDER_FALLBACKS: JSON.stringify([
        {
          provider: "local-openai-compatible",
          model: "local-fallback"
        }
      ])
    });
    const details = report.checks[0]?.details as Record<string, unknown>;
    const fallbacks = details.fallbacks as Record<string, unknown>[];
    const fallback = fallbacks[0] as Record<string, unknown>;
    const json = renderProviderConfigReportJson(report);

    expect(report.ok).toBe(true);
    expect(fallback.provider).toBe("local-openai-compatible");
    expect(fallback.api_key_env).toBeUndefined();
    expect(fallback.api_key_present).toBe(false);
    expect(fallback.api_key_required).toBe(false);
    expect(fallback.effective_base_url).toBe("http://127.0.0.1:11434/v1");
    expect(json).not.toContain("primary-secret");
  });

  it("reports missing provider model and API key env as errors", () => {
    const report = inspectProviderConfig({
      GOD_CODE_PROVIDER: "openai",
      GOD_CODE_API_KEY_ENV: "OPENAI_API_KEY"
    });

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.status).toBe("error");
    expect(report.checks[0]?.message).toContain("missing GOD_CODE_MODEL");
    expect(report.checks[0]?.message).toContain("OPENAI_API_KEY");
  });

  it("warns for unknown provider families with complete config", () => {
    const report = inspectProviderConfig({
      GOD_CODE_PROVIDER: "demo",
      GOD_CODE_MODEL: "demo-model",
      GOD_CODE_API_KEY_ENV: "DEMO_API_KEY",
      DEMO_API_KEY: "secret-value"
    });
    const details = report.checks[0]?.details as Record<string, unknown>;

    expect(report.ok).toBe(true);
    expect(report.checks[0]?.status).toBe("warn");
    expect(details.known_family).toBe(false);
    expect(renderProviderConfigReportJson(report)).not.toContain("secret-value");
  });

  it("reports invalid provider timeout as an error", () => {
    const report = inspectProviderConfig({
      GOD_CODE_PROVIDER: "openai-compatible",
      GOD_CODE_MODEL: "local-model",
      GOD_CODE_API_KEY_ENV: "LOCAL_API_KEY",
      LOCAL_API_KEY: "secret-value",
      GOD_CODE_BASE_URL: "http://localhost:11434/v1",
      GOD_CODE_PROVIDER_TIMEOUT_S: "0"
    });
    const details = report.checks[0]?.details as Record<string, unknown>;

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.status).toBe("error");
    expect(report.checks[0]?.message).toContain("GOD_CODE_PROVIDER_TIMEOUT_S");
    expect(details.configured_base_url).toBe("http://localhost:11434/v1");
    expect(details.effective_base_url).toBe("http://localhost:11434/v1");
  });

  it("reports invalid provider retry policy as an error", () => {
    const report = inspectProviderConfig({
      GOD_CODE_PROVIDER: "openai-compatible",
      GOD_CODE_MODEL: "local-model",
      GOD_CODE_API_KEY_ENV: "LOCAL_API_KEY",
      LOCAL_API_KEY: "secret-value",
      GOD_CODE_PROVIDER_MAX_RETRIES: "-1",
      GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS: "100",
      GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS: "50"
    });
    const details = report.checks[0]?.details as Record<string, unknown>;
    const retry = details.retry as Record<string, unknown>;

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.status).toBe("error");
    expect(report.checks[0]?.message).toContain("GOD_CODE_PROVIDER_MAX_RETRIES");
    expect(report.checks[0]?.message).toContain("GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS");
    expect(retry.base_delay_ms).toBe(100);
    expect(retry.max_delay_ms).toBe(50);
    expect(renderProviderConfigReportJson(report)).not.toContain("secret-value");
  });

  it("reports invalid provider fallback config as an error", () => {
    const invalidJsonReport = inspectProviderConfig({
      GOD_CODE_PROVIDER: "openai",
      GOD_CODE_MODEL: "gpt-test",
      GOD_CODE_API_KEY_ENV: "OPENAI_API_KEY",
      OPENAI_API_KEY: "primary-secret",
      GOD_CODE_PROVIDER_FALLBACKS: "not-json"
    });
    expect(invalidJsonReport.ok).toBe(false);
    expect(invalidJsonReport.checks[0]?.message).toContain("GOD_CODE_PROVIDER_FALLBACKS");
    expect(renderProviderConfigReportJson(invalidJsonReport)).not.toContain("primary-secret");

    const invalidEntryReport = inspectProviderConfig({
      GOD_CODE_PROVIDER: "openai",
      GOD_CODE_MODEL: "gpt-test",
      GOD_CODE_API_KEY_ENV: "OPENAI_API_KEY",
      OPENAI_API_KEY: "primary-secret",
      GOD_CODE_PROVIDER_FALLBACKS: JSON.stringify([
        {
          provider: "openai",
          model: "gpt-test",
          api_key_env: "MISSING_FALLBACK_API_KEY",
          retry_base_delay_ms: 100,
          retry_max_delay_ms: 50
        }
      ])
    });
    const details = invalidEntryReport.checks[0]?.details as Record<string, unknown>;
    const fallbacks = details.fallbacks as Record<string, unknown>[];

    expect(invalidEntryReport.ok).toBe(false);
    expect(invalidEntryReport.checks[0]?.message).toContain("MISSING_FALLBACK_API_KEY");
    expect(invalidEntryReport.checks[0]?.message).toContain("duplicates");
    expect(invalidEntryReport.checks[0]?.message).toContain("retry_max_delay_ms");
    expect(fallbacks[0]?.api_key_present).toBe(false);
    expect(renderProviderConfigReportJson(invalidEntryReport)).not.toContain("primary-secret");
  });
});

describe("provider local-models CLI helper", () => {
  it("requires local-openai-compatible without contacting HTTP", async () => {
    let called = false;
    const report = await listLocalProviderModels({
      environ: {
        GOD_CODE_PROVIDER: "openai",
        GOD_CODE_MODEL: "gpt-test",
        GOD_CODE_API_KEY_ENV: "OPENAI_API_KEY",
        OPENAI_API_KEY: "secret-value"
      },
      fetchImpl: async () => {
        called = true;
        return new Response("{}");
      }
    });

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.name).toBe("local_provider_models");
    expect(report.checks[0]?.message).toContain("local-openai-compatible");
    expect(called).toBe(false);
    expect(renderLocalProviderModelsReportJson(report)).not.toContain("secret-value");
  });

  it("derives /models, omits Authorization without a local API key, and renders sanitized models", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const report = await listLocalProviderModels({
      environ: {
        GOD_CODE_PROVIDER: "local-openai-compatible",
        GOD_CODE_MODEL: "llama3.1",
        GOD_CODE_BASE_URL: "http://127.0.0.1:11434/v1/",
        GOD_CODE_LOCAL_PROVIDER_MODELS_MAX_RESULTS: "2"
      },
      fetchImpl: async (url, init) => {
        requests.push({ url, init });
        return new Response(
          JSON.stringify({
            object: "list",
            data: [
              { id: "llama3.1", object: "model", owned_by: "local" },
              { id: "qwen2.5-coder", object: "model", owned_by: "local" },
              { id: "llama3.1", object: "model", owned_by: "duplicate" },
              { id: "deepseek-coder", object: "model", owned_by: "local" }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    });
    const details = report.checks[0]?.details as Record<string, unknown>;
    const models = details.models as Record<string, unknown>[];
    const headers = requests[0]?.init.headers as Record<string, string>;
    const text = renderLocalProviderModelsReport(report);

    expect(report.ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("http://127.0.0.1:11434/v1/models");
    expect(headers.Authorization).toBeUndefined();
    expect(details.configured_model_present).toBe(true);
    expect(details.model_count).toBe(2);
    expect(details.truncated).toBe(true);
    expect(models.map((model) => model.id)).toEqual(["llama3.1", "qwen2.5-coder"]);
    expect(text).toContain("GOD-code local provider models:");
    expect(text).toContain("- llama3.1 owned_by=local");
  });

  it("uses optional local bearer token without leaking it", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const report = await listLocalProviderModels({
      environ: {
        GOD_CODE_PROVIDER: "local-openai-compatible",
        GOD_CODE_MODEL: "secure-local",
        GOD_CODE_BASE_URL: "http://localhost:8000/v1",
        GOD_CODE_API_KEY_ENV: "LOCAL_API_KEY",
        LOCAL_API_KEY: "local-secret"
      },
      fetchImpl: async (url, init) => {
        requests.push({ url, init });
        return new Response(
          JSON.stringify({
            data: [{ id: "secure-local", object: "model" }]
          }),
          { status: 200 }
        );
      }
    });
    const headers = requests[0]?.init.headers as Record<string, string>;
    const details = report.checks[0]?.details as Record<string, unknown>;
    const json = renderLocalProviderModelsReportJson(report);

    expect(report.ok).toBe(true);
    expect(headers.Authorization).toBe("Bearer local-secret");
    expect(details.api_key_env).toBe("LOCAL_API_KEY");
    expect(details.api_key_present).toBe(true);
    expect(json).not.toContain("local-secret");
    expect(json).not.toContain("Authorization");
  });

  it("reports require-configured-model failures without mutating config", async () => {
    const report = await listLocalProviderModels({
      requireConfiguredModel: true,
      environ: {
        GOD_CODE_PROVIDER: "local-openai-compatible",
        GOD_CODE_MODEL: "missing-model"
      },
      fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: "other-model" }] }), { status: 200 })
    });
    const details = report.checks[0]?.details as Record<string, unknown>;

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.message).toContain("configured model was not found");
    expect(details.configured_model).toBe("missing-model");
    expect(details.configured_model_present).toBe(false);
  });

  it("validates local models URL, max results, and response shape", async () => {
    const invalidConfig = await listLocalProviderModels({
      environ: {
        GOD_CODE_PROVIDER: "local-openai-compatible",
        GOD_CODE_LOCAL_PROVIDER_MODELS_URL: "https://example.invalid/v1/models",
        GOD_CODE_LOCAL_PROVIDER_MODELS_MAX_RESULTS: "1001"
      },
      fetchImpl: async () => new Response("{}")
    });

    expect(invalidConfig.ok).toBe(false);
    expect(invalidConfig.checks[0]?.message).toContain("loopback");
    expect(invalidConfig.checks[0]?.message).toContain("GOD_CODE_LOCAL_PROVIDER_MODELS_MAX_RESULTS");

    const invalidResponse = await listLocalProviderModels({
      environ: {
        GOD_CODE_PROVIDER: "local-openai-compatible"
      },
      fetchImpl: async () => new Response(JSON.stringify({ data: [{ name: "missing-id" }] }), { status: 200 })
    });

    expect(invalidResponse.ok).toBe(false);
    expect(invalidResponse.checks[0]?.message).toContain("non-empty string id");
  });
});

describe("provider local-models pull CLI helper", () => {
  it("requires local-openai-compatible provider", async () => {
    const report = await pullLocalProviderModel("demo-model", {
      environ: {
        GOD_CODE_PROVIDER: "openai",
        GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENABLED: "true",
        GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_COMMAND: process.execPath,
        GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ARGS_TEMPLATE: JSON.stringify(["-e", "console.log('{model}')"])
      }
    });

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.name).toBe("local_provider_model_pull");
    expect(report.checks[0]?.message).toContain("local-openai-compatible");
  });

  it("reports disabled pull config for local providers", async () => {
    await withTempDir(async (cwd) => {
      const report = await pullLocalProviderModel("local-model", {
        cwd,
        environ: {
          GOD_CODE_PROVIDER: "local-openai-compatible"
        }
      });
      const details = report.checks[0]?.details as Record<string, unknown>;

      expect(report.ok).toBe(false);
      expect(report.checks[0]?.message).toContain("disabled");
      expect(details.enabled).toBe(false);
      expect(details.model).toBe("local-model");
    });
  });

  it("validates template and model name without leaking raw template values", async () => {
    const report = await pullLocalProviderModel("bad\u0000model", {
      environ: {
        GOD_CODE_PROVIDER: "local-openai-compatible",
        GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENABLED: "true",
        GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_COMMAND: process.execPath,
        GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ARGS_TEMPLATE: JSON.stringify(["secret-template-without-placeholder"])
      }
    });
    const json = renderLocalProviderModelPullReportJson(report);

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.message).toContain("{model}");
    expect(report.checks[0]?.message).toContain("control characters");
    expect(json).not.toContain("secret-template");
  });

  it("dry-run reports sanitized command shape and does not create logs", async () => {
    await withTempDir(async (cwd) => {
      const report = await pullLocalProviderModel("local-model", {
        cwd,
        environ: {
          GOD_CODE_PROVIDER: "local-openai-compatible",
          GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENABLED: "true",
          GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_COMMAND: process.execPath,
          GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ARGS_TEMPLATE: JSON.stringify([
            "-e",
            "console.log('secret-pull-arg')",
            "{model}"
          ])
        },
        dryRun: true,
        yes: false
      });
      const details = report.checks[0]?.details as Record<string, unknown>;
      const text = renderLocalProviderModelPullReport(report);
      const json = renderLocalProviderModelPullReportJson(report);

      expect(report.ok).toBe(true);
      expect(report.checks[0]?.message).toContain("dry-run");
      expect(details.command_configured).toBe(true);
      expect(details.command_basename).toBe(path.basename(process.execPath));
      expect(details.args_count).toBe(3);
      expect(text).toContain("GOD-code local provider model pull:");
      expect(json).not.toContain("secret-pull-arg");
      await expect(fsp.stat(path.join(cwd, ".god-code/local-provider-model-pull.log"))).rejects.toThrow();
    });
  });

  it("executes a deterministic fixture command and writes logs only to the log file", async () => {
    await withTempDir(async (cwd) => {
      const report = await pullLocalProviderModel("fixture-model", {
        cwd,
        environ: {
          GOD_CODE_PROVIDER: "local-openai-compatible",
          GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENABLED: "true",
          GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_COMMAND: process.execPath,
          GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ARGS_TEMPLATE: JSON.stringify([
            "-e",
            "process.stdout.write(process.argv[1])",
            "{model}"
          ])
        },
        dryRun: false,
        yes: true
      });
      const details = report.checks[0]?.details as Record<string, unknown>;
      const logPath = path.join(cwd, ".god-code/local-provider-model-pull.log");
      const log = await fsp.readFile(logPath, "utf8");

      expect(report.ok).toBe(true);
      expect(report.checks[0]?.message).toContain("completed");
      expect(details.exit_code).toBe(0);
      expect(details.log_file).toBe(".god-code/local-provider-model-pull.log");
      expect(log).toBe("fixture-model");
      expect(renderLocalProviderModelPullReportJson(report)).not.toContain("process.stdout.write");
    });
  });

  it("reports non-zero pull exits with log path but without raw logs", async () => {
    await withTempDir(async (cwd) => {
      const report = await pullLocalProviderModel("failed-model", {
        cwd,
        environ: {
          GOD_CODE_PROVIDER: "local-openai-compatible",
          GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENABLED: "true",
          GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_COMMAND: process.execPath,
          GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ARGS_TEMPLATE: JSON.stringify([
            "-e",
            "console.error('secret-log-output'); process.exit(7)",
            "{model}"
          ])
        },
        dryRun: false,
        yes: true
      });
      const details = report.checks[0]?.details as Record<string, unknown>;
      const json = renderLocalProviderModelPullReportJson(report);

      expect(report.ok).toBe(false);
      expect(report.checks[0]?.message).toContain("exit code 7");
      expect(details.exit_code).toBe(7);
      expect(details.log_file).toBe(".god-code/local-provider-model-pull.log");
      expect(json).not.toContain("secret-log-output");
    });
  });
});

describe("provider local-models remove CLI helper", () => {
  it("requires local-openai-compatible provider", async () => {
    const report = await removeLocalProviderModel("demo-model", {
      environ: {
        GOD_CODE_PROVIDER: "openai",
        GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENABLED: "true",
        GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_COMMAND: process.execPath,
        GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ARGS_TEMPLATE: JSON.stringify(["-e", "console.log('{model}')"])
      }
    });

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.name).toBe("local_provider_model_remove");
    expect(report.checks[0]?.message).toContain("local-openai-compatible");
  });

  it("reports disabled remove config for local providers", async () => {
    await withTempDir(async (cwd) => {
      const report = await removeLocalProviderModel("local-model", {
        cwd,
        environ: {
          GOD_CODE_PROVIDER: "local-openai-compatible"
        }
      });
      const details = report.checks[0]?.details as Record<string, unknown>;

      expect(report.ok).toBe(false);
      expect(report.checks[0]?.message).toContain("disabled");
      expect(details.enabled).toBe(false);
      expect(details.model).toBe("local-model");
    });
  });

  it("validates template and model name without leaking raw template values", async () => {
    const report = await removeLocalProviderModel("bad\u0000model", {
      environ: {
        GOD_CODE_PROVIDER: "local-openai-compatible",
        GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENABLED: "true",
        GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_COMMAND: process.execPath,
        GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ARGS_TEMPLATE: JSON.stringify(["secret-template-without-placeholder"])
      }
    });
    const json = renderLocalProviderModelRemoveReportJson(report);

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.message).toContain("{model}");
    expect(report.checks[0]?.message).toContain("control characters");
    expect(json).not.toContain("secret-template");
  });

  it("dry-run reports sanitized command shape and does not create logs", async () => {
    await withTempDir(async (cwd) => {
      const report = await removeLocalProviderModel("local-model", {
        cwd,
        environ: {
          GOD_CODE_PROVIDER: "local-openai-compatible",
          GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENABLED: "true",
          GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_COMMAND: process.execPath,
          GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ARGS_TEMPLATE: JSON.stringify([
            "-e",
            "console.log('secret-remove-arg')",
            "{model}"
          ])
        },
        dryRun: true,
        yes: false
      });
      const details = report.checks[0]?.details as Record<string, unknown>;
      const text = renderLocalProviderModelRemoveReport(report);
      const json = renderLocalProviderModelRemoveReportJson(report);

      expect(report.ok).toBe(true);
      expect(report.checks[0]?.message).toContain("dry-run");
      expect(details.command_configured).toBe(true);
      expect(details.command_basename).toBe(path.basename(process.execPath));
      expect(details.args_count).toBe(3);
      expect(text).toContain("GOD-code local provider model remove:");
      expect(json).not.toContain("secret-remove-arg");
      await expect(fsp.stat(path.join(cwd, ".god-code/local-provider-model-remove.log"))).rejects.toThrow();
    });
  });

  it("executes a deterministic fixture command and writes logs only to the log file", async () => {
    await withTempDir(async (cwd) => {
      const report = await removeLocalProviderModel("fixture-model", {
        cwd,
        environ: {
          GOD_CODE_PROVIDER: "local-openai-compatible",
          GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENABLED: "true",
          GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_COMMAND: process.execPath,
          GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ARGS_TEMPLATE: JSON.stringify([
            "-e",
            "process.stdout.write(process.argv[1])",
            "{model}"
          ])
        },
        dryRun: false,
        yes: true
      });
      const details = report.checks[0]?.details as Record<string, unknown>;
      const logPath = path.join(cwd, ".god-code/local-provider-model-remove.log");
      const log = await fsp.readFile(logPath, "utf8");

      expect(report.ok).toBe(true);
      expect(report.checks[0]?.message).toContain("completed");
      expect(details.exit_code).toBe(0);
      expect(details.log_file).toBe(".god-code/local-provider-model-remove.log");
      expect(log).toBe("fixture-model");
      expect(renderLocalProviderModelRemoveReportJson(report)).not.toContain("process.stdout.write");
    });
  });

  it("reports non-zero remove exits with log path but without raw logs", async () => {
    await withTempDir(async (cwd) => {
      const report = await removeLocalProviderModel("failed-model", {
        cwd,
        environ: {
          GOD_CODE_PROVIDER: "local-openai-compatible",
          GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENABLED: "true",
          GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_COMMAND: process.execPath,
          GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ARGS_TEMPLATE: JSON.stringify([
            "-e",
            "console.error('secret-log-output'); process.exit(7)",
            "{model}"
          ])
        },
        dryRun: false,
        yes: true
      });
      const details = report.checks[0]?.details as Record<string, unknown>;
      const json = renderLocalProviderModelRemoveReportJson(report);

      expect(report.ok).toBe(false);
      expect(report.checks[0]?.message).toContain("exit code 7");
      expect(details.exit_code).toBe(7);
      expect(details.log_file).toBe(".god-code/local-provider-model-remove.log");
      expect(json).not.toContain("secret-log-output");
    });
  });
});

describe("provider local-models prune CLI helper", () => {
  it("requires local-openai-compatible provider", async () => {
    const report = await pruneLocalProviderModels("unused", {
      environ: {
        GOD_CODE_PROVIDER: "openai",
        GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENABLED: "true",
        GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_COMMAND: process.execPath,
        GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE: JSON.stringify(["-e", "console.log('{target}')"]),
        GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS: "unused"
      }
    });

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.name).toBe("local_provider_model_prune");
    expect(report.checks[0]?.message).toContain("local-openai-compatible");
  });

  it("reports disabled prune config for local providers", async () => {
    await withTempDir(async (cwd) => {
      const report = await pruneLocalProviderModels("unused", {
        cwd,
        environ: {
          GOD_CODE_PROVIDER: "local-openai-compatible"
        }
      });
      const details = report.checks[0]?.details as Record<string, unknown>;

      expect(report.ok).toBe(false);
      expect(report.checks[0]?.message).toContain("disabled");
      expect(details.enabled).toBe(false);
      expect(details.target).toBe("unused");
    });
  });

  it("validates template and target without leaking raw template values", async () => {
    const report = await pruneLocalProviderModels("../bad", {
      environ: {
        GOD_CODE_PROVIDER: "local-openai-compatible",
        GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENABLED: "true",
        GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_COMMAND: process.execPath,
        GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE: JSON.stringify(["secret-template-without-placeholder"]),
        GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS: "unused"
      }
    });
    const json = renderLocalProviderModelPruneReportJson(report);

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.message).toContain("{target}");
    expect(report.checks[0]?.message).toContain("path");
    expect(json).not.toContain("secret-template");
  });

  it("dry-run reports sanitized command shape and does not create logs", async () => {
    await withTempDir(async (cwd) => {
      const report = await pruneLocalProviderModels("unused", {
        cwd,
        environ: {
          GOD_CODE_PROVIDER: "local-openai-compatible",
          GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENABLED: "true",
          GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_COMMAND: process.execPath,
          GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE: JSON.stringify([
            "-e",
            "console.log('secret-prune-arg')",
            "{target}"
          ]),
          GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS: "unused,dangling"
        },
        dryRun: true,
        yes: false
      });
      const details = report.checks[0]?.details as Record<string, unknown>;
      const text = renderLocalProviderModelPruneReport(report);
      const json = renderLocalProviderModelPruneReportJson(report);

      expect(report.ok).toBe(true);
      expect(report.checks[0]?.message).toContain("dry-run");
      expect(details.target).toBe("unused");
      expect(details.target_allowed).toBe(true);
      expect(details.allowed_target_count).toBe(2);
      expect(details.command_configured).toBe(true);
      expect(details.command_basename).toBe(path.basename(process.execPath));
      expect(details.args_count).toBe(3);
      expect(text).toContain("GOD-code local provider model prune:");
      expect(json).not.toContain("secret-prune-arg");
      await expect(fsp.stat(path.join(cwd, ".god-code/local-provider-model-prune.log"))).rejects.toThrow();
    });
  });

  it("requires an allowlisted target for confirmed prune execution", async () => {
    await withTempDir(async (cwd) => {
      const report = await pruneLocalProviderModels("unused", {
        cwd,
        environ: {
          GOD_CODE_PROVIDER: "local-openai-compatible",
          GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENABLED: "true",
          GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_COMMAND: process.execPath,
          GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE: JSON.stringify(["-e", "process.exit(0)", "{target}"]),
          GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS: "dangling"
        },
        dryRun: false,
        yes: true
      });
      const details = report.checks[0]?.details as Record<string, unknown>;

      expect(report.ok).toBe(false);
      expect(report.checks[0]?.message).toContain("not allowed");
      expect(details.target_allowed).toBe(false);
      await expect(fsp.stat(path.join(cwd, ".god-code/local-provider-model-prune.log"))).rejects.toThrow();
    });
  });

  it("executes a deterministic fixture command and writes logs only to the log file", async () => {
    await withTempDir(async (cwd) => {
      const report = await pruneLocalProviderModels("unused", {
        cwd,
        environ: {
          GOD_CODE_PROVIDER: "local-openai-compatible",
          GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENABLED: "true",
          GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_COMMAND: process.execPath,
          GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE: JSON.stringify([
            "-e",
            "process.stdout.write(process.argv[1])",
            "{target}"
          ]),
          GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS: "unused"
        },
        dryRun: false,
        yes: true
      });
      const details = report.checks[0]?.details as Record<string, unknown>;
      const logPath = path.join(cwd, ".god-code/local-provider-model-prune.log");
      const log = await fsp.readFile(logPath, "utf8");

      expect(report.ok).toBe(true);
      expect(report.checks[0]?.message).toContain("completed");
      expect(details.exit_code).toBe(0);
      expect(details.log_file).toBe(".god-code/local-provider-model-prune.log");
      expect(log).toBe("unused");
      expect(renderLocalProviderModelPruneReportJson(report)).not.toContain("process.stdout.write");
    });
  });

  it("reports non-zero prune exits with log path but without raw logs", async () => {
    await withTempDir(async (cwd) => {
      const report = await pruneLocalProviderModels("unused", {
        cwd,
        environ: {
          GOD_CODE_PROVIDER: "local-openai-compatible",
          GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENABLED: "true",
          GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_COMMAND: process.execPath,
          GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE: JSON.stringify([
            "-e",
            "console.error('secret-log-output'); process.exit(7)",
            "{target}"
          ]),
          GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS: "unused"
        },
        dryRun: false,
        yes: true
      });
      const details = report.checks[0]?.details as Record<string, unknown>;
      const json = renderLocalProviderModelPruneReportJson(report);

      expect(report.ok).toBe(false);
      expect(report.checks[0]?.message).toContain("exit code 7");
      expect(details.exit_code).toBe(7);
      expect(details.log_file).toBe(".god-code/local-provider-model-prune.log");
      expect(json).not.toContain("secret-log-output");
    });
  });
});

describe("provider local-daemon CLI helper", () => {
  it("reports disabled local daemon lifecycle by default", async () => {
    await withTempDir(async (cwd) => {
      const report = await inspectLocalProviderDaemon({ cwd, environ: {} });
      const details = report.checks[0]?.details as Record<string, unknown>;
      const text = renderLocalProviderDaemonReport(report);

      expect(report.ok).toBe(true);
      expect(report.checks[0]?.status).toBe("ok");
      expect(report.checks[0]?.message).toContain("disabled");
      expect(details.enabled).toBe(false);
      expect(details.provider).toBe("fake");
      expect(details.marker_present).toBe(false);
      expect(text).toContain("OK local_provider_daemon:");
    });
  });

  it("requires local-openai-compatible when enabled", async () => {
    await withTempDir(async (cwd) => {
      const report = await inspectLocalProviderDaemon({
        cwd,
        environ: {
          GOD_CODE_PROVIDER: "openai",
          GOD_CODE_LOCAL_PROVIDER_DAEMON_ENABLED: "true",
          GOD_CODE_LOCAL_PROVIDER_DAEMON_COMMAND: process.execPath
        }
      });

      expect(report.ok).toBe(false);
      expect(report.checks[0]?.message).toContain("local-openai-compatible");
    });
  });

  it("validates args and loopback ready URL without leaking secret args", async () => {
    await withTempDir(async (cwd) => {
      const report = await inspectLocalProviderDaemon({
        cwd,
        environ: {
          GOD_CODE_PROVIDER: "local-openai-compatible",
          GOD_CODE_MODEL: "local-model",
          GOD_CODE_LOCAL_PROVIDER_DAEMON_ENABLED: "true",
          GOD_CODE_LOCAL_PROVIDER_DAEMON_COMMAND: process.execPath,
          GOD_CODE_LOCAL_PROVIDER_DAEMON_ARGS: "not-json-secret-arg",
          GOD_CODE_LOCAL_PROVIDER_DAEMON_READY_URL: "https://example.invalid/v1/models"
        }
      });
      const json = renderLocalProviderDaemonReportJson(report);

      expect(report.ok).toBe(false);
      expect(report.checks[0]?.message).toContain("GOD_CODE_LOCAL_PROVIDER_DAEMON_ARGS");
      expect(report.checks[0]?.message).toContain("GOD_CODE_LOCAL_PROVIDER_DAEMON_READY_URL");
      expect(json).not.toContain("not-json-secret-arg");
    });
  });

  it("start dry-run reports sanitized command shape without spawning", async () => {
    await withTempDir(async (cwd) => {
      const report = await startLocalProviderDaemon({
        cwd,
        environ: {
          GOD_CODE_PROVIDER: "local-openai-compatible",
          GOD_CODE_MODEL: "local-model",
          GOD_CODE_LOCAL_PROVIDER_DAEMON_ENABLED: "true",
          GOD_CODE_LOCAL_PROVIDER_DAEMON_COMMAND: process.execPath,
          GOD_CODE_LOCAL_PROVIDER_DAEMON_ARGS: JSON.stringify(["-e", "console.log('secret-start-arg')"])
        },
        dryRun: true,
        yes: false
      });
      const details = report.checks[0]?.details as Record<string, unknown>;
      const json = renderLocalProviderDaemonReportJson(report);

      expect(report.ok).toBe(true);
      expect(report.checks[0]?.message).toContain("dry-run");
      expect(details.command_configured).toBe(true);
      expect(details.args_count).toBe(2);
      expect(details.marker_present).toBe(false);
      expect(json).not.toContain("secret-start-arg");
      await expect(fsp.stat(path.join(cwd, ".god-code/local-provider-daemon.json"))).rejects.toThrow();
    });
  });

  it("start --yes writes a marker and stop --yes removes it", async () => {
    await withTempDir(async (cwd) => {
      const env = {
        GOD_CODE_PROVIDER: "local-openai-compatible",
        GOD_CODE_MODEL: "local-model",
        GOD_CODE_LOCAL_PROVIDER_DAEMON_ENABLED: "true",
        GOD_CODE_LOCAL_PROVIDER_DAEMON_COMMAND: process.execPath,
        GOD_CODE_LOCAL_PROVIDER_DAEMON_ARGS: JSON.stringify(["-e", "setTimeout(() => {}, 30000)"])
      };
      const markerPath = path.join(cwd, ".god-code/local-provider-daemon.json");

      const startReport = await startLocalProviderDaemon({
        cwd,
        environ: env,
        dryRun: false,
        yes: true
      });
      const startDetails = startReport.checks[0]?.details as Record<string, unknown>;

      expect(startReport.ok).toBe(true);
      expect(startDetails.marker_pid).toEqual(expect.any(Number));
      await expect(fsp.stat(markerPath)).resolves.toBeTruthy();

      const stopReport = await stopLocalProviderDaemon({
        cwd,
        environ: env,
        dryRun: false,
        yes: true
      });

      expect(stopReport.ok).toBe(true);
      await expect(fsp.stat(markerPath)).rejects.toThrow();
    });
  });

  it("stop dry-run is safe when marker is missing", async () => {
    await withTempDir(async (cwd) => {
      const report = await stopLocalProviderDaemon({
        cwd,
        environ: {
          GOD_CODE_PROVIDER: "local-openai-compatible",
          GOD_CODE_MODEL: "local-model",
          GOD_CODE_LOCAL_PROVIDER_DAEMON_ENABLED: "true",
          GOD_CODE_LOCAL_PROVIDER_DAEMON_COMMAND: process.execPath
        },
        dryRun: true,
        yes: false
      });

      expect(report.ok).toBe(true);
      expect(report.checks[0]?.message).toContain("no GOD-code local provider daemon marker");
    });
  });
});

describe("provider contract-test CLI helper", () => {
  let contractReport: ProviderContractReport;

  beforeAll(async () => {
    contractReport = await runProviderContractTests();
  }, 45_000);

  it("runs the offline provider contract matrix", () => {
    const names = contractReport.checks.map((check) => check.name);
    const encoded = JSON.stringify(contractReport);

    expect(contractReport.ok).toBe(true);
    expect(names).toContain("openai_compatible_request_body");
    expect(names).toContain("local_openai_compatible_request_body");
    expect(names).toContain("openai_compatible_usage_payload");
    expect(names).toContain("openai_compatible_system_prompt_request");
    expect(names).toContain("openai_compatible_stream");
    expect(names).toContain("openai_responses_context");
    expect(names).toContain("openai_responses_usage_payload");
    expect(names).toContain("openai_responses_system_prompt_request");
    expect(names).toContain("openai_responses_stream");
    expect(names).toContain("anthropic_messages_request_body");
    expect(names).toContain("anthropic_messages_usage_payload");
    expect(names).toContain("anthropic_messages_system_prompt_request");
    expect(names).toContain("anthropic_messages_stream");
    expect(names).toContain("system_prompt_builder_default");
    expect(names).toContain("token_budget_manager_default");
    expect(names).toContain("prompt_builder_token_budget_metadata");
    expect(names).toContain("prompt_builder_token_budget_limit");
    expect(names).toContain("summary_compaction_strategy_default");
    expect(names).toContain("prompt_builder_summary_compaction_budget");
    expect(names).toContain("prompt_injection_guard_default");
    expect(names).toContain("prompt_builder_prompt_injection_report");
    expect(names).toContain("prompt_builder_prompt_injection_fail");
    expect(names).toContain("provider_usage_budget_guard");
    expect(names).toContain("provider_error_mapping_openai");
    expect(names).toContain("provider_error_mapping_anthropic");
    expect(names).toContain("provider_error_mapping_retry_metadata");
    expect(names).toContain("provider_rate_limit_fail_fast");
    expect(names).toContain("provider_rate_limit_wait_strategy");
    expect(names).toContain("provider_rate_limit_retry_boundary");
    expect(names).toContain("real_provider_adapter_contract");
    expect(encoded).not.toContain("contract-secret");
    expect(encoded).not.toContain("Authorization");
    expect(encoded).not.toContain("x-api-key");
  });

  it("renders text and JSON reports", () => {
    const text = renderProviderContractReport(contractReport);
    const json = JSON.parse(renderProviderContractReportJson(contractReport));

    expect(text).toContain("GOD-code provider contract tests:");
    expect(text).toContain("OK openai_compatible_request_body:");
    expect(text).toContain("OK anthropic_messages_request_body:");
    expect(text).toContain("OK real_provider_adapter_contract:");
    expect(json).toEqual(contractReport);
  });

  it("returns runner errors for invalid JSON output", async () => {
    const report = await runProviderContractTests({
      pythonExecutable: process.execPath,
      runnerArgs: ["-e", "process.stdout.write('not-json')"]
    });

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.name).toBe("provider_contract_runner");
    expect(report.checks[0]?.message).toContain("invalid JSON");
  });

  it("preserves parsed contract failure reports from non-zero runners", async () => {
    const script = [
      "const report = {",
      "ok: false,",
      "checks: [{ name: 'synthetic_contract', status: 'error', message: 'boom' }]",
      "};",
      "process.stdout.write(JSON.stringify(report));",
      "process.exit(1);"
    ].join("");

    const report = await runProviderContractTests({
      pythonExecutable: process.execPath,
      runnerArgs: ["-e", script]
    });

    expect(report).toEqual({
      ok: false,
      checks: [{ name: "synthetic_contract", status: "error", message: "boom" }]
    });
  });
});

async function withTempDir(run: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), "god-code-local-daemon-"));
  try {
    await run(cwd);
  } finally {
    await fsp.rm(cwd, { recursive: true, force: true });
  }
}
