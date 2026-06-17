import { resultErr, resultOk } from "@asdl/core/result";

import type {
	AregCheckPairingDirectory,
	AregCheckSkillInspection,
	AregErrorInfo,
	AregGithubGateway,
	AregGithubSkillListResult,
	AregHostGateway,
	AregHostToolName,
	AregNpxSkillsAddRequest,
	AregNpxSkillsAddResult,
	AregNpxSkillsGateway,
	AregOperationResult,
	AregPathState,
	AregProjectBaseInspection,
	AregProjectDirRequest,
	AregProjectFileDeleteRequest,
	AregProjectGateway,
	AregProjectInspectionRequest,
	AregProjectMutationResult,
	AregProjectRemoveEmptyDirRequest,
	AregProjectRemoveEmptyDirResult,
	AregProjectTextWriteRequest,
	AregPromptGateway,
	AregSkillInspectionRequest,
	AregSkillKindResolveRequest,
	AregSkillKindResolveResult,
	AregSkillKindSkillInspection,
	AregSkillxInstallRequest,
	AregSkillxInstallResult,
	AregSkillxInstalledSkill,
	AregSkillxWorkspaceCleanupRequest,
	AregSkillxWorkspaceGateway,
	AregTextFileState,
	AregToolCheckResult,
} from "./gateways.ts";

export type FakeAregProjectOperation =
	| { type: "inspect-project-base"; cwd: string; projectPath: string }
	| { type: "inspect-instruction-files"; projectDir: string }
	| { type: "inspect-pi-artifacts"; projectDir: string }
	| { type: "inspect-skill-name-inventory"; projectDir: string }
	| { type: "inspect-check-skill"; projectDir: string; skillName: string }
	| { type: "inspect-local-skill"; projectDir: string; skillName: string }
	| { type: "inspect-pairing-directories"; projectDir: string }
	| { type: "read-locally-excluded-skill-names"; projectDir: string }
	| { type: "resolve-local-skill-spec"; projectDir: string; spec: string; cwd: string }
	| ({ type: "write-text-file" } & Omit<AregProjectTextWriteRequest, "env">)
	| ({ type: "delete-file" } & Omit<AregProjectFileDeleteRequest, "env">)
	| ({ type: "remove-empty-dir" } & Omit<AregProjectRemoveEmptyDirRequest, "env">);

export interface FakeAregCheckSkillOptions {
	name: string;
	skillsPath?: AregPathState | undefined;
	agentsPath?: AregPathState | undefined;
	claudePath?: AregPathState | undefined;
	localSkillMd?: AregTextFileState | string | undefined;
	remoteSkillMd?: AregTextFileState | string | undefined;
	openaiPolicy?: AregTextFileState | string | undefined;
}

export interface FakeAregSkillKindSkillOptions {
	name: string;
	skillDir?: AregPathState | undefined;
	skillMd?: AregTextFileState | string | undefined;
	openaiPolicy?: AregTextFileState | string | undefined;
}

export interface FakeAregProjectGatewayOptions {
	projectDir?: string | undefined;
	projectPathState?: AregPathState | undefined;
	targetPathState?: AregPathState | undefined;
	lockfile?: AregTextFileState | object | string | undefined;
	asdlToml?: AregTextFileState | string | undefined;
	aregJson?: AregTextFileState | object | string | undefined;
	agentsMd?: AregTextFileState | string | undefined;
	claudeMd?: AregTextFileState | string | undefined;
	claudeDir?: AregPathState | undefined;
	claudeSettings?: AregTextFileState | string | undefined;
	piDir?: AregPathState | undefined;
	piSettings?: AregTextFileState | object | string | undefined;
	replacementSurfaces?: readonly string[] | undefined;
	skillsDirectoryNames?: readonly string[] | undefined;
	agentsSkillNames?: readonly string[] | undefined;
	claudeSkillNames?: readonly string[] | undefined;
	excludedSkillNames?: readonly string[] | undefined;
	checkSkills?: readonly FakeAregCheckSkillOptions[] | undefined;
	localSkills?: readonly FakeAregSkillKindSkillOptions[] | undefined;
	pairingDirectories?: readonly AregCheckPairingDirectory[] | undefined;
	resolveFailures?: Readonly<Record<string, AregErrorInfo>> | undefined;
	mutationFailures?: Readonly<Record<string, AregErrorInfo>> | undefined;
	applyFailure?: AregErrorInfo | undefined;
}

