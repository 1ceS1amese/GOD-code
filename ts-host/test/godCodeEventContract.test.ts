import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { asGodCodeEventEnvelope } from "../src/types/godCodeProtocol.js";

interface ContractCase {
  name: string;
  event: unknown;
}

interface EventContractCorpus {
  contract_version: number;
  valid: ContractCase[];
  invalid: ContractCase[];
}

const corpusPath = fileURLToPath(
  new URL("../../protocol/fixtures/god_code_event_contract.json", import.meta.url)
);
const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8")) as EventContractCorpus;

describe("shared GodCode event contract corpus", () => {
  it("uses the supported contract corpus version", () => {
    expect(corpus.contract_version).toBe(2);
  });

  for (const testCase of corpus.valid) {
    it(`accepts ${testCase.name}`, () => {
      expect(asGodCodeEventEnvelope(testCase.event)).toBe(testCase.event);
    });
  }

  for (const testCase of corpus.invalid) {
    it(`rejects ${testCase.name}`, () => {
      expect(() => asGodCodeEventEnvelope(testCase.event)).toThrow("Invalid god_code_event payload");
    });
  }
});
