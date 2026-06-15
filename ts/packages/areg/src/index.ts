export { buildCli, runCli, VERSION, type CliDeps } from "./cli.ts";
export { createRealAregContext, type AregCliContext } from "./context.ts";
export type {
	AregCheckPairingDirectory,
	AregCheckPathState,
	AregCheckProjectInspectionGateway,
	AregCheckProjectInspectionRequest,
	AregCheckProjectInspectionResult,
	AregCheckSkillInspection,
	AregCheckTextFileState,
	AregErrorInfo,
	AregGithubGateway,
	AregGithubSkillListResult,
	AregHostGateway,
	AregHostToolName,
	AregNpxSkillsAddRequest,
	AregNpxSkillsAddResult,
	AregNpxSkillsGateway,
	AregOperationResult,
	AregSkillxInstallRequest,
	AregSkillxInstallResult,
	AregSkillxInstalledSkill,
	AregSkillxWorkspaceCleanupRequest,
	AregSkillxWorkspaceGateway,
	AregSkillxWorkspaceInstall,
	AregToolCheckResult,
} from "./gateways.ts";
export { derivePiReplacementCommand, parseLockfileData, parseSkillFrontmatterText } from "./operations/check.ts";
export { parseSkillInput } from "./operations/skillx.ts";
export {
	buildNpxSkillsAddArgs,
	RealAregCheckProjectInspectionGateway,
	RealAregGithubGateway,
	RealAregHostGateway,
	RealAregNpxSkillsGateway,
	RealAregSkillxWorkspaceGateway,
} from "./real-gateways.ts";