export class FakeAregProjectGateway implements AregProjectGateway {
	private readonly projectDir: string;
	private readonly projectPathState: AregPathState;
	private readonly files: Map<string, AregTextFileState>;
	private readonly claudeDir: AregPathState;
	private readonly piDir: AregPathState;
	private readonly replacementSurfaces: readonly string[];
	private readonly skillsDirectoryNames: readonly string[];
	private readonly agentsSkillNames: readonly string[];
	private readonly claudeSkillNames: readonly string[];
	private readonly excludedSkillNames: readonly string[];
	private readonly checkSkills: AregCheckSkillInspection[];
	private readonly localSkills: AregSkillKindSkillInspection[];
	private readonly pairingDirectories: readonly AregCheckPairingDirectory[];
	private readonly resolveFailures: ReadonlyMap<string, AregErrorInfo>;
	private readonly mutationFailures: ReadonlyMap<string, AregErrorInfo>;
	private readonly log: FakeAregProjectOperation[] = [];

	constructor(options: FakeAregProjectGatewayOptions = {}) {
		this.projectDir = options.projectDir ?? "/repo";
		this.projectPathState = copyPathState(options.projectPathState ?? options.targetPathState ?? { type: "directory" });
		this.files = new Map([
			["skills-lock.json", normalizeTextFileState(options.lockfile ?? { version: 1, skills: {} })],
			["asdl.toml", normalizeTextFileState(options.asdlToml ?? { type: "missing" })],
			["areg.json", normalizeTextFileState(options.aregJson ?? { type: "missing" })],
			["AGENTS.md", normalizeTextFileState(options.agentsMd ?? { type: "missing" })],
			["CLAUDE.md", normalizeTextFileState(options.claudeMd ?? { type: "missing" })],
			[".claude/settings.local.json", normalizeTextFileState(options.claudeSettings ?? { type: "missing" })],
			[".pi/settings.json", normalizeTextFileState(options.piSettings ?? { type: "missing" })],
		]);
		this.claudeDir = copyPathState(options.claudeDir ?? { type: "missing" });
		this.piDir = copyPathState(options.piDir ?? { type: "missing" });
		this.replacementSurfaces = [...(options.replacementSurfaces ?? [])];
		this.skillsDirectoryNames = [...(options.skillsDirectoryNames ?? [])];
		this.agentsSkillNames = [...(options.agentsSkillNames ?? [])];
		this.claudeSkillNames = [...(options.claudeSkillNames ?? [])];
		this.excludedSkillNames = [...(options.excludedSkillNames ?? [])];
		this.checkSkills = (options.checkSkills ?? []).map(copyFakeCheckSkill);
		this.localSkills = (options.localSkills ?? []).map(copyFakeSkillKindSkill);
		this.pairingDirectories = (options.pairingDirectories ?? []).map(copyPairingDirectory);
		this.resolveFailures = new Map(Object.entries(options.resolveFailures ?? {}).map(([key, value]) => [key, copyErrorInfo(value)]));
		const mutationFailures = options.applyFailure === undefined ? options.mutationFailures : { ...(options.mutationFailures ?? {}), "*": options.applyFailure };
		this.mutationFailures = new Map(Object.entries(mutationFailures ?? {}).map(([key, value]) => [key, copyErrorInfo(value)]));
	}

