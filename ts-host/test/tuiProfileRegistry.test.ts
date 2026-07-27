import { describe, expect, it } from "vitest";
import {
  createInitialTuiState,
  LIVE_SESSION_COMMAND_CYCLE_REGISTRY,
  LIVE_SESSION_COMMAND_DEEPEST_NESTED_PROFILE_CYCLE_REGISTRY,
  LIVE_SESSION_COMMAND_ENUM_CYCLE_REGISTRY,
  LIVE_SESSION_COMMAND_LATEST_PROFILE_CYCLE_REGISTRY,
  LIVE_SESSION_COMMAND_NEIGHBOR_LEGEND_PROFILE_CYCLE_REGISTRY,
  LIVE_SESSION_COMMAND_PROFILE_CYCLE_REGISTRY,
  reduceTuiState,
  type TuiAction
} from "../src/cli/tuiState.js";
import {
  cycleTuiProfileFromRegistry,
  cycleTuiValueFromRegistry
} from "../src/cli/tuiProfileRegistry.js";

describe("TUI profile cycle registry", () => {
  const registry = {
    cycle_demo: {
      stateKey: "profile",
      values: ["shown", "hidden", "adaptive"],
      fallback: "shown"
    }
  } as const;

  it("returns undefined for unregistered actions", () => {
    expect(cycleTuiProfileFromRegistry(
      { profile: "shown" },
      "missing",
      registry,
      { enabled: true }
    )).toBeUndefined();
  });

  it("keeps the profile helper as an alias of the generic value helper", () => {
    expect(cycleTuiProfileFromRegistry).toBe(cycleTuiValueFromRegistry);
  });

  it("cycles, wraps, applies patches, and falls back from unknown values", () => {
    const hidden = cycleTuiProfileFromRegistry(
      { profile: "shown", helpVisible: true },
      "cycle_demo",
      registry,
      { enabled: true, patch: { helpVisible: false } }
    );
    expect(hidden).toEqual({ profile: "hidden", helpVisible: false });

    const wrapped = cycleTuiProfileFromRegistry(
      { profile: "adaptive" },
      "cycle_demo",
      registry,
      { enabled: true }
    );
    expect(wrapped).toEqual({ profile: "shown" });

    const fallback = cycleTuiProfileFromRegistry(
      { profile: "unknown" },
      "cycle_demo",
      registry,
      { enabled: true }
    );
    expect(fallback).toEqual({ profile: "shown" });
  });

  it("preserves state identity when the registry guard is disabled", () => {
    const state = { profile: "shown" };
    expect(cycleTuiProfileFromRegistry(state, "cycle_demo", registry, { enabled: false })).toBe(state);
  });

  it("registers the ten latest profile actions with their existing state fields", () => {
    const entries = Object.entries(LIVE_SESSION_COMMAND_LATEST_PROFILE_CYCLE_REGISTRY);
    expect(entries).toHaveLength(10);
    expect(new Set(entries.map(([, definition]) => definition.stateKey))).toHaveLength(10);
    expect(
      LIVE_SESSION_COMMAND_LATEST_PROFILE_CYCLE_REGISTRY
        .cycle_live_session_command_latest_deepest_bucket_label_visibility_profile.stateKey
    ).toBe(
      "liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile"
    );
  });

  it("combines latest, neighbor legend, and deepest nested profile families", () => {
    expect(Object.keys(LIVE_SESSION_COMMAND_LATEST_PROFILE_CYCLE_REGISTRY)).toHaveLength(10);
    expect(Object.keys(LIVE_SESSION_COMMAND_NEIGHBOR_LEGEND_PROFILE_CYCLE_REGISTRY)).toHaveLength(9);
    expect(Object.keys(LIVE_SESSION_COMMAND_DEEPEST_NESTED_PROFILE_CYCLE_REGISTRY)).toHaveLength(7);
    expect(Object.keys(LIVE_SESSION_COMMAND_PROFILE_CYCLE_REGISTRY)).toHaveLength(26);

    const initialState = createInitialTuiState() as unknown as Record<string, unknown>;
    for (const definition of Object.values(LIVE_SESSION_COMMAND_PROFILE_CYCLE_REGISTRY)) {
      expect(Object.hasOwn(initialState, definition.stateKey)).toBe(true);
    }
  });

  it("combines all profile and enum cycle actions into one registry", () => {
    expect(Object.keys(LIVE_SESSION_COMMAND_ENUM_CYCLE_REGISTRY)).toHaveLength(8);
    expect(Object.keys(LIVE_SESSION_COMMAND_CYCLE_REGISTRY)).toHaveLength(34);

    const initialState = createInitialTuiState() as unknown as Record<string, unknown>;
    for (const definition of Object.values(LIVE_SESSION_COMMAND_CYCLE_REGISTRY)) {
      expect(Object.hasOwn(initialState, definition.stateKey)).toBe(true);
    }
  });

  it("keeps registered actions palette-scoped and preserves the three-state reducer contract", () => {
    const closedState = createInitialTuiState();
    for (const [actionType, definition] of Object.entries(LIVE_SESSION_COMMAND_LATEST_PROFILE_CYCLE_REGISTRY)) {
      const action = { type: actionType } as TuiAction;
      expect(reduceTuiState(closedState, action)).toBe(closedState);

      const openState = {
        ...closedState,
        liveSessionCommandPaletteVisible: true,
        helpVisible: true
      };
      const cycled = reduceTuiState(openState, action);
      expect((cycled as unknown as Record<string, unknown>)[definition.stateKey]).toBe("hidden");
      expect(cycled.helpVisible).toBe(false);

      const adaptive = reduceTuiState(cycled, action);
      expect((adaptive as unknown as Record<string, unknown>)[definition.stateKey]).toBe("adaptive");
      const wrapped = reduceTuiState(adaptive, action);
      expect((wrapped as unknown as Record<string, unknown>)[definition.stateKey]).toBe("shown");
    }
  });

  it("preserves neighbor legend and deepest nested reducer cycles through the combined registry", () => {
    const closedState = createInitialTuiState();
    const migratedRegistries = [
      LIVE_SESSION_COMMAND_NEIGHBOR_LEGEND_PROFILE_CYCLE_REGISTRY,
      LIVE_SESSION_COMMAND_DEEPEST_NESTED_PROFILE_CYCLE_REGISTRY
    ];

    for (const registry of migratedRegistries) {
      for (const [actionType, definition] of Object.entries(registry)) {
        const action = { type: actionType } as TuiAction;
        expect(reduceTuiState(closedState, action)).toBe(closedState);

        const openState = {
          ...closedState,
          liveSessionCommandPaletteVisible: true,
          helpVisible: true
        };
        const cycled = reduceTuiState(openState, action);
        expect((cycled as unknown as Record<string, unknown>)[definition.stateKey]).toBe(definition.values[1]);
        expect(cycled.helpVisible).toBe(false);
      }
    }
  });

  it("preserves enum cycles and palette guards through the unified registry", () => {
    const closedState = createInitialTuiState();
    for (const [actionType, definition] of Object.entries(LIVE_SESSION_COMMAND_ENUM_CYCLE_REGISTRY)) {
      const action = { type: actionType } as TuiAction;
      expect(reduceTuiState(closedState, action)).toBe(closedState);

      const openState = { ...closedState, liveSessionCommandPaletteVisible: true };
      const cycled = reduceTuiState(openState, action);
      const currentValue = (openState as unknown as Record<string, unknown>)[definition.stateKey];
      const currentIndex = definition.values.indexOf(currentValue as never);
      const expectedValue = definition.values[(currentIndex + 1) % definition.values.length] ?? definition.fallback;
      expect((cycled as unknown as Record<string, unknown>)[definition.stateKey]).toBe(expectedValue);
    }
  });

  it("recomputes command selection for category and sort cycles", () => {
    const state = {
      ...createInitialTuiState(),
      liveSessionCommandPaletteVisible: true,
      selectedLiveSessionCommandIndex: 8,
      liveSessionCommandScrollOffset: 5,
      liveSessionCommandUsageCounts: { mark_read: 3 }
    };

    const categorized = reduceTuiState(state, { type: "cycle_live_session_command_category" });
    expect(categorized.liveSessionCommandCategory).toBe("session");
    expect(categorized.selectedLiveSessionCommandIndex).toBe(0);
    expect(categorized.liveSessionCommandScrollOffset).toBe(0);

    const sorted = reduceTuiState(state, { type: "cycle_live_session_command_sort_mode" });
    expect(sorted.liveSessionCommandSortMode).toBe("usage");
    expect(sorted.selectedLiveSessionCommandIndex).toBe(0);
    expect(sorted.liveSessionCommandScrollOffset).toBe(0);
  });
});
