export const AREG_HOST_TOOL_NAMES = ["gh", "npx"] as const;
export type AregHostToolName = (typeof AREG_HOST_TOOL_NAMES)[number];

export interface AregErrorInfo {
	code: string;
	message: string;
	displayCommand?: string | undefined;
}

export type AregOperationResult = { ok: true } | { ok: false; error: AregErrorInfo };

export type AregToolCheckResult =
	| { type: "found"; tool: AregHostToolName; path: string }
	| { type: "missing"; tool: AregHostToolName; message: string };

export type AregGitRootResult =
	| { type: "found"; repoRoot: string }
	| { type: "not-a-git-repo"; message: string }
	| { type: "error"; error: AregErrorInfo };

export interface AregHostGateway {
	checkTool(options: { tool: AregHostToolName; cwd: string; env: NodeJS.ProcessEnv }): Promise<AregToolCheckResult>;
	resolveGitRoot(options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<AregGitRootResult>;
}

export type AregGithubSkillListResult =
	| { type: "ok"; skillNames: readonly string[] }
	| { type: "missing"; message: string }
	| { type: "auth-error"; message: string }
	| { type: "error"; error: AregErrorInfo };

export interface AregGithubGateway {
	listSkillDirectoryNames(options: { repo: string; ref?: string | undefined; env: NodeJS.ProcessEnv }): Promise<AregGithubSkillListResult>;
}

export interface AregNpxSkillsAddRequest {
	sourceRepo: string;
	skillNames: readonly string[];
	targetAgents: readonly string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export type AregNpxSkillsAddResult =
	| { type: "ok"; installedSkillNames: readonly string[] }
	| { type: "error"; error: AregErrorInfo };

export interface AregNpxSkillsGateway {
	addSkills(request: AregNpxSkillsAddRequest): Promise<AregNpxSkillsAddResult>;
}

export interface AregSkillxInstalledSkill {
	name: string;
	directory: string;
	skillFile: string;
	relativeFiles: readonly string[];
}

export interface AregSkillxWorkspaceInstall {
	workspaceRoot: string;
	installedSkills: readonly AregSkillxInstalledSkill[];
}

export interface AregSkillxInstallRequest {
	sourceRepo: string;
	skillName?: string | undefined;
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export type AregSkillxInstallResult =
	| { type: "ok"; workspace: AregSkillxWorkspaceInstall }
	| { type: "error"; error: AregErrorInfo };

export interface AregSkillxWorkspaceGateway {
	installIntoWorkspace(request: AregSkillxInstallRequest): Promise<AregSkillxInstallResult>;
}
