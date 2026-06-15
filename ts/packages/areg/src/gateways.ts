export const AREG_HOST_TOOL_NAMES = ["gh", "npx"] as const;
export type AregHostToolName = (typeof AREG_HOST_TOOL_NAMES)[number];

export interface AregErrorInfo {
	code: string;
	message: string;
	displayCommand?: string | undefined;
}

export type AregOperationResult = { type: "ok" } | { type: "error"; error: AregErrorInfo };

export type AregToolCheckResult =
	| { type: "found"; tool: AregHostToolName; path: string }
	| { type: "missing"; tool: AregHostToolName; message: string };

export interface AregHostGateway {
	checkTool(options: { tool: AregHostToolName; cwd: string; env: NodeJS.ProcessEnv }): Promise<AregToolCheckResult>;
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
	/** Empty means install all skills from the source repository. */
	skillNames: readonly string[];
	targetAgents: readonly string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export type AregNpxSkillsAddResult = { type: "ok" } | { type: "error"; error: AregErrorInfo };

export interface AregNpxSkillsGateway {
	addSkills(request: AregNpxSkillsAddRequest): Promise<AregNpxSkillsAddResult>;
}

export interface AregPromptGateway {
	confirm(request: { message: string; defaultValue: boolean }): Promise<boolean>;
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

export interface AregSkillxWorkspaceCleanupRequest {
	workspaceRoot: string;
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export type AregSkillxInstallResult =
	| { type: "ok"; workspace: AregSkillxWorkspaceInstall }
	| { type: "error"; error: AregErrorInfo };

export interface AregSkillxWorkspaceGateway {
	installIntoWorkspace(request: AregSkillxInstallRequest): Promise<AregSkillxInstallResult>;
	cleanupWorkspace(request: AregSkillxWorkspaceCleanupRequest): Promise<AregOperationResult>;
}

export type AregCheckPathState =
	| { type: "missing" }
	| { type: "file" }
	| { type: "directory" }
	| { type: "symlink"; target: string }
	| { type: "other" };

export type AregCheckTextFileState =
	| { type: "missing" }
	| { type: "file"; text: string }
	| { type: "directory" }
	| { type: "symlink"; target: string }
	| { type: "other" }
	| { type: "unreadable"; message: string };

export interface AregCheckSkillInspection {
	name: string;
	skillsPath: AregCheckPathState;
	agentsPath: AregCheckPathState;
	claudePath: AregCheckPathState;
	localSkillMd: AregCheckTextFileState;
	remoteSkillMd: AregCheckTextFileState;
	openaiPolicy: AregCheckTextFileState;
}

export interface AregCheckPairingDirectory {
	relativeDir: string;
	hasAgents: boolean;
	hasClaude: boolean;
	claudeText?: string | undefined;
}

export interface AregCheckProjectInspectionResult {
	projectDir: string;
	projectPathState: AregCheckPathState;
	lockfile: AregCheckTextFileState;
	skillsDirectoryNames: readonly string[];
	agentsSkillNames: readonly string[];
	excludedSkillNames: readonly string[];
	piSettings: AregCheckTextFileState;
	genericReplacement: {
		hasAdapter: boolean;
		hasPackageModule: boolean;
	};
	skills: readonly AregCheckSkillInspection[];
	pairingDirectories: readonly AregCheckPairingDirectory[];
}

export interface AregCheckProjectInspectionRequest {
	cwd: string;
	projectPath: string;
	env: NodeJS.ProcessEnv;
}

export interface AregCheckProjectInspectionGateway {
	inspectProjectForCheck(request: AregCheckProjectInspectionRequest): Promise<AregCheckProjectInspectionResult>;
}

export type AregInitPathState = AregCheckPathState;
export type AregInitTextFileState = AregCheckTextFileState;

export interface AregInitProjectInspectionResult {
	projectDir: string;
	targetPathState: AregInitPathState;
	agentsMd: AregInitTextFileState;
	claudeMd: AregInitTextFileState;
	asdlToml: AregInitTextFileState;
	aregJson: AregInitTextFileState;
	claudeDir: AregInitPathState;
	claudeSettings: AregInitTextFileState;
}

export interface AregInitTextWritePlan {
	relativePath: "asdl.toml" | "AGENTS.md" | "CLAUDE.md" | ".claude/settings.local.json";
	content: string;
	description: string;
	createParent: boolean;
}

export type AregInitApplyResult = { ok: true; writtenRelativePaths: readonly string[] } | { ok: false; error: AregErrorInfo };

export interface AregInitProjectInspectionRequest {
	cwd: string;
	target: string;
	env: NodeJS.ProcessEnv;
}

export interface AregInitTextWritePlanRequest {
	projectDir: string;
	writes: readonly AregInitTextWritePlan[];
	env: NodeJS.ProcessEnv;
}

export interface AregInitProjectGateway {
	inspectProjectForInit(request: AregInitProjectInspectionRequest): Promise<AregInitProjectInspectionResult>;
	applyTextWritePlan(request: AregInitTextWritePlanRequest): Promise<AregInitApplyResult>;
}

export type AregUpdatePathState = AregCheckPathState;
export type AregUpdateTextFileState = AregCheckTextFileState;

export interface AregUpdateProjectInspectionRequest {
	cwd: string;
	projectPath: string;
	env: NodeJS.ProcessEnv;
}

export interface AregUpdateProjectInspectionResult {
	projectDir: string;
	projectPathState: AregUpdatePathState;
	lockfile: AregUpdateTextFileState;
	asdlToml: AregUpdateTextFileState;
	aregJson: AregUpdateTextFileState;
}

export interface AregUpdateProjectGateway {
	inspectProjectForUpdate(request: AregUpdateProjectInspectionRequest): Promise<AregUpdateProjectInspectionResult>;
}

export type AregSkillKindPathState = AregCheckPathState;
export type AregSkillKindTextFileState = AregCheckTextFileState;

export interface AregSkillKindSkillInspection {
	name: string;
	skillDir: AregSkillKindPathState;
	skillMd: AregSkillKindTextFileState;
	openaiPolicy: AregSkillKindTextFileState;
}

export interface AregSkillKindTextWritePlan {
	relativePath: string;
	content: string;
	description: string;
	createParent: boolean;
}

export interface AregSkillKindDeletePlan {
	relativePath: string;
	description: string;
}

export interface AregSkillKindRemoveEmptyDirPlan {
	relativePath: string;
	description: string;
}

export interface AregSkillKindApplyPlanRequest {
	projectDir: string;
	writes: readonly AregSkillKindTextWritePlan[];
	deletes: readonly AregSkillKindDeletePlan[];
	removeEmptyDirs: readonly AregSkillKindRemoveEmptyDirPlan[];
	env: NodeJS.ProcessEnv;
}

export type AregSkillKindApplyPlanResult =
	| { ok: true; writtenRelativePaths: readonly string[]; deletedRelativePaths: readonly string[]; removedEmptyDirRelativePaths: readonly string[] }
	| { ok: false; error: AregErrorInfo };

export interface AregSkillKindProjectInspectionRequest {
	cwd: string;
	projectPath: string;
	env: NodeJS.ProcessEnv;
}

export interface AregSkillKindProjectInspectionResult {
	projectDir: string;
	projectPathState: AregSkillKindPathState;
	piDir: AregSkillKindPathState;
	piSettings: AregSkillKindTextFileState;
	genericReplacement: {
		hasAdapter: boolean;
		hasPackageModule: boolean;
	};
	skills: readonly AregSkillKindSkillInspection[];
}

export interface AregSkillKindResolveRequest {
	projectDir: string;
	spec: string;
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export type AregSkillKindResolveResult = { type: "ok"; skillName: string } | { type: "error"; error: AregErrorInfo };

export interface AregSkillKindProjectGateway {
	inspectProjectForSkillKinds(request: AregSkillKindProjectInspectionRequest): Promise<AregSkillKindProjectInspectionResult>;
	resolveLocalSkillSpec(request: AregSkillKindResolveRequest): Promise<AregSkillKindResolveResult>;
	applySkillKindPlan(request: AregSkillKindApplyPlanRequest): Promise<AregSkillKindApplyPlanResult>;
}