	async inspectProjectBase(request: AregProjectInspectionRequest): Promise<AregProjectBaseInspection> {
		this.log.push({ type: "inspect-project-base", cwd: request.cwd, projectPath: request.projectPath });
		return {
			projectDir: this.projectDir,
			projectPathState: copyPathState(this.projectPathState),
			lockfile: this.fileState("skills-lock.json"),
			asdlToml: this.fileState("asdl.toml"),
			aregJson: this.fileState("areg.json"),
		};
	}

	async inspectInstructionFiles(request: AregProjectDirRequest) {
		this.log.push({ type: "inspect-instruction-files", projectDir: request.projectDir });
		return {
			agentsMd: this.fileState("AGENTS.md"),
			claudeMd: this.fileState("CLAUDE.md"),
			claudeDir: copyPathState(this.claudeDir),
			claudeSettings: this.fileState(".claude/settings.local.json"),
		};
	}

	async inspectPiArtifacts(request: AregProjectDirRequest) {
		this.log.push({ type: "inspect-pi-artifacts", projectDir: request.projectDir });
		return {
			piDir: copyPathState(this.piDir),
			piSettings: this.fileState(".pi/settings.json"),
			replacement: { verifiedSurfaces: [...this.replacementSurfaces] },
		};
	}

	async inspectSkillNameInventory(request: AregProjectDirRequest) {
		this.log.push({ type: "inspect-skill-name-inventory", projectDir: request.projectDir });
		return {
			skillsDirectoryNames: [...this.skillsDirectoryNames],
			agentsSkillNames: [...this.agentsSkillNames],
			claudeSkillNames: [...this.claudeSkillNames],
			localSkillKindNames: this.localSkills.map((skill) => skill.name),
		};
	}

	async inspectCheckSkill(request: AregSkillInspectionRequest): Promise<AregCheckSkillInspection> {
		this.log.push({ type: "inspect-check-skill", projectDir: request.projectDir, skillName: request.skillName });
		const skill = this.checkSkills.find((candidate) => candidate.name === request.skillName);
		return skill === undefined ? missingCheckSkill(request.skillName) : copyCheckSkill(skill);
	}

	async inspectLocalSkill(request: AregSkillInspectionRequest): Promise<AregSkillKindSkillInspection> {
		this.log.push({ type: "inspect-local-skill", projectDir: request.projectDir, skillName: request.skillName });
		const skill = this.localSkills.find((candidate) => candidate.name === request.skillName);
		return skill === undefined ? missingLocalSkill(request.skillName) : copySkillKindSkill(skill);
	}

	async inspectPairingDirectories(request: AregProjectDirRequest): Promise<readonly AregCheckPairingDirectory[]> {
		this.log.push({ type: "inspect-pairing-directories", projectDir: request.projectDir });
		return this.pairingDirectories.map(copyPairingDirectory);
	}

	async readLocallyExcludedSkillNames(request: AregProjectDirRequest): Promise<readonly string[]> {
		this.log.push({ type: "read-locally-excluded-skill-names", projectDir: request.projectDir });
		return [...this.excludedSkillNames];
	}

	async resolveLocalSkillSpec(request: AregSkillKindResolveRequest): Promise<AregSkillKindResolveResult> {
		this.log.push({ type: "resolve-local-skill-spec", projectDir: request.projectDir, spec: request.spec, cwd: request.cwd });
		const failure = this.resolveFailures.get(request.spec);
		if (failure !== undefined) return { type: "error", error: copyErrorInfo(failure) };
		const skillName = fakeResolveSkillName(request.spec);
		const skill = this.localSkills.find((candidate) => candidate.name === skillName);
		if (skill === undefined) return { type: "error", error: { code: "skill-kind-missing-skill", message: `Local skill not found: ${request.spec}` } };
		if (skill.skillDir.type === "symlink") return { type: "error", error: { code: "skill-kind-symlink-skill-dir", message: `skills/${skillName} is a symlink but should be a real directory (canonical source)` } };
		if (skill.skillDir.type !== "directory") return { type: "error", error: { code: "skill-kind-missing-skill", message: `Local skill not found: ${request.spec}` } };
		if (skill.skillMd.type === "symlink") return { type: "error", error: { code: "skill-kind-symlink-skill-md", message: `skills/${skillName}/SKILL.md is a symlink but should be a real file (canonical source)` } };
		if (skill.skillMd.type !== "file") return { type: "error", error: { code: "skill-kind-missing-skill-md", message: `skills/${skillName}/SKILL.md does not exist` } };
		return { type: "ok", skillName };
	}

