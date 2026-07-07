export { buildCli, runCli, VERSION, type CliDeps } from "./cli.ts";
export { createRealAregContext, type AregCliContext } from "./context.ts";
export type {
	AregCheckPairingDirectory,
	AregCheckSkillInspection,
	AregErrorInfo,
	AregReplacementInspection,
	AregOperationResult,
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
} from "./gateways.ts";
export { parseSkillFrontmatterText } from "./operations/check.ts";
export { RealAregProjectGateway } from "./gateways/project-gateway.ts";
