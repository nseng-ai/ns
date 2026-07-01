export { runCli, buildCli, VERSION, type CliDeps } from "./cli.ts";
export {
	BASE_NAMESPACE,
	encodeBranchName,
	decodeBranchName,
	buildSnapshotRef,
	buildEntryLocator,
	mustEntryLocator,
	mustSnapshotRef,
	parseSnapshotRef,
	parseEntryLocator,
	normalizeNamespaceOption,
} from "./ref-layout.ts";
export type {
	EntryCoordinate,
	EntryRef,
	SnapshotRefParts,
	EntryLocatorParts,
} from "./ref-layout.ts";
export {
	validateBranchName,
	validateNamespaceName,
	validateEntryKey,
	validateKeyGlob,
} from "./validation.ts";
export type { ValidationResult } from "./validation.ts";
export type {
	BrmemGateway,
	BrmemReadGateway,
	EntryContent,
	EntryDiagnostic,
	ListedEntry,
	ListedSnapshot,
	PutEntryResult,
	DeleteEntryResult,
	CopyEntriesResult,
	GitRemoteConfig,
	EntryQueryOptions,
	EntryWriteOptions,
} from "./gateway.ts";
export type { BrmemErrorInfo, BrmemOptionalResult, BrmemResult } from "./contracts.ts";
export { brmemOk, brmemError, brmemFound, brmemMissing, brmemOptionalError } from "./contracts.ts";
export { RealGitBrmemGateway, RealGitBrmemReadGateway } from "./real-git-gateway.ts";
export type {
	RealGitBrmemGatewayOptions,
	RealGitBrmemReadGatewayOptions,
} from "./real-git-gateway.ts";
export { FakeBrmemGateway } from "./fake-gateway.ts";
export type {
	FakeBrmemGatewayOptions,
	FakeEntrySeed,
	FakeGitRemoteConfig,
} from "./fake-gateway.ts";
export { putEntryFromFile, prepareEntryContentFromSource } from "./put-entry-from-file.ts";
export type {
	PreparedEntryContent,
	PrepareEntryContentSourceOptions,
	PutEntryFromFileOptions,
	PutEntryFromFileResult,
} from "./put-entry-from-file.ts";
export { NodeBrmemSourceReader } from "./source-reader.ts";
export type { BrmemSourceReader, SourceBytesResult } from "./source-reader.ts";
