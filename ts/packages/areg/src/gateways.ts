import type { ErrorInfo, Result } from "@asdl/core/result";

export const AREG_HOST_TOOL_NAMES = ["gh", "npx"] as const;
export type AregHostToolName = (typeof AREG_HOST_TOOL_NAMES)[number];

export interface AregErrorInfo extends ErrorInfo {
	displayCommand?: string;
}

export type AregOperationResult = Result<undefined, AregErrorInfo>;

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
}

export type AregSkillxInstallResult =
	| { type: "ok"; workspace: AregSkillxWorkspaceInstall }
	| { type: "error"; error: AregErrorInfo };

export interface AregSkillxWorkspaceGateway {
	installIntoWorkspace(request: AregSkillxInstallRequest): Promise<AregSkillxInstallResult>;
	cleanupWorkspace(request: AregSkillxWorkspaceCleanupRequest): Promise<AregOperationResult>;
}

export type AregPathState =
	| { type: "missing" }
	| { type: "file" }
	| { type: "directory" }
	| { type: "symlink"; target: string }
	| { type: "other" };

export type AregTextFileState =
	| { type: "missing" }
	| { type: "file"; text: string }
	| { type: "directory" }
	| { type: "symlink"; target: string }
	| { type: "other" }
	| { type: "unreadable"; message: string };

export interface AregCheckSkillInspection {
	name: string;
	skillsPath: AregPathState;
	agentsPath: AregPathState;
	claudePath: AregPathState;
	localSkillMd: AregTextFileState;
	remoteSkillMd: AregTextFileState;
	openaiPolicy: AregTextFileState;
}

export interface AregCheckPairingDirectory {
	relativeDir: string;
	hasAgents: boolean;
	hasClaude: boolean;
	claudeText?: string | undefined;
}

export interface AregSkillKindSkillInspection {
	name: string;
	skillDir: AregPathState;
	skillMd: AregTextFileState;
	openaiPolicy: AregTextFileState;
}

export interface AregReplacementInspection {
	verifiedSurfaces: readonly string[];
}

export interface AregProjectInspectionRequest {
	cwd: string;
	projectPath: string;
	env: NodeJS.ProcessEnv;
}

export interface AregProjectDirRequest {
	projectDir: string;
	env: NodeJS.ProcessEnv;
}

export interface AregSkillInspectionRequest {
	projectDir: string;
	skillName: string;
	env: NodeJS.ProcessEnv;
}

export interface AregProjectBaseInspection {
	projectDir: string;
	projectPathState: AregPathState;
	lockfile: AregTextFileState;
	asdlToml: AregTextFileState;
	aregJson: AregTextFileState;
}

export interface AregInstructionFilesInspection {
	agentsMd: AregTextFileState;
	claudeMd: AregTextFileState;
	claudeDir: AregPathState;
	claudeSettings: AregTextFileState;
}

export interface AregPiArtifactsInspection {
	piDir: AregPathState;
	piSettings: AregTextFileState;
	replacement: AregReplacementInspection;
}

export interface AregSkillNameInventory {
	skillsDirectoryNames: readonly string[];
	agentsSkillNames: readonly string[];
	claudeSkillNames: readonly string[];
	localSkillKindNames: readonly string[];
}

export interface AregSkillKindResolveRequest {
	projectDir: string;
	spec: string;
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export type AregSkillKindResolveResult = { type: "ok"; skillName: string } | { type: "error"; error: AregErrorInfo };

export type AregProjectMutationPolicy = "init" | "skill-kind";

export interface AregProjectTextWriteRequest {
	projectDir: string;
	relativePath: string;
	content: string;
	description: string;
	createParent: boolean;
	policy: AregProjectMutationPolicy;
	env: NodeJS.ProcessEnv;
}

export interface AregProjectFileDeleteRequest {
	projectDir: string;
	relativePath: string;
	description: string;
	policy: "skill-kind";
	env: NodeJS.ProcessEnv;
}

export interface AregProjectRemoveEmptyDirRequest {
	projectDir: string;
	relativePath: string;
	description: string;
	policy: "skill-kind";
	env: NodeJS.ProcessEnv;
}

export type AregProjectMutationResult = { ok: true } | { ok: false; error: AregErrorInfo };
export type AregProjectRemoveEmptyDirResult = { ok: true; removed: boolean } | { ok: false; error: AregErrorInfo };

/**
 * Areg's project-resource gateway.
 *
 * This is intentionally domain-oriented: it exposes named areg project facts and
 * project-scoped safe mutation primitives, not a generic filesystem API. Add new
 * reads here only when they represent stable areg project concepts, and route new
 * writes/deletes through project-scoped primitives with an explicit policy. Do not
 * add an unrestricted filesystem gateway to areg as a convenience for operation code.
 */
export interface AregProjectGateway {
	inspectProjectBase(request: AregProjectInspectionRequest): Promise<AregProjectBaseInspection>;
	inspectInstructionFiles(request: AregProjectDirRequest): Promise<AregInstructionFilesInspection>;
	inspectPiArtifacts(request: AregProjectDirRequest): Promise<AregPiArtifactsInspection>;
	inspectSkillNameInventory(request: AregProjectDirRequest): Promise<AregSkillNameInventory>;
	inspectCheckSkill(request: AregSkillInspectionRequest): Promise<AregCheckSkillInspection>;
	inspectLocalSkill(request: AregSkillInspectionRequest): Promise<AregSkillKindSkillInspection>;
	inspectPairingDirectories(request: AregProjectDirRequest): Promise<readonly AregCheckPairingDirectory[]>;
	readLocallyExcludedSkillNames(request: AregProjectDirRequest): Promise<readonly string[]>;
	resolveLocalSkillSpec(request: AregSkillKindResolveRequest): Promise<AregSkillKindResolveResult>;
	preflightWriteTextFile(request: AregProjectTextWriteRequest): Promise<AregProjectMutationResult>;
	preflightDeleteFile(request: AregProjectFileDeleteRequest): Promise<AregProjectMutationResult>;
	preflightRemoveEmptyDir(request: AregProjectRemoveEmptyDirRequest): Promise<AregProjectMutationResult>;
	writeTextFile(request: AregProjectTextWriteRequest): Promise<AregProjectMutationResult>;
	deleteFile(request: AregProjectFileDeleteRequest): Promise<AregProjectMutationResult>;
	removeEmptyDir(request: AregProjectRemoveEmptyDirRequest): Promise<AregProjectRemoveEmptyDirResult>;
}

export interface AregInitTextWritePlan {
	relativePath: "asdl.toml" | "AGENTS.md" | "CLAUDE.md" | ".claude/settings.local.json";
	content: string;
	description: string;
	createParent: boolean;
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
