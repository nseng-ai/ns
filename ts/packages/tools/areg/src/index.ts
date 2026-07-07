export { buildCli, runCli, VERSION, type CliDeps } from "./cli.ts";
export { createRealAregContext, type AregCliContext } from "./context.ts";
export type {
	AregCheckPairingDirectory,
	AregCheckSkillInspection,
	AregErrorInfo,
	AregReplacementInspection,
	AregOperationResult,
	PathState,
	AregProjectBaseInspection,
	AregProjectDirRequest,
	AregProjectGateway,
	AregProjectInspectionRequest,
	AregProjectMutationResult,
	AregProjectRemoveEmptyDirResult,
	AregProjectTextWriteRequest,
	AregSkillInspectionRequest,
	AregSkillKindResolveRequest,
	AregSkillKindResolveResult,
	AregSkillKindSkillInspection,
	TextFileState,
} from "./gateways.ts";
export { parseLockfileData, parseSkillFrontmatterText } from "./operations/check.ts";
export { RealAregProjectGateway } from "./real-gateways.ts";
