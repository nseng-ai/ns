import type {
	AregErrorInfo,
	AregGithubGateway,
	AregGithubSkillListResult,
	AregGitRootResult,
	AregHostGateway,
	AregHostToolName,
	AregNpxSkillsAddRequest,
	AregNpxSkillsAddResult,
	AregNpxSkillsGateway,
	AregSkillxInstallRequest,
	AregSkillxInstallResult,
	AregSkillxInstalledSkill,
	AregSkillxWorkspaceGateway,
	AregToolCheckResult,
} from "./gateways.ts";

export type FakeAregHostOperation =
	| { type: "check-tool"; tool: AregHostToolName; cwd: string }
	| { type: "resolve-git-root"; cwd: string };

export interface FakeAregHostGatewayOptions {
	tools?: Partial<Record<AregHostToolName, string | null>> | undefined;
	gitRoot?: string | null | AregErrorInfo | undefined;
}

export class FakeAregHostGateway implements AregHostGateway {
	private readonly tools: ReadonlyMap<AregHostToolName, string | null>;
	private readonly gitRoot: string | null | AregErrorInfo;
	private readonly log: FakeAregHostOperation[] = [];

	constructor(options: FakeAregHostGatewayOptions = {}) {
		this.tools = new Map(Object.entries(options.tools ?? {}) as Array<[AregHostToolName, string | null]>);
		this.gitRoot = copyGitRootOption(options.gitRoot);
	}

	async checkTool(options: { tool: AregHostToolName; cwd: string; env: NodeJS.ProcessEnv }): Promise<AregToolCheckResult> {
		this.log.push({ type: "check-tool", tool: options.tool, cwd: options.cwd });
		const path = this.tools.get(options.tool);
		if (path === null) return { type: "missing", tool: options.tool, message: `Required host tool is missing: ${options.tool}` };
		return { type: "found", tool: options.tool, path: path ?? `/fake/bin/${options.tool}` };
	}

	async resolveGitRoot(options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<AregGitRootResult> {
		this.log.push({ type: "resolve-git-root", cwd: options.cwd });
		if (this.gitRoot === null) return { type: "not-a-git-repo", message: `Not inside a git repository: ${options.cwd}` };
		if (typeof this.gitRoot === "string") return { type: "found", repoRoot: this.gitRoot };
		return { type: "error", error: copyErrorInfo(this.gitRoot) };
	}

	operations(): readonly FakeAregHostOperation[] {
		return this.log.map((operation) => ({ ...operation }));
	}
}

export type FakeAregGithubOperation = { type: "list-skill-directory-names"; repo: string; ref?: string | undefined };

export interface FakeAregGithubGatewayOptions {
	repos?: Record<string, readonly string[] | "missing" | "auth-error" | AregErrorInfo> | undefined;
}

export class FakeAregGithubGateway implements AregGithubGateway {
	private readonly repos: ReadonlyMap<string, readonly string[] | "missing" | "auth-error" | AregErrorInfo>;
	private readonly log: FakeAregGithubOperation[] = [];

	constructor(options: FakeAregGithubGatewayOptions = {}) {
		this.repos = new Map(Object.entries(options.repos ?? {}).map(([repo, value]) => [repo, copyGithubState(value)]));
	}

	async listSkillDirectoryNames(options: { repo: string; ref?: string | undefined; env: NodeJS.ProcessEnv }): Promise<AregGithubSkillListResult> {
		this.log.push({ type: "list-skill-directory-names", repo: options.repo, ref: options.ref });
		const state = this.repos.get(options.repo);
		if (state === undefined || state === "missing") return { type: "missing", message: `Skill source not found: ${options.repo}` };
		if (state === "auth-error") return { type: "auth-error", message: `GitHub authentication failed for ${options.repo}` };
		if (isReadonlyStringArray(state)) return { type: "ok", skillNames: [...state] };
		return { type: "error", error: copyErrorInfo(state) };
	}