	async writeTextFile(request: AregProjectTextWriteRequest): Promise<AregProjectMutationResult> {
		this.log.push({
			type: "write-text-file",
			projectDir: request.projectDir,
			relativePath: request.relativePath,
			content: request.content,
			description: request.description,
			createParent: request.createParent,
			policy: request.policy,
		});
		const failure = this.mutationFailure(request.relativePath);
		if (failure !== undefined) return { ok: false, error: failure };
		this.files.set(request.relativePath, { type: "file", text: request.content });
		const skill = skillForRelativePath(this.localSkills, request.relativePath);
		if (skill !== undefined && request.relativePath.endsWith("/SKILL.md")) skill.skillMd = { type: "file", text: request.content };
		if (skill !== undefined && request.relativePath.endsWith("/agents/openai.yaml")) skill.openaiPolicy = { type: "file", text: request.content };
		return { ok: true };
	}

	async deleteFile(request: AregProjectFileDeleteRequest): Promise<AregProjectMutationResult> {
		this.log.push({ type: "delete-file", projectDir: request.projectDir, relativePath: request.relativePath, description: request.description, policy: request.policy });
		const failure = this.mutationFailure(request.relativePath);
		if (failure !== undefined) return { ok: false, error: failure };
		this.files.set(request.relativePath, { type: "missing" });
		const skill = skillForRelativePath(this.localSkills, request.relativePath);
		if (skill !== undefined && request.relativePath.endsWith("/agents/openai.yaml")) skill.openaiPolicy = { type: "missing" };
		return { ok: true };
	}

	async removeEmptyDir(request: AregProjectRemoveEmptyDirRequest): Promise<AregProjectRemoveEmptyDirResult> {
		this.log.push({ type: "remove-empty-dir", projectDir: request.projectDir, relativePath: request.relativePath, description: request.description, policy: request.policy });
		const failure = this.mutationFailure(request.relativePath);
		if (failure !== undefined) return { ok: false, error: failure };
		return { ok: true, removed: true };
	}

	text(relativePath: string): string | undefined {
		const state = this.files.get(relativePath);
		return state?.type === "file" ? state.text : undefined;
	}

	operations(): readonly FakeAregProjectOperation[] {
		return this.log.map(copyProjectOperation);
	}

	private fileState(relativePath: string): AregTextFileState {
		return copyTextFileState(this.files.get(relativePath) ?? { type: "missing" });
	}

	private mutationFailure(relativePath: string): AregErrorInfo | undefined {
		const failure = this.mutationFailures.get(relativePath) ?? this.mutationFailures.get("*");
		return failure === undefined ? undefined : copyErrorInfo(failure);
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

export type FakeAregSkillxOperation =
	| ({ type: "install-into-workspace" } & Omit<AregSkillxInstallRequest, "env">)
	| ({ type: "cleanup-workspace" } & AregSkillxWorkspaceCleanupRequest);

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
		this.log.push({ type: "cleanup-workspace", workspaceRoot: request.workspaceRoot });
		if (this.cleanupFailure !== undefined) return resultErr(copyErrorInfo(this.cleanupFailure));
		return resultOk(undefined);
	}

	operations(): readonly FakeAregSkillxOperation[] {
		return this.log.map((operation) => ({ ...operation }));
	}
}

function failureKey(sourceRepo: string, skillNames: readonly string[]): string {
	return `${sourceRepo}:${skillNames.join(",")}`;
}

