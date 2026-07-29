import { handoffCommandSurface } from "../core/command-metadata.ts";

export {
	CREATE_HANDOFF_COMMAND_NAME,
	PICKUP_HANDOFF_COMMAND_NAME,
} from "../core/command-metadata.ts";

export const LIST_HANDOFF_COMMAND_NAME = handoffCommandSurface("list");
export const HANDOFF_SELF_COMMAND_NAME = handoffCommandSurface("self");

export const DERIVE_HANDOFF_SLUG_TOOL_NAME = "derive_handoff_slug_from_content";
export const HANDOFF_SELF_QUEUE_PICKUP_TOOL_NAME = "handoff_self_queue_pickup";
export const CREATE_HANDOFF_SKILL_NAME = "handoff-create";

export const HANDOFF_TIMEOUT_MS = 30_000;
export const BRMEM_TIMEOUT_MS = 30_000;
// Long enough for the model to compose and store a full handoff before resolving session replacement.
export const HANDOFF_SELF_WORKFLOW_TIMEOUT_MS = 10 * 60_000;
export const GIT_TIMEOUT_MS = 10_000;
export const CREATE_FOCUS_QUESTION = "What should the future session continue from this handoff?";
export const HANDOFF_SELF_STATUS_KEY = HANDOFF_SELF_COMMAND_NAME;
