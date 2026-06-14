export { buildCli, runCli, VERSION, type CliDeps } from "./cli.ts";
export { createAregCliContext, createRealAregContext, type AregCliContext, type AregCliContextDeps } from "./context.ts";
export type {
	AregErrorInfo,
	AregGithubGateway,
	AregGithubSkillListResult,
	AregGitRootResult,
	AregHostGateway,
	AregHostToolName,
	AregNpxSkillsAddRequest,
	AregNpxSkillsAddResult,
	AregNpxSkillsGateway,
	AregOperationResult,
	AregSkillxInstallRequest,
	AregSkillxInstallResult,
	AregSkillxInstalledSkill,
	AregSkillxWorkspaceGateway,
	AregSkillxWorkspaceInstall,
	AregToolCheckResult,
} from "./gateways.ts";
