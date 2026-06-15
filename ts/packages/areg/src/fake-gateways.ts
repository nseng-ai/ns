import type {
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
	AregInitApplyResult,
	AregInitPathState,
	AregInitProjectGateway,
	AregInitProjectInspectionRequest,
	AregInitProjectInspectionResult,
	AregInitTextFileState,
	AregInitTextWritePlanRequest,
	AregNpxSkillsAddRequest,
	AregNpxSkillsAddResult,
	AregNpxSkillsGateway,
	AregOperationResult,
	AregPromptGateway,
	AregSkillxInstallRequest,
	AregSkillxInstallResult,
	AregSkillxInstalledSkill,
	AregSkillxWorkspaceCleanupRequest,
	AregSkillxWorkspaceGateway,
	AregToolCheckResult,
	AregUpdatePathState,
	AregUpdateProjectGateway,
	AregUpdateProjectInspectionRequest,
	AregUpdateProjectInspectionResult,
	AregUpdateTextFileState,
} from "./gateways.ts";

export type FakeAregCheckProjectInspectionOperation = { type: "inspect-project-for-check"; cwd: string; projectPath: string };

export interface FakeAregCheckSkillOptions {
	name: string;
	skillsPath?: AregCheckPathState | undefined;
	agentsPath?: AregCheckPathState | undefined;
	claudePath?: AregCheckPathState | undefined;
	localSkillMd?: AregCheckTextFileState | undefined;
	remoteSkillMd?: AregCheckTextFileState | undefined;
	openaiPolicy?: AregCheckTextFileState | undefined;
}

export interface FakeAregCheckProjectInspectionGatewayOptions {
	projectDir?: string | undefined;
	projectPathState?: AregCheckPathState | undefined;
	lockfile?: AregCheckTextFileState | object | string | undefined;
	skillsDirectoryNames?: readonly string[] | undefined;
	agentsSkillNames?: readonly string[] | undefined;
	excludedSkillNames?: readonly string[] | undefined;
	piSettings?: AregCheckTextFileState | object | string | undefined;
	genericReplacement?: { hasAdapter?: boolean | undefined; hasPackageModule?: boolean | undefined } | undefined;
	skills?: readonly FakeAregCheckSkillOptions[] | undefined;
	pairingDirectories?: readonly AregCheckPairingDirectory[] | undefined;
}

export class FakeAregCheckProjectInspectionGateway implements AregCheckProjectInspectionGateway {
	private readonly result: AregCheckProjectInspectionResult;
	private readonly log: FakeAregCheckProjectInspectionOperation[] = [];

	constructor(options: FakeAregCheckProjectInspectionGatewayOptions = {}) {
		this.result = {
			projectDir: options.projectDir ?? "/repo",
			projectPathState: copyPathState(options.projectPathState ?? { type: "directory" }),
			lockfile: normalizeTextFileState(options.lockfile ?? { version: 1, skills: {} }),
			skillsDirectoryNames: [...(options.skillsDirectoryNames ?? [])],
			agentsSkillNames: [...(options.agentsSkillNames ?? [])],
			excludedSkillNames: [...(options.excludedSkillNames ?? [])],
			piSettings: normalizeTextFileState(options.piSettings ?? { type: "missing" }),
			genericReplacement: {
				hasAdapter: options.genericReplacement?.hasAdapter ?? false,
				hasPackageModule: options.genericReplacement?.hasPackageModule ?? false,
			},
			skills: (options.skills ?? []).map(copyFakeCheckSkill),
			pairingDirectories: (options.pairingDirectories ?? []).map(copyPairingDirectory),
		};
	}

	async inspectProjectForCheck(request: AregCheckProjectInspectionRequest): Promise<AregCheckProjectInspectionResult> {
		this.log.push({ type: "inspect-project-for-check", cwd: request.cwd, projectPath: request.projectPath });
		return copyCheckProjectInspectionResult(this.result);
	}

	operations(): readonly FakeAregCheckProjectInspectionOperation[] {
		return this.log.map((operation) => ({ ...operation }));
	}
}

export type FakeAregHostOperation = { type: "check-tool"; tool: AregHostToolName; cwd: string };

export interface FakeAregHostGatewayOptions {
	tools?: Partial<Record<AregHostToolName, string | null>> | undefined;
}

export class FakeAregHostGateway implements AregHostGateway {
	private readonly tools: ReadonlyMap<AregHostToolName, string | null>;
	private readonly log: FakeAregHostOperation[] = [];

	constructor(options: FakeAregHostGatewayOptions = {}) {
		this.tools = new Map(Object.entries(options.tools ?? {}) as Array<[AregHostToolName, string | null]>);
	}

