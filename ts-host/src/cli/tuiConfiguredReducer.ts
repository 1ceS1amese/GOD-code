import { LIVE_SESSION_COMMAND_CYCLE_REGISTRY } from "./tuiCycleRegistries.js";
import { createTuiReducer } from "./tuiReducer.js";

export const reduceTuiState = createTuiReducer(LIVE_SESSION_COMMAND_CYCLE_REGISTRY);
