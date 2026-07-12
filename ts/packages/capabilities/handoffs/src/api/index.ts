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
} from "../core/identity.ts";
export type {
	FlatHandoffSlugParseResult,
	HandoffSlugNormalizationResult,
} from "../core/identity.ts";

export {
	normalizeHandoffSelectorToKey,
	resolveHandoffSelection,
	splitHandoffSelectorTerms,
} from "../core/selection.ts";
export type { HandoffSelectionMatchedBy, HandoffSelectionResult } from "../core/selection.ts";

export { branchStateSchema, handoffSummarySchema } from "../core/inventory.ts";
export type { BranchState, HandoffSummary } from "../core/inventory.ts";

export {
	listHandoffSummaries,
	readHandoffArtifact,
	checkHandoffArtifact,
	prepareHandoffCreation,
	createHandoffArtifact,
	prepareHandoffDeletion,
	deleteHandoffArtifact,
} from "../core/artifact-storage.ts";
export type {
	CreateHandoffArtifactResult,
	DeleteHandoffArtifactResult,
	HandoffArtifactCheck,
	HandoffBrmemGateway,
	HandoffCheckBrmemGateway,
	HandoffCheckStorageDeps,
	HandoffCreateBrmemGateway,
	HandoffCreateStorageDeps,
	HandoffCreationTarget,
	HandoffDeleteBrmemGateway,
	HandoffDeleteStorageDeps,
	HandoffDeletionTarget,
	HandoffGitGateway,
	HandoffReadBrmemGateway,
	HandoffReadStorageDeps,
	HandoffReadTarget,
	HandoffStorageDeps,
	HandoffTarget,
	ListHandoffSummariesOptions,
	ReadHandoffArtifactResult,
} from "../core/artifact-storage.ts";

export {
	executeDeletedBranchGarbageCollection,
	planDeletedBranchGarbageCollection,
} from "../core/gc-core.ts";
export type {
	DeletedBranchGarbageCollectionAction,
	DeletedBranchGarbageCollectionCounts,
	DeletedBranchGarbageCollectionEntry,
	DeletedBranchGarbageCollectionReport,
} from "../core/gc-core.ts";
