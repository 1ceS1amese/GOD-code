import { updateActiveLiveSessionStatus } from "./tuiLiveSessionState.js";
import type { TuiAction, TuiState } from "./tuiTypes.js";

export function reduceTuiPromptState(state: TuiState, action: TuiAction): TuiState | undefined {
  switch (action.type) {
    case "set_status":
      return {
        ...state,
        liveSessions: updateActiveLiveSessionStatus(state, action.status),
        status: action.status,
        lastError: action.status === "error" ? state.lastError : undefined
      };
    case "append_prompt":
      if (state.approvalModal || state.status === "running" || state.status === "stopping" || state.exitRequested) {
        return state;
      }
      return {
        ...state,
        promptBuffer: state.promptBuffer + action.text
      };
    case "backspace_prompt":
      if (state.approvalModal || state.promptBuffer.length === 0 || state.status === "running" || state.status === "stopping") {
        return state;
      }
      return {
        ...state,
        promptBuffer: state.promptBuffer.slice(0, -1)
      };
    case "clear_prompt":
      return {
        ...state,
        promptBuffer: ""
      };
    case "submit_prompt": {
      const prompt = state.promptBuffer.trim();
      if (state.approvalModal || state.status !== "idle" || prompt.length === 0) {
        return state;
      }
      return {
        ...state,
        liveSessions: updateActiveLiveSessionStatus(state, "running"),
        status: "running",
        promptBuffer: "",
        submitRequested: prompt,
        cancelRequested: false,
        redrawRequested: false,
        lastError: undefined
      };
    }
    case "turn_finished":
      return {
        ...state,
        liveSessions: updateActiveLiveSessionStatus(state, action.status === "error" ? "error" : "idle"),
        status: "idle",
        cancelRequested: false,
        redrawRequested: false,
        submitRequested: undefined,
        lastError: action.status === "error" ? action.error ?? "Turn failed." : undefined
      };
    case "request_cancel":
      if (state.status !== "running") {
        return {
          ...state,
          exitRequested: true
        };
      }
      return {
        ...state,
        liveSessions: updateActiveLiveSessionStatus(state, "stopping"),
        status: "stopping",
        cancelRequested: true
      };
    case "request_exit":
      return {
        ...state,
        liveSessions: state.liveSessions.map((session) => ({
          ...session,
          status: state.status === "running" ? "stopping" : "stopped"
        })),
        status: state.status === "running" ? "stopping" : "stopped",
        exitRequested: true
      };
    default:
      return undefined;
  }
}
