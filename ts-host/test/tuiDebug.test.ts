import { describe, expect, it } from "vitest";
import { buildTuiDebugLines } from "../src/cli/tuiDebug.js";
import {
  createInitialTuiState,
  createTuiEvent,
  reduceTuiState,
  tuiActionForLiveSessionCommand
} from "../src/cli/tuiState.js";

const now = () => "2026-07-06T00:00:00.000Z";

describe("buildTuiDebugLines", () => {
  it("summarizes TUI state without dumping raw payloads", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "s1" });
    state = reduceTuiState(state, { type: "append_prompt", text: "hello" });
    state = reduceTuiState(state, {
      type: "append_event",
      event: createTuiEvent("system", "event", now)
    });
    state = reduceTuiState(state, { type: "rename_live_session", label: "debug name" });
    state = reduceTuiState(state, { type: "set_live_session_filter", filter: "debug" });
    state = reduceTuiState(state, { type: "cycle_live_session_sort_mode" });
    state = reduceTuiState(state, { type: "toggle_debug" });

    expect(buildTuiDebugLines(state)).toEqual([
      "session=s1",
      "status=idle pane=prompt live=1/1",
      "prompt_chars=5 events=2 history=0",
      "live_statuses=s1:idle",
      "live_unread=s1:0",
      "live_pinned=s1:no",
      "live_names=s1:debug name",
      "live_filter=debug",
      "live_sort=name",
      "live_quick_actions=1:activate,2:pin,3:close,4:sort,5:filter,0:clear_filter",
      "live_bulk_actions=x:close_inactive,P:unpin_all,A:mark_read",
      "live_command_palette=closed selected=0 group=1/4:favorite(1/1) neighbor_profile=full neighbor_threshold=balanced[88/128] bucket_help=on@|/legend:compact@`/labels:shown@_/bucket_labels:shown@*/visibility_bucket_labels:shown@&/visibility_bucket_labels_labels:shown@(/visibility_bucket_labels_labels_labels:shown@)/visibility_bucket_labels_labels_labels_labels:shown@</visibility_bucket_labels_labels_labels_labels_labels:shown@>/visibility_bucket_labels_labels_labels_labels_labels_labels:shown@?/visibility_bucket_labels_labels_labels_labels_labels_labels_labels:shown@:/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:shown@,/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@./visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@-/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@#/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@$/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@0/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@9/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@8/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@7/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@6/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@5/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@4/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@3/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@2/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@1/latest_width_bucket_label:shown@F2 neighbors=-/session(2)@2#2:pin scroll=0 page=5 wrap=off category=all sort=catalog ranking=on/3/single/2 summary=history profile=all search=-",
      "live_command_grouping=category",
      "live_command_favorites=activate",
      "live_command_history=-",
      "live_command_pinned_history=-",
      "live_command_usage=-",
      "live_command_ranking=-",
      "scroll events=0 live=0 history=0 timeline=0",
      "selected_live=0 selected_history=0 selected_timeline=- view=-",
      "flags help=false debug=true approval=no",
      "turn submit=no cancel=false exit=false",
      "last_error=-"
    ]);
  });

  it("summarizes ranked live command usage", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "session_started", sessionId: "s1" });
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, tuiActionForLiveSessionCommand("filter", "command_palette"));
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, tuiActionForLiveSessionCommand("filter", "command_palette"));
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, tuiActionForLiveSessionCommand("sort", "command_palette"));

    expect(buildTuiDebugLines(state)).toContain("live_command_ranking=filter:2,sort:1");
  });

  it("reports an empty command group scope", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, {
      type: "append_live_session_command_search",
      text: "no-command-matches"
    });

    expect(buildTuiDebugLines(state)).toContain(
      "live_command_palette=open selected=0 group=0/0:-(0/0) neighbor_profile=full neighbor_threshold=balanced[88/128] bucket_help=on@|/legend:compact@`/labels:shown@_/bucket_labels:shown@*/visibility_bucket_labels:shown@&/visibility_bucket_labels_labels:shown@(/visibility_bucket_labels_labels_labels:shown@)/visibility_bucket_labels_labels_labels_labels:shown@</visibility_bucket_labels_labels_labels_labels_labels:shown@>/visibility_bucket_labels_labels_labels_labels_labels_labels:shown@?/visibility_bucket_labels_labels_labels_labels_labels_labels_labels:shown@:/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:shown@,/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@./visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@-/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@#/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@$/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@0/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@9/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@8/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@7/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@6/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@5/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@4/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@3/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@2/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@1/latest_width_bucket_label:shown@F2 neighbors=-/- scroll=0 page=5 wrap=off category=all sort=catalog ranking=on/3/single/2 summary=history profile=all search=no-command-matches"
    );
  });

  it("reports the selected command position within its group", () => {
    let state = createInitialTuiState(now);
    state = reduceTuiState(state, { type: "open_live_session_command_palette" });
    state = reduceTuiState(state, { type: "jump_live_session_command_group", direction: 1 });
    state = reduceTuiState(state, { type: "jump_live_session_command_group", direction: 1 });
    state = reduceTuiState(state, { type: "select_live_session_command", direction: 1 });

    expect(buildTuiDebugLines(state)).toContain(
      "live_command_palette=open selected=4 group=3/4:view(2/3) neighbor_profile=full neighbor_threshold=balanced[88/128] bucket_help=on@|/legend:compact@`/labels:shown@_/bucket_labels:shown@*/visibility_bucket_labels:shown@&/visibility_bucket_labels_labels:shown@(/visibility_bucket_labels_labels_labels:shown@)/visibility_bucket_labels_labels_labels_labels:shown@</visibility_bucket_labels_labels_labels_labels_labels:shown@>/visibility_bucket_labels_labels_labels_labels_labels_labels:shown@?/visibility_bucket_labels_labels_labels_labels_labels_labels_labels:shown@:/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels:shown@,/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@./visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@-/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@#/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@$/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@0/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@9/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@8/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@7/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@6/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@5/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@4/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@3/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@2/visibility_bucket_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels_labels:shown@1/latest_width_bucket_label:shown@F2 neighbors=session(2)@2#2:pin/bulk(3)@x#7:close_inactive scroll=3 page=5 wrap=off category=all sort=catalog ranking=on/3/single/2 summary=history profile=all search=-"
    );
  });
});
