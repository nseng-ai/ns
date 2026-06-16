export { buildCli, runCli, VERSION, type CliDeps } from "./cli.ts";
export { createRealObjectiveContext, type ObjectiveCliContext } from "./context.ts";
export { FakeObjectiveStorageGateway, type FakeObjectiveRecordOptions, type FakeObjectiveStorageGatewayOptions } from "./fake-storage.ts";
export { RealObjectiveStorageGateway } from "./real-storage.ts";
export {
	ACTIVE_OBJECTIVE_ROOT,
	OBJECTIVE_ARCHIVE_ROOT,
	ObjectiveStorage,
	activeRecordRelativePath,
	activeRootRelativePath,
	archiveRootRelativePath,
	archivedRecordRelativePath,
	emptyObjectiveFiles,
	isValidObjectiveSlug,
	objectiveSlugFromActivePath,
	renderFilePresence,
	type ObjectiveCheckoutInventory,
	type ObjectiveCheckoutRecord,
	type ObjectiveFiles,
	type ObjectiveMarkdownReadResult,
	type ObjectiveRecordStatus,
	type ObjectiveStorageGateway,
	type ObjectiveStorageResult,
	type ObjectiveUpdateFile,
} from "./storage.ts";