	async checkTool(options: { tool: AregHostToolName; cwd: string; env: NodeJS.ProcessEnv }): Promise<AregToolCheckResult> {
		this.log.push({ type: "check-tool", tool: options.tool, cwd: options.cwd });
		const path = this.tools.get(options.tool);
		if (path === null) return { type: "missing", tool: options.tool, message: `Required host tool is missing: ${options.tool}` };
		return { type: "found", tool: options.tool, path: path ?? `/fake/bin/${options.tool}` };
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
	failure?: AregErrorInfo | undefined;
	failures?: Readonly<Record<string, AregErrorInfo>> | undefined;
}

export class FakeAregNpxSkillsGateway implements AregNpxSkillsGateway {
	private readonly failure: AregErrorInfo | undefined;
	private readonly failures: ReadonlyMap<string, AregErrorInfo>;
	private readonly log: FakeAregNpxSkillsOperation[] = [];

	constructor(options: FakeAregNpxSkillsGatewayOptions = {}) {
		this.failure = options.failure === undefined ? undefined : copyErrorInfo(options.failure);
		this.failures = new Map(Object.entries(options.failures ?? {}).map(([key, value]) => [key, copyErrorInfo(value)]));
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
		const keyedFailure = this.failures.get(failureKey(request.sourceRepo, request.skillNames));
		if (keyedFailure !== undefined) return { type: "error", error: copyErrorInfo(keyedFailure) };
		return { type: "ok" };
	}

	operations(): readonly FakeAregNpxSkillsOperation[] {
		return this.log.map((operation) => ({ ...operation, skillNames: [...operation.skillNames], targetAgents: [...operation.targetAgents] }));
	}
}

export type FakeAregUpdateOperation = { type: "inspect-project-for-update"; cwd: string; projectPath: string };

export interface FakeAregUpdateProjectGatewayOptions {
	projectDir?: string | undefined;
	projectPathState?: AregUpdatePathState | undefined;
	lockfile?: AregUpdateTextFileState | object | string | undefined;
	asdlToml?: AregUpdateTextFileState | string | undefined;
	aregJson?: AregUpdateTextFileState | object | string | undefined;
}

export class FakeAregUpdateProjectGateway implements AregUpdateProjectGateway {
	private readonly result: AregUpdateProjectInspectionResult;
	private readonly log: FakeAregUpdateOperation[] = [];

	constructor(options: FakeAregUpdateProjectGatewayOptions = {}) {
		this.result = {
			projectDir: options.projectDir ?? "/repo",
			projectPathState: copyPathState(options.projectPathState ?? { type: "directory" }),
			lockfile: normalizeTextFileState(options.lockfile ?? { version: 1, skills: {} }),
			asdlToml: normalizeTextFileState(options.asdlToml ?? { type: "missing" }),
			aregJson: normalizeTextFileState(options.aregJson ?? { type: "missing" }),
		};
	}

	async inspectProjectForUpdate(request: AregUpdateProjectInspectionRequest): Promise<AregUpdateProjectInspectionResult> {
		this.log.push({ type: "inspect-project-for-update", cwd: request.cwd, projectPath: request.projectPath });
		return copyUpdateProjectInspectionResult(this.result);
	}

	operations(): readonly FakeAregUpdateOperation[] {
		return this.log.map((operation) => ({ ...operation }));
	}
}

export type FakeAregPromptOperation = { type: "confirm"; message: string; defaultValue: boolean; response: boolean };

export interface FakeAregPromptGatewayOptions {
	responses?: readonly boolean[] | undefined;
	shouldConfirmByDefault?: boolean | undefined;
}

export class FakeAregPromptGateway implements AregPromptGateway {
	private readonly responses: boolean[];
	private readonly shouldConfirmByDefault: boolean;
	private readonly log: FakeAregPromptOperation[] = [];

	constructor(options: FakeAregPromptGatewayOptions = {}) {
		this.responses = [...(options.responses ?? [])];
		this.shouldConfirmByDefault = options.shouldConfirmByDefault ?? false;
	}

	async confirm(request: { message: string; defaultValue: boolean }): Promise<boolean> {
		const response = this.responses.shift() ?? this.shouldConfirmByDefault;
		this.log.push({ type: "confirm", message: request.message, defaultValue: request.defaultValue, response });
		return response;
	}

