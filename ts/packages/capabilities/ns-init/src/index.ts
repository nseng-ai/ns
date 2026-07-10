export type {
	ActivationFile,
	ActivationFileParams,
	ActivationFilesCompareResult,
	ActivationFilesGateway,
	ActivationTextFileReadResult,
	CompareAndEnsureConsumerDirectoryParams,
	CompareAndWriteActivationFileParams,
	ConsumerDirectoryInspectionResult,
	ConsumerDirectoryParams,
	ExpectedActivationTextFileState,
	ExpectedConsumerDirectoryState,
	PreparedActivationExpectedState,
	PreparedStateMismatchDetails,
} from "./activation-files.ts";
export { ACTIVATION_FILE_PATHS, ACTIVATION_FILES } from "./activation-files.ts";
export type {
	ArtifactActivationGateway,
	PrepareArtifactActivationParams,
	PrepareArtifactActivationResult,
} from "./artifact-activation.ts";
export type {
	DeclaredExtensionsGateway,
	LoadDeclaredExtensionsParams,
	LoadDeclaredExtensionsResult,
} from "./declared-extensions.ts";
export { RealDeclaredExtensionsGateway } from "./declared-extensions.ts";
export type { NsInitErrorInfo } from "./error-info.ts";
export type {
	EnsureExtensionSourceParams,
	EnsureExtensionSourceResult,
	ExtensionInstallAcquisitionGateway,
} from "./extension-acquisition.ts";
export { RealExtensionInstallAcquisitionGateway } from "./extension-acquisition.ts";
export type {
	ExtensionInstallContext,
	InstallExtensionRequest,
	InstallExtensionResult,
} from "./install-extension.ts";
export {
	installExtension,
	installExtensionRequestSchema,
	installExtensionResultSchema,
	renderInstallExtensionHuman,
} from "./install-extension.ts";
export { RealActivationFilesGateway } from "./real-activation-files.ts";
export { RealArtifactActivationGateway } from "./real-artifact-activation.ts";
export type {
	ApplyNsPointerStanzaResult,
	EnsureClaudeAgentsImportResult,
} from "./instruction-block.ts";
export {
	applyNsPointerStanza,
	CLAUDE_AGENTS_IMPORT_LINE,
	ensureClaudeAgentsImport,
	GENERATED_INSTRUCTIONS_PATH,
	NS_POINTER_STANZA_VERSION,
	renderGeneratedInstructions,
	renderNsPointerStanza,
} from "./instruction-block.ts";
export type { NsActivationContext } from "./activation-context.ts";
export type {
	ActivationCompleted,
	ActivationDiagnostic,
	ApplyNsActivationResult,
	PrepareNsActivationOptions,
	PrepareNsActivationResult,
	PreparedNsActivation,
	ResolvedActivationRepository,
	ResolveActivationRepositoryResult,
} from "./activate-ns.ts";
export {
	applyNsActivation,
	prepareNsActivation,
	resolveActivationRepository,
} from "./activate-ns.ts";
export type { InitNsRequest, InitNsResult } from "./init-ns.ts";
export { initNs, initNsRequestSchema, initNsResultSchema, renderInitNsHuman } from "./init-ns.ts";
