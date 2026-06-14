export { buildCli, runCli, VERSION, type CliDeps } from "./cli.ts";
export type { HandoffCliContext } from "./context.ts";
export { HANDOFF_KEY_SUFFIX, HANDOFF_NAMESPACE, handoffKeyFromSlug, handoffSlugFromKey, isHandoffKey } from "./identity.ts";
export { collectHandoffSummaries } from "./inventory.ts";
export type { BranchState, HandoffSummary } from "./inventory.ts";
