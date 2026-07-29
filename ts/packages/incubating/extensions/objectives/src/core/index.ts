export { createRealObjectiveContext, type ObjectiveCliContext } from "./context.ts";
export {
	FakeObjectiveStorageGateway,
	type FakeObjectiveRecordOptions,
	type FakeObjectiveStorageGatewayOptions,
} from "./fake-storage.ts";
export {
	isValidObjectiveLocator,
	isValidObjectiveOwner,
	objectiveLocatorEquals,
	OBJECTIVE_OWNER_MAX_LENGTH,
	parseObjectiveLocatorString,
	parseObjectiveSelector,
	renderObjectiveLocator,
	type ObjectiveLocator,
	type ObjectiveSelectorParse,
} from "./identity.ts";
export {
	FakeObjectiveOwnerGateway,
	RealObjectiveOwnerGateway,
	type FakeObjectiveOwnerGatewayOptions,
	type ObjectiveOwnerGateway,
	type ObjectiveOwnerResolution,
} from "./owner-gateway.ts";
export { RealObjectiveStorageGateway } from "./real-storage.ts";
export {
	objectiveRecordEdgeSchema,
	objectiveRecordFrontmatterParseSchema,
	objectiveRecordFrontmatterSchema,
	splitObjectiveRecordDocument,
	type ObjectiveRecordDocument,
	type ObjectiveRecordEdge,
	type ObjectiveRecordFrontmatter,
	type ObjectiveRecordFrontmatterParse,
} from "./record-frontmatter.ts";
export {
	ACTIVE_OBJECTIVE_ROOT,
	ObjectiveStorage,
	activeRootRelativePath,
	emptyObjectiveFiles,
	findRecordLocation,
	isValidObjectiveSlug,
	legacyFlatRecordRelativePath,
	objectiveLocatorCandidatesFromActivePath,
	objectiveLocatorsFromChangedPaths,
	ownerNestedRecordRelativePath,
	renderFilePresence,
	type ObjectiveActivePathCandidates,
	type ObjectiveCheckoutInventory,
	type ObjectiveFiles,
	type ObjectiveMarkdownReadResult,
	type ObjectiveRecordDocumentReadResult,
	type ObjectiveRecordLayout,
	type ObjectiveRecordLocation,
	type ObjectiveRecordStatus,
	type ObjectiveStorageGateway,
	type ObjectiveStorageResult,
	type ObjectiveStructuralFinding,
	type ObjectiveUpdateFile,
} from "./storage.ts";