function copyProjectOperation(operation: FakeAregProjectOperation): FakeAregProjectOperation {
	switch (operation.type) {
		case "write-text-file":
			return { ...operation };
		case "delete-file":
			return { ...operation };
		case "remove-empty-dir":
			return { ...operation };
		default:
			return { ...operation };
	}
}

function copyFakeCheckSkill(skill: FakeAregCheckSkillOptions): AregCheckSkillInspection {
	return {
		name: skill.name,
		skillsPath: copyPathState(skill.skillsPath ?? { type: "missing" }),
		agentsPath: copyPathState(skill.agentsPath ?? { type: "missing" }),
		claudePath: copyPathState(skill.claudePath ?? { type: "missing" }),
		localSkillMd: normalizeTextFileState(skill.localSkillMd ?? { type: "missing" }),
		remoteSkillMd: normalizeTextFileState(skill.remoteSkillMd ?? { type: "missing" }),
		openaiPolicy: normalizeTextFileState(skill.openaiPolicy ?? { type: "missing" }),
	};
}

function copyFakeSkillKindSkill(skill: FakeAregSkillKindSkillOptions): AregSkillKindSkillInspection {
	return {
		name: skill.name,
		skillDir: copyPathState(skill.skillDir ?? { type: "directory" }),
		skillMd: normalizeTextFileState(skill.skillMd ?? `---\nname: ${skill.name}\ndescription: ${skill.name}\n---\n`),
		openaiPolicy: normalizeTextFileState(skill.openaiPolicy ?? { type: "missing" }),
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

function copySkillKindSkill(skill: AregSkillKindSkillInspection): AregSkillKindSkillInspection {
	return {
		name: skill.name,
		skillDir: copyPathState(skill.skillDir),
		skillMd: copyTextFileState(skill.skillMd),
		openaiPolicy: copyTextFileState(skill.openaiPolicy),
	};
}

function missingCheckSkill(name: string): AregCheckSkillInspection {
	const missing = { type: "missing" as const };
	return { name, skillsPath: missing, agentsPath: missing, claudePath: missing, localSkillMd: missing, remoteSkillMd: missing, openaiPolicy: missing };
}

function missingLocalSkill(name: string): AregSkillKindSkillInspection {
	const missing = { type: "missing" as const };
	return { name, skillDir: missing, skillMd: missing, openaiPolicy: missing };
}

function fakeResolveSkillName(spec: string): string {
	const normalized = spec.replaceAll("\\", "/");
	const withoutSkillMd = normalized.endsWith("/SKILL.md") ? normalized.slice(0, -"/SKILL.md".length) : normalized;
	const parts = withoutSkillMd.split("/").filter((part) => part.length > 0);
	const skillsIndex = parts.lastIndexOf("skills");
	const skillPart = skillsIndex === -1 ? undefined : parts[skillsIndex + 1];
	if (skillPart !== undefined) return skillPart;
	return parts.at(-1) ?? spec;
}

function skillForRelativePath(skills: readonly AregSkillKindSkillInspection[], relativePath: string): AregSkillKindSkillInspection | undefined {
	const parts = relativePath.split("/");
	if (parts[0] !== "skills") return undefined;
	const skillName = parts[1];
	if (skillName === undefined) return undefined;
	return skills.find((skill) => skill.name === skillName);
}

function normalizeTextFileState(value: AregTextFileState | object | string): AregTextFileState {
	if (typeof value === "string") return { type: "file", text: value };
	if ("type" in value) return copyTextFileState(value as AregTextFileState);
	return { type: "file", text: `${JSON.stringify(value, null, 2)}\n` };
}

function copyTextFileState(state: AregTextFileState): AregTextFileState {
	return { ...state };
}

function copyPathState(state: AregPathState): AregPathState {
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
	return error.displayCommand === undefined ? { code: error.code, message: error.message } : { code: error.code, message: error.message, displayCommand: error.displayCommand };
}
