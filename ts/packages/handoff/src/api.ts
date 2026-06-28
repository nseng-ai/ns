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

export { branchStateSchema, handoffSummarySchema } from "./inventory.ts";
export type { BranchState, HandoffSummary } from "./inventory.ts";

export {
	listHandoffSummaries,
	prepareHandoffCreation,
	createHandoffArtifact,
	prepareHandoffDeletion,
	deleteHandoffArtifact,
} from "./artifact-storage.ts";
export type {
	CreateHandoffArtifactResult,
	DeleteHandoffArtifactResult,
	HandoffCreationTarget,
	HandoffDeletionTarget,
	HandoffStorageDeps,
	ListHandoffSummariesOptions,
} from "./artifact-storage.ts";

export {
	executeDeletedBranchGarbageCollection,
	planDeletedBranchGarbageCollection,
} from "./gc-core.ts";
export type {
	DeletedBranchGarbageCollectionAction,
	DeletedBranchGarbageCollectionCounts,
	DeletedBranchGarbageCollectionEntry,
	DeletedBranchGarbageCollectionPlan,
	DeletedBranchGarbageCollectionReport,
	DeletedBranchGarbageCollectionResult,
} from "./gc-core.ts";
