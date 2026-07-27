import { describe, expect, expectTypeOf, it } from "vitest";
import * as tuiTypesRuntime from "../src/cli/tuiTypes.js";
import type {
  TuiAction as DirectTuiAction,
  TuiEvent as DirectTuiEvent,
  TuiState as DirectTuiState
} from "../src/cli/tuiTypes.js";
import type {
  TuiAction as LegacyTuiAction,
  TuiEvent as LegacyTuiEvent,
  TuiState as LegacyTuiState
} from "../src/cli/tuiState.js";

describe("TUI type model", () => {
  it("has no runtime exports", () => {
    expect(Object.keys(tuiTypesRuntime)).toEqual([]);
  });

  it("preserves the legacy tuiState type surface", () => {
    expectTypeOf<DirectTuiAction>().toEqualTypeOf<LegacyTuiAction>();
    expectTypeOf<DirectTuiEvent>().toEqualTypeOf<LegacyTuiEvent>();
    expectTypeOf<DirectTuiState>().toEqualTypeOf<LegacyTuiState>();
  });
});
