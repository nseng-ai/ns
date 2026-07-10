export type {
	ActivationFilesGateway,
	ActivationFilesOperationResult,
	ActivationPathParams,
	ActivationTextFileReadResult,
	ConsumerDirectoryInspectionResult,
	WriteActivationTextFileParams,
} from "./activation-files.ts";
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