	operations(): readonly FakeAregGithubOperation[] {
		return this.log.map((operation) => ({ ...operation }));
	}
}

export type FakeAregNpxSkillsOperation = { type: "add-skills" } & Omit<AregNpxSkillsAddRequest, "env">;

export interface FakeAregNpxSkillsGatewayOptions {
	installedSkillNames?: readonly string[] | undefined;
	failure?: AregErrorInfo | undefined;
}

export class FakeAregNpxSkillsGateway implements AregNpxSkillsGateway {
	private readonly installedSkillNames: readonly string[];
	private readonly failure: AregErrorInfo | undefined;
	private readonly log: FakeAregNpxSkillsOperation[] = [];

	constructor(options: FakeAregNpxSkillsGatewayOptions = {}) {
		this.installedSkillNames = [...(options.installedSkillNames ?? [])];
		this.failure = options.failure === undefined ? undefined : copyErrorInfo(options.failure);
	}

	async addSkills(request: AregNpxSkillsAddRequest): Promise<AregNpxSkillsAddResult> {
		this.log.push({
			type: "add-skills",
			sourceRepo: request.sourceRepo,
			skillNames: [...request.skillNames],
			targetAgents: [...request.targetAgents],
			cwd: request.cwd,
		});
		if (this.failure !== undefined) return { type: "error", error: copyErrorInfo(this.failure) };
		return { type: "ok", installedSkillNames: [...this.installedSkillNames] };
	}

	operations(): readonly FakeAregNpxSkillsOperation[] {
		return this.log.map((operation) => ({ ...operation, skillNames: [...operation.skillNames], targetAgents: [...operation.targetAgents] }));
	}
}

export type FakeAregSkillxOperation = { type: "install-into-workspace" } & Omit<AregSkillxInstallRequest, "env">;

export interface FakeAregSkillxWorkspaceGatewayOptions {
	workspaceRoot?: string | undefined;
	installedSkills?: readonly AregSkillxInstalledSkill[] | undefined;
	failure?: AregErrorInfo | undefined;
}

export class FakeAregSkillxWorkspaceGateway implements AregSkillxWorkspaceGateway {
	private readonly workspaceRoot: string;
	private readonly installedSkills: readonly AregSkillxInstalledSkill[];
	private readonly failure: AregErrorInfo | undefined;
	private readonly log: FakeAregSkillxOperation[] = [];

	constructor(options: FakeAregSkillxWorkspaceGatewayOptions = {}) {
		this.workspaceRoot = options.workspaceRoot ?? "/tmp/areg-skillx";
		this.installedSkills = (options.installedSkills ?? []).map(copyInstalledSkill);
		this.failure = options.failure === undefined ? undefined : copyErrorInfo(options.failure);
	}

	async installIntoWorkspace(request: AregSkillxInstallRequest): Promise<AregSkillxInstallResult> {
		this.log.push({ type: "install-into-workspace", sourceRepo: request.sourceRepo, skillName: request.skillName, cwd: request.cwd });
		if (this.failure !== undefined) return { type: "error", error: copyErrorInfo(this.failure) };
		return {
			type: "ok",
			workspace: {
				workspaceRoot: this.workspaceRoot,
				installedSkills: this.installedSkills.map(copyInstalledSkill),
			},
		};
	}

	operations(): readonly FakeAregSkillxOperation[] {
		return this.log.map((operation) => ({ ...operation }));
	}
}

function copyGitRootOption(value: string | null | AregErrorInfo | undefined): string | null | AregErrorInfo {
	if (value === undefined) return "/repo";
	if (value === null || typeof value === "string") return value;
	return copyErrorInfo(value);
}

function copyGithubState(value: readonly string[] | "missing" | "auth-error" | AregErrorInfo): readonly string[] | "missing" | "auth-error" | AregErrorInfo {
	if (isReadonlyStringArray(value)) return [...value];
	if (value === "missing" || value === "auth-error") return value;
	return copyErrorInfo(value);
}

function isReadonlyStringArray(value: readonly string[] | "missing" | "auth-error" | AregErrorInfo): value is readonly string[] {
	return Array.isArray(value);
}

function copyInstalledSkill(skill: AregSkillxInstalledSkill): AregSkillxInstalledSkill {
	return {
		name: skill.name,
		directory: skill.directory,
		skillFile: skill.skillFile,
		relativeFiles: [...skill.relativeFiles],
	};
}

function copyErrorInfo(error: AregErrorInfo): AregErrorInfo {
	return { code: error.code, message: error.message, displayCommand: error.displayCommand };
}
