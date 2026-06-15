export { buildCli, runCli, VERSION, type CliDeps } from "./cli.ts";
export type { HandoffCliContext } from "./context.ts";
export {
	HANDOFF_KEY_SUFFIX,
	HANDOFF_NAMESPACE,
	deriveSemanticHandoffSlug,
	handoffKeyFromSlug,
	handoffKeyToSlug,
	handoffSlugFromKey,
	handoffSlugToKey,
	isHandoffKey,
	parseFlatHandoffSlug,
} from "./identity.ts";
export type { FlatHandoffSlugParseResult } from "./identity.ts";
export type { BranchState, HandoffSummary } from "./inventory.ts";
