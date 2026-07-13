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
export {
	ACTIVATION_FILE_PATHS,
	ACTIVATION_FILES,
	activationFileSchema,
	compareActivationTextFileState,
	compareConsumerDirectoryState,
	GENERATED_INSTRUCTIONS_PATH,
} from "./activation-files.ts";
export type {
	ArtifactActivationGateway,
	PrepareArtifactActivationParams,
	PrepareArtifactActivationResult,
} from "./artifact-activation.ts";
export type {
	ArtifactProvisioningDiagnostic,
	ArtifactProvisioningStatus,
	ArtifactProvisioningStatusGateway,
	ArtifactProvisioningStatusSummary,
	InspectArtifactProvisioningStatusParams,
} from "./artifact-provisioning-status.ts";
export type {
	DeclaredExtensionsGateway,
	LoadDeclaredExtensionsParams,
} from "./declared-extensions.ts";
export { RealDeclaredExtensionsGateway } from "./declared-extensions.ts";
export type { NsInitErrorInfo } from "./error-info.ts";
export type {
	EnsureExtensionSourceParams,
	EnsureExtensionSourceResult,
	ExtensionInstallAcquisitionGateway,
	ExtensionUninstallAcquisitionGateway,
	ExtensionUpdateAcquisitionFailure,
	ExtensionUpdateAcquisitionGateway,
	PreviewExtensionUpdateSourceResult,
	ReconcileExtensionUpdateSourceResult,
	RemoveManagedNpmExtensionParams,
	RemoveManagedNpmExtensionResult,
} from "./extension-acquisition.ts";
export {
	RealExtensionInstallAcquisitionGateway,
	RealExtensionUninstallAcquisitionGateway,
	RealExtensionUpdateAcquisitionGateway,
} from "./extension-acquisition.ts";
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
export type {
	ExtensionListContext,
	ExtensionListDiagnostic,
	ExtensionListRow,
	ListExtensionsRequest,
	ListExtensionsResult,
} from "./list-extensions.ts";
export {
	extensionListDiagnosticSchema,
	extensionListRowSchema,
	listExtensions,
	listExtensionsRequestSchema,
	listExtensionsResultSchema,
	renderListExtensionsHuman,
} from "./list-extensions.ts";
export type {
	ExtensionUninstallContext,
	UninstallExtensionRequest,
	UninstallExtensionResult,
} from "./uninstall-extension.ts";
export {
	renderUninstallExtensionHuman,
	uninstallExtension,
	uninstallExtensionRequestSchema,
	uninstallExtensionResultSchema,
} from "./uninstall-extension.ts";
export type {
	ExtensionUpdateContext,
	UpdateExtensionRequest,
	UpdateExtensionResult,
} from "./update-extension.ts";
export {
	classifyUpdateOutcome,
	renderUpdateExtensionHuman,
	updateExtension,
	updateExtensionRequestSchema,
	updateExtensionResultSchema,
} from "./update-extension.ts";
export { RealActivationFilesGateway } from "./real-activation-files.ts";
export { RealArtifactActivationGateway } from "./real-artifact-activation.ts";
export { RealArtifactProvisioningStatusGateway } from "./real-artifact-provisioning-status.ts";
export type {
	ApplyNsPointerStanzaResult,
	EnsureClaudeAgentsImportResult,
} from "./instruction-block.ts";
export {
	applyNsPointerStanza,
	CLAUDE_AGENTS_IMPORT_LINE,
	ensureClaudeAgentsImport,
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
	activationRepositoryFailureDiagnostic,
	applyNsActivation,
	prepareNsActivation,
	resolveActivationRepository,
} from "./activate-ns.ts";
export type { InitNsRequest, InitNsResult } from "./init-ns.ts";
export { initNs, initNsRequestSchema, initNsResultSchema, renderInitNsHuman } from "./init-ns.ts";