	operations(): readonly FakeAregPromptOperation[] {
		return this.log.map((operation) => ({ ...operation }));
	}
}

export type FakeAregInitOperation =
	| ({ type: "inspect-project-for-init" } & Omit<AregInitProjectInspectionRequest, "env">)
	| ({ type: "apply-text-write-plan" } & Omit<AregInitTextWritePlanRequest, "env">);

export interface FakeAregInitProjectGatewayOptions {
	projectDir?: string | undefined;
	targetPathState?: AregInitPathState | undefined;
	agentsMd?: AregInitTextFileState | string | undefined;
	claudeMd?: AregInitTextFileState | string | undefined;
	asdlToml?: AregInitTextFileState | string | undefined;
	aregJson?: AregInitTextFileState | object | string | undefined;
	claudeDir?: AregInitPathState | undefined;
	claudeSettings?: AregInitTextFileState | string | undefined;
	applyFailure?: AregErrorInfo | undefined;
}

export class FakeAregInitProjectGateway implements AregInitProjectGateway {
	private readonly projectDir: string;
	private readonly targetPathState: AregInitPathState;
	private readonly files: Map<string, AregInitTextFileState>;
	private readonly claudeDir: AregInitPathState;
	private readonly applyFailure: AregErrorInfo | undefined;
	private readonly log: FakeAregInitOperation[] = [];

	constructor(options: FakeAregInitProjectGatewayOptions = {}) {
		this.projectDir = options.projectDir ?? "/repo";
		this.targetPathState = copyPathState(options.targetPathState ?? { type: "directory" });
		this.files = new Map([
			["AGENTS.md", normalizeTextFileState(options.agentsMd ?? { type: "missing" })],
			["CLAUDE.md", normalizeTextFileState(options.claudeMd ?? { type: "missing" })],
			["asdl.toml", normalizeTextFileState(options.asdlToml ?? { type: "missing" })],
			["areg.json", normalizeTextFileState(options.aregJson ?? { type: "missing" })],
			[".claude/settings.local.json", normalizeTextFileState(options.claudeSettings ?? { type: "missing" })],
		]);
		this.claudeDir = copyPathState(options.claudeDir ?? { type: "missing" });
		this.applyFailure = options.applyFailure === undefined ? undefined : copyErrorInfo(options.applyFailure);
	}

	async inspectProjectForInit(request: AregInitProjectInspectionRequest): Promise<AregInitProjectInspectionResult> {
		this.log.push({ type: "inspect-project-for-init", cwd: request.cwd, target: request.target });
		return {
			projectDir: this.projectDir,
			targetPathState: copyPathState(this.targetPathState),
			agentsMd: this.fileState("AGENTS.md"),
			claudeMd: this.fileState("CLAUDE.md"),
			asdlToml: this.fileState("asdl.toml"),
			aregJson: this.fileState("areg.json"),
			claudeDir: copyPathState(this.claudeDir),
			claudeSettings: this.fileState(".claude/settings.local.json"),
		};
	}

	async applyTextWritePlan(request: AregInitTextWritePlanRequest): Promise<AregInitApplyResult> {
		this.log.push({
			type: "apply-text-write-plan",
			projectDir: request.projectDir,
			writes: request.writes.map((write) => ({ ...write })),
		});
		if (this.applyFailure !== undefined) return { ok: false, error: copyErrorInfo(this.applyFailure) };
		const writtenRelativePaths: string[] = [];
		for (const write of request.writes) {
			this.files.set(write.relativePath, { type: "file", text: write.content });
			writtenRelativePaths.push(write.relativePath);
		}
		return { ok: true, writtenRelativePaths };
	}

	text(relativePath: "asdl.toml" | "AGENTS.md" | "CLAUDE.md" | ".claude/settings.local.json" | "areg.json"): string | undefined {
		const state = this.files.get(relativePath);
		return state?.type === "file" ? state.text : undefined;
	}

	operations(): readonly FakeAregInitOperation[] {
		return this.log.map((operation) =>
			operation.type === "apply-text-write-plan"
				? { ...operation, writes: operation.writes.map((write) => ({ ...write })) }
				: { ...operation },
		);
	}

	private fileState(relativePath: string): AregInitTextFileState {
		return copyTextFileState(this.files.get(relativePath) ?? { type: "missing" });
	}
}

export type FakeAregSkillxOperation =
	| ({ type: "install-into-workspace" } & Omit<AregSkillxInstallRequest, "env">)
	| ({ type: "cleanup-workspace" } & Omit<AregSkillxWorkspaceCleanupRequest, "env">);

export interface FakeAregSkillxWorkspaceGatewayOptions {
	workspaceRoot?: string | undefined;
	installedSkills?: readonly AregSkillxInstalledSkill[] | undefined;
	failure?: AregErrorInfo | undefined;
	cleanupFailure?: AregErrorInfo | undefined;
}

export class FakeAregSkillxWorkspaceGateway implements AregSkillxWorkspaceGateway {
	private readonly workspaceRoot: string;
	private readonly installedSkills: readonly AregSkillxInstalledSkill[];
	private readonly failure: AregErrorInfo | undefined;
	private readonly cleanupFailure: AregErrorInfo | undefined;
	private readonly log: FakeAregSkillxOperation[] = [];

