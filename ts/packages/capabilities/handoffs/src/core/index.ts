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
	normalizeHandoffSlugInput,
	parseFlatHandoffSlug,
} from "./identity.ts";
export type { FlatHandoffSlugParseResult, HandoffSlugNormalizationResult } from "./identity.ts";
export {
	normalizeHandoffSelectorToKey,
	resolveHandoffSelection,
	splitHandoffSelectorTerms,
} from "./selection.ts";
export type { HandoffSelectionMatchedBy, HandoffSelectionResult } from "./selection.ts";
export type { BranchState, HandoffSummary } from "./inventory.ts";