	constructor(options: FakeAregSkillxWorkspaceGatewayOptions = {}) {
		this.workspaceRoot = options.workspaceRoot ?? "/tmp/areg-skillx";
		this.installedSkills = (options.installedSkills ?? []).map(copyInstalledSkill);
		this.failure = options.failure === undefined ? undefined : copyErrorInfo(options.failure);
		this.cleanupFailure = options.cleanupFailure === undefined ? undefined : copyErrorInfo(options.cleanupFailure);
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

	async cleanupWorkspace(request: AregSkillxWorkspaceCleanupRequest): Promise<AregOperationResult> {
		this.log.push({ type: "cleanup-workspace", workspaceRoot: request.workspaceRoot, cwd: request.cwd });
		if (this.cleanupFailure !== undefined) return { ok: false, error: copyErrorInfo(this.cleanupFailure) };
		return { ok: true };
	}

	operations(): readonly FakeAregSkillxOperation[] {
		return this.log.map((operation) => ({ ...operation }));
	}
}

function failureKey(sourceRepo: string, skillNames: readonly string[]): string {
	return `${sourceRepo}:${skillNames.join(",")}`;
}

function copyCheckProjectInspectionResult(result: AregCheckProjectInspectionResult): AregCheckProjectInspectionResult {
	return {
		projectDir: result.projectDir,
		projectPathState: copyPathState(result.projectPathState),
		lockfile: copyTextFileState(result.lockfile),
		skillsDirectoryNames: [...result.skillsDirectoryNames],
		agentsSkillNames: [...result.agentsSkillNames],
		excludedSkillNames: [...result.excludedSkillNames],
		piSettings: copyTextFileState(result.piSettings),
		genericReplacement: { ...result.genericReplacement },
		skills: result.skills.map(copyCheckSkill),
		pairingDirectories: result.pairingDirectories.map(copyPairingDirectory),
	};
}

function copyUpdateProjectInspectionResult(result: AregUpdateProjectInspectionResult): AregUpdateProjectInspectionResult {
	return {
		projectDir: result.projectDir,
		projectPathState: copyPathState(result.projectPathState),
		lockfile: copyTextFileState(result.lockfile),
		asdlToml: copyTextFileState(result.asdlToml),
		aregJson: copyTextFileState(result.aregJson),
	};
}

function copyFakeCheckSkill(skill: FakeAregCheckSkillOptions): AregCheckSkillInspection {
	return {
		name: skill.name,
		skillsPath: copyPathState(skill.skillsPath ?? { type: "missing" }),
		agentsPath: copyPathState(skill.agentsPath ?? { type: "missing" }),
		claudePath: copyPathState(skill.claudePath ?? { type: "missing" }),
		localSkillMd: copyTextFileState(skill.localSkillMd ?? { type: "missing" }),
		remoteSkillMd: copyTextFileState(skill.remoteSkillMd ?? { type: "missing" }),
		openaiPolicy: copyTextFileState(skill.openaiPolicy ?? { type: "missing" }),
	};
}

function copyCheckSkill(skill: AregCheckSkillInspection): AregCheckSkillInspection {
	return {
		name: skill.name,
		skillsPath: copyPathState(skill.skillsPath),
		agentsPath: copyPathState(skill.agentsPath),
		claudePath: copyPathState(skill.claudePath),
		localSkillMd: copyTextFileState(skill.localSkillMd),
		remoteSkillMd: copyTextFileState(skill.remoteSkillMd),
		openaiPolicy: copyTextFileState(skill.openaiPolicy),
	};
}

function normalizeTextFileState(value: AregCheckTextFileState | object | string): AregCheckTextFileState {
	if (typeof value === "string") return { type: "file", text: value };
	if ("type" in value) return copyTextFileState(value as AregCheckTextFileState);
	return { type: "file", text: `${JSON.stringify(value, null, 2)}\n` };
}

function copyTextFileState(state: AregCheckTextFileState): AregCheckTextFileState {
	return { ...state };
}

function copyPathState(state: AregCheckPathState): AregCheckPathState {
	return { ...state };
}

function copyPairingDirectory(directory: AregCheckPairingDirectory): AregCheckPairingDirectory {
	return {
		relativeDir: directory.relativeDir,
		hasAgents: directory.hasAgents,
		hasClaude: directory.hasClaude,
		claudeText: directory.claudeText,
	};
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
