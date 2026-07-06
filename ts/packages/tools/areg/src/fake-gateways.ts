import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { resultErr, resultOk } from "@nseng-ai/foundation/result";
import {
	skillLookupBaseRelativePath,
	skillLookupDescriptorForRoot,
	skillLookupDescriptorForSourceType,
	type SkillLookupRoot,
	type SkillLookupSourceType,
} from "@nseng-ai/foundation/skill-lookup";

import { missingCheckSkillInspection } from "./gateways.ts";
import type {
	AregCheckPairingDirectory,
	AregCheckSkillInspection,
	AregErrorInfo,
	AregGithubGateway,
	AregGithubSkillFileResult,
	AregGithubSkillListResult,
	AregHostGateway,
	AregHostToolName,
	AregNpxSkillsAddRequest,
	AregNpxSkillsAddResult,
	AregNpxSkillsGateway,
	AregOperationResult,
	PathState,
	AregPiSkillInventoryInspection,
	AregProjectBaseInspection,
	AregProjectDirRequest,
	AregProjectFileDeleteRequest,
	AregProjectGateway,
	AregProjectInspectionRequest,
	AregProjectMutationResult,
	AregProjectRemoveEmptyDirRequest,
	AregProjectRemoveEmptyDirResult,
	AregProjectSymlinkDeleteRequest,
	AregProjectTextWriteRequest,
	AregPromptGateway,
	AregSkillFindRootsInspection,
	AregSkillFindSkillInspection,
	AregSkillInspectionRequest,
	AregSkillKindResolveRequest,
	AregSkillKindResolveResult,
	AregSkillKindSkillInspection,
	AregSkillKindSourceType,
	AregSkillxInstallRequest,
	AregSkillxInstallResult,
	AregSkillxInstalledSkill,
	AregSkillxWorkspaceCleanupRequest,
	AregSkillxWorkspaceGateway,
	TextFileState,
	AregToolCheckResult,
} from "./gateways.ts";
import { classifyResolvedSkillKindInspection } from "./gateways/skill-kind-classification.ts";
import {
	classifySkillMirrorSymlinkState,
	parseSkillMirrorRelativePath,
} from "@nseng-ai/harness-artifacts/api";

export type FakeAregProjectOperation =
	| { type: "inspect-project-base"; cwd: string; projectPath: string }
	| { type: "inspect-instruction-files"; projectDir: string }
	| { type: "inspect-pi-artifacts"; projectDir: string }
	| { type: "inspect-pi-skill-inventory"; projectDir: string }
	| { type: "inspect-skill-name-inventory"; projectDir: string }
	| { type: "inspect-skill-find-roots"; projectDir: string }
	| { type: "inspect-check-skill"; projectDir: string; skillName: string }
	| { type: "inspect-skill-kind-skill"; projectDir: string; skillName: string }
	| { type: "inspect-pairing-directories"; projectDir: string }
	| { type: "read-locally-excluded-skill-names"; projectDir: string }
	| { type: "resolve-skill-kind-spec"; projectDir: string; spec: string; cwd: string }
	| ({ type: "preflight-write-text-file" } & Omit<AregProjectTextWriteRequest, "env">)
	| ({ type: "preflight-delete-file" } & Omit<AregProjectFileDeleteRequest, "env">)
	| ({ type: "preflight-delete-symlink" } & Omit<AregProjectSymlinkDeleteRequest, "env">)
	| ({ type: "preflight-remove-empty-dir" } & Omit<AregProjectRemoveEmptyDirRequest, "env">)
	| ({ type: "write-text-file" } & Omit<AregProjectTextWriteRequest, "env">)
	| ({ type: "delete-file" } & Omit<AregProjectFileDeleteRequest, "env">)
	| ({ type: "delete-symlink" } & Omit<AregProjectSymlinkDeleteRequest, "env">)
	| ({ type: "remove-empty-dir" } & Omit<AregProjectRemoveEmptyDirRequest, "env">);

export interface FakeAregCheckSkillOptions {
	name: string;
	skillsPath?: PathState;
	agentsPath?: PathState;
	claudePath?: PathState;
	localSkillMd?: TextFileState | string;
	remoteSkillMd?: TextFileState | string;
	openaiPolicy?: TextFileState | string;
}

export interface FakeAregSkillKindSkillOptions {
	name: string;
	sourceType?: AregSkillKindSourceType;
	baseRelativePath?: string;
	skillDir?: PathState;
	skillMd?: TextFileState | string;
	openaiPolicy?: TextFileState | string;
	agentsPath?: PathState;
	claudePath?: PathState;
}

export interface FakeAregSkillFindSkillOptions {
	name: string;
	root?: SkillLookupRoot;
	sourceType?: SkillLookupSourceType;
	baseRelativePath?: string;
	skillDir?: PathState;
	skillMd?: TextFileState | string;
}

export interface FakeAregProjectGatewayOptions {
	projectDir?: string;
	projectPathState?: PathState;
	targetPathState?: PathState;
	lockfile?: TextFileState | object | string;
	nsToml?: TextFileState | string;
	aregJson?: TextFileState | object | string;
	agentsMd?: TextFileState | string;
	claudeMd?: TextFileState | string;
	claudeDir?: PathState;
	claudeSettings?: TextFileState | string;
	piDir?: PathState;
	piSettings?: TextFileState | object | string;
	replacementSurfaces?: readonly string[];
	piSkillInventory?: Partial<AregPiSkillInventoryInspection>;
	skillsDirectoryNames?: readonly string[];
	agentsSkillNames?: readonly string[];
	claudeSkillNames?: readonly string[];
	excludedSkillNames?: readonly string[];
	checkSkills?: readonly FakeAregCheckSkillOptions[];
	localSkills?: readonly FakeAregSkillKindSkillOptions[];
	findSkills?: readonly FakeAregSkillFindSkillOptions[];
	pairingDirectories?: readonly AregCheckPairingDirectory[];
	resolveFailures?: Readonly<Record<string, AregErrorInfo>>;
	preflightFailures?: Readonly<Record<string, AregErrorInfo>>;
	mutationFailures?: Readonly<Record<string, AregErrorInfo>>;
	applyFailure?: AregErrorInfo;
}

export class FakeAregProjectGateway implements AregProjectGateway {
	private readonly projectDir: string;
	private readonly projectPathState: PathState;
	private readonly files: Map<string, TextFileState>;
	private readonly claudeDir: PathState;
	private readonly piDir: PathState;
	private readonly replacementSurfaces: readonly string[];
	private readonly piSkillInventory: AregPiSkillInventoryInspection | undefined;
	private readonly skillsDirectoryNames: readonly string[];
	private readonly agentsSkillNames: readonly string[];
	private readonly claudeSkillNames: readonly string[];
	private readonly excludedSkillNames: readonly string[];
	private readonly checkSkills: AregCheckSkillInspection[];
	private readonly localSkills: AregSkillKindSkillInspection[];
	private readonly explicitFindSkills: AregSkillFindSkillInspection[] | undefined;
	private readonly pairingDirectories: readonly AregCheckPairingDirectory[];
	private readonly resolveFailures: ReadonlyMap<string, AregErrorInfo>;
	private readonly preflightFailures: ReadonlyMap<string, AregErrorInfo>;
	private readonly mutationFailures: ReadonlyMap<string, AregErrorInfo>;
	private readonly log: FakeAregProjectOperation[] = [];

	constructor(options: FakeAregProjectGatewayOptions = {}) {
		this.projectDir = options.projectDir ?? "/repo";
		this.projectPathState = copyPathState(
			options.projectPathState ?? options.targetPathState ?? { type: "directory" },
		);
		this.files = new Map([
			["skills-lock.json", normalizeTextFileState(options.lockfile ?? { version: 1, skills: {} })],
			["ns.toml", normalizeTextFileState(options.nsToml ?? { type: "missing" })],
			["areg.json", normalizeTextFileState(options.aregJson ?? { type: "missing" })],
			["AGENTS.md", normalizeTextFileState(options.agentsMd ?? { type: "missing" })],
			["CLAUDE.md", normalizeTextFileState(options.claudeMd ?? { type: "missing" })],
			[
				".claude/settings.local.json",
				normalizeTextFileState(options.claudeSettings ?? { type: "missing" }),
			],
			[".pi/settings.json", normalizeTextFileState(options.piSettings ?? { type: "missing" })],
		]);
		this.claudeDir = copyPathState(options.claudeDir ?? { type: "missing" });
		this.piDir = copyPathState(options.piDir ?? { type: "missing" });
		this.replacementSurfaces = [...(options.replacementSurfaces ?? [])];
		this.piSkillInventory =
			options.piSkillInventory === undefined
				? undefined
				: copyPiSkillInventory(options.piSkillInventory);
		this.skillsDirectoryNames = [...(options.skillsDirectoryNames ?? [])];
		this.agentsSkillNames = [...(options.agentsSkillNames ?? [])];
		this.claudeSkillNames = [...(options.claudeSkillNames ?? [])];
		this.excludedSkillNames = [...(options.excludedSkillNames ?? [])];
		this.checkSkills = (options.checkSkills ?? []).map(copyFakeCheckSkill);
		this.localSkills = (options.localSkills ?? []).map(copyFakeSkillKindSkill);
		this.explicitFindSkills =
			options.findSkills === undefined ? undefined : options.findSkills.map(copyFakeSkillFindSkill);
		this.pairingDirectories = (options.pairingDirectories ?? []).map(copyPairingDirectory);
		this.resolveFailures = new Map(
			Object.entries(options.resolveFailures ?? {}).map(([key, value]) => [
				key,
				copyErrorInfo(value),
			]),
		);
		this.preflightFailures = new Map(
			Object.entries(options.preflightFailures ?? {}).map(([key, value]) => [
				key,
				copyErrorInfo(value),
			]),
		);
		const mutationFailures =
			options.applyFailure === undefined
				? options.mutationFailures
				: { ...options.mutationFailures, "*": options.applyFailure };
		this.mutationFailures = new Map(
			Object.entries(mutationFailures ?? {}).map(([key, value]) => [key, copyErrorInfo(value)]),
		);
	}

	async inspectProjectBase(
		request: AregProjectInspectionRequest,
	): Promise<AregProjectBaseInspection> {
		this.log.push({
			type: "inspect-project-base",
			cwd: request.cwd,
			projectPath: request.projectPath,
		});
		return {
			projectDir: this.projectDir,
			projectPathState: copyPathState(this.projectPathState),
			lockfile: this.fileState("skills-lock.json"),
			nsToml: this.fileState("ns.toml"),
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

	async inspectPiSkillInventory(
		request: AregProjectDirRequest,
	): Promise<AregPiSkillInventoryInspection> {
		this.log.push({ type: "inspect-pi-skill-inventory", projectDir: request.projectDir });
		if (this.piSkillInventory !== undefined) return copyPiSkillInventory(this.piSkillInventory);
		return {
			skillNames: this.localSkills
				.filter((skill) => skill.skillDir.type === "directory" && skill.skillMd.type === "file")
				.map((skill) => skill.name),
			isApproximation: true,
			source: "fake-repo-fallback-resolvable-skill-roots",
		};
	}

	async inspectSkillNameInventory(request: AregProjectDirRequest) {
		this.log.push({ type: "inspect-skill-name-inventory", projectDir: request.projectDir });
		return {
			skillsDirectoryNames: [...this.skillsDirectoryNames],
			agentsSkillNames: [...this.agentsSkillNames],
			claudeSkillNames: [...this.claudeSkillNames],
			skillKindNames: this.localSkills.map((skill) => skill.name),
		};
	}

	async inspectSkillFindRoots(
		request: AregProjectDirRequest,
	): Promise<AregSkillFindRootsInspection> {
		this.log.push({ type: "inspect-skill-find-roots", projectDir: request.projectDir });
		return { skills: this.currentFindSkills().map(copySkillFindSkill) };
	}

	async inspectCheckSkill(request: AregSkillInspectionRequest): Promise<AregCheckSkillInspection> {
		this.log.push({
			type: "inspect-check-skill",
			projectDir: request.projectDir,
			skillName: request.skillName,
		});
		const skill = this.checkSkills.find((candidate) => candidate.name === request.skillName);
		return skill === undefined
			? missingCheckSkillInspection(request.skillName)
			: copyCheckSkill(skill);
	}

	async inspectSkillKindSkill(
		request: AregSkillInspectionRequest,
	): Promise<AregSkillKindSkillInspection> {
		this.log.push({
			type: "inspect-skill-kind-skill",
			projectDir: request.projectDir,
			skillName: request.skillName,
		});
		const skill = this.localSkills.find((candidate) => candidate.name === request.skillName);
		return skill === undefined
			? missingSkillKindSkill(request.skillName)
			: copySkillKindSkill(skill);
	}

	async inspectPairingDirectories(
		request: AregProjectDirRequest,
	): Promise<readonly AregCheckPairingDirectory[]> {
		this.log.push({ type: "inspect-pairing-directories", projectDir: request.projectDir });
		return this.pairingDirectories.map(copyPairingDirectory);
	}

	async readLocallyExcludedSkillNames(request: AregProjectDirRequest): Promise<readonly string[]> {
		this.log.push({ type: "read-locally-excluded-skill-names", projectDir: request.projectDir });
		return [...this.excludedSkillNames];
	}

	async resolveSkillKindSpec(
		request: AregSkillKindResolveRequest,
	): Promise<AregSkillKindResolveResult> {
		this.log.push({
			type: "resolve-skill-kind-spec",
			projectDir: request.projectDir,
			spec: request.spec,
			cwd: request.cwd,
		});
		const failure = this.resolveFailures.get(request.spec);
		if (failure !== undefined) return { type: "error", error: copyErrorInfo(failure) };
		const skillName = fakeResolveSkillName(request.spec);
		const skill =
			this.localSkills.find((candidate) => candidate.name === skillName) ??
			missingSkillKindSkill(skillName);
		return classifyResolvedSkillKindInspection({
			spec: request.spec,
			skillName,
			inspection: skill,
		});
	}

	async preflightWriteTextFile(
		request: AregProjectTextWriteRequest,
	): Promise<AregProjectMutationResult> {
		this.log.push({
			type: "preflight-write-text-file",
			projectDir: request.projectDir,
			relativePath: request.relativePath,
			content: request.content,
			description: request.description,
			createParent: request.createParent,
			policy: request.policy,
		});
		const failure = this.preflightFailure(request.relativePath);
		return failure === undefined ? { ok: true } : { ok: false, error: failure };
	}

	async preflightDeleteFile(
		request: AregProjectFileDeleteRequest,
	): Promise<AregProjectMutationResult> {
		this.log.push({
			type: "preflight-delete-file",
			projectDir: request.projectDir,
			relativePath: request.relativePath,
			description: request.description,
			policy: request.policy,
		});
		const failure = this.preflightFailure(request.relativePath);
		return failure === undefined ? { ok: true } : { ok: false, error: failure };
	}

	async preflightDeleteSymlink(
		request: AregProjectSymlinkDeleteRequest,
	): Promise<AregProjectMutationResult> {
		this.log.push({
			type: "preflight-delete-symlink",
			projectDir: request.projectDir,
			relativePath: request.relativePath,
			description: request.description,
			policy: request.policy,
		});
		const failure =
			this.preflightFailure(request.relativePath) ??
			this.deleteSymlinkContractFailure(request.relativePath, request.description);
		return failure === undefined ? { ok: true } : { ok: false, error: failure };
	}

	async preflightRemoveEmptyDir(
		request: AregProjectRemoveEmptyDirRequest,
	): Promise<AregProjectMutationResult> {
		this.log.push({
			type: "preflight-remove-empty-dir",
			projectDir: request.projectDir,
			relativePath: request.relativePath,
			description: request.description,
			policy: request.policy,
		});
		const failure = this.preflightFailure(request.relativePath);
		return failure === undefined ? { ok: true } : { ok: false, error: failure };
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
		if (skill !== undefined && request.relativePath.endsWith("/SKILL.md"))
			skill.skillMd = { type: "file", text: request.content };
		if (skill !== undefined && request.relativePath.endsWith("/agents/openai.yaml"))
			skill.openaiPolicy = { type: "file", text: request.content };
		return { ok: true };
	}

	async deleteFile(request: AregProjectFileDeleteRequest): Promise<AregProjectMutationResult> {
		this.log.push({
			type: "delete-file",
			projectDir: request.projectDir,
			relativePath: request.relativePath,
			description: request.description,
			policy: request.policy,
		});
		const failure = this.mutationFailure(request.relativePath);
		if (failure !== undefined) return { ok: false, error: failure };
		this.files.set(request.relativePath, { type: "missing" });
		const skill = skillForRelativePath(this.localSkills, request.relativePath);
		if (skill !== undefined && request.relativePath.endsWith("/agents/openai.yaml"))
			skill.openaiPolicy = { type: "missing" };
		return { ok: true };
	}

	async deleteSymlink(
		request: AregProjectSymlinkDeleteRequest,
	): Promise<AregProjectMutationResult> {
		this.log.push({
			type: "delete-symlink",
			projectDir: request.projectDir,
			relativePath: request.relativePath,
			description: request.description,
			policy: request.policy,
		});
		const failure =
			this.mutationFailure(request.relativePath) ??
			this.deleteSymlinkContractFailure(request.relativePath, request.description);
		if (failure !== undefined) return { ok: false, error: failure };
		const mirror = parseSkillMirrorRelativePath(request.relativePath);
		const skill = mirror === undefined ? undefined : this.skillForMirrorName(mirror.skillName);
		if (skill !== undefined && mirror !== undefined) {
			if (mirror.mirrorKind === "agents") skill.agentsPath = { type: "missing" };
			if (mirror.mirrorKind === "claude") skill.claudePath = { type: "missing" };
		}
		return { ok: true };
	}

	async removeEmptyDir(
		request: AregProjectRemoveEmptyDirRequest,
	): Promise<AregProjectRemoveEmptyDirResult> {
		this.log.push({
			type: "remove-empty-dir",
			projectDir: request.projectDir,
			relativePath: request.relativePath,
			description: request.description,
			policy: request.policy,
		});
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

	private fileState(relativePath: string): TextFileState {
		return copyTextFileState(this.files.get(relativePath) ?? { type: "missing" });
	}

	private currentFindSkills(): AregSkillFindSkillInspection[] {
		return this.explicitFindSkills ?? this.localSkills.map(skillKindSkillToFindSkill);
	}

	private preflightFailure(relativePath: string): AregErrorInfo | undefined {
		const failure = this.preflightFailures.get(relativePath) ?? this.preflightFailures.get("*");
		return failure === undefined ? undefined : copyErrorInfo(failure);
	}

	private mutationFailure(relativePath: string): AregErrorInfo | undefined {
		const failure = this.mutationFailures.get(relativePath) ?? this.mutationFailures.get("*");
		return failure === undefined ? undefined : copyErrorInfo(failure);
	}

	private skillForMirrorName(skillName: string): AregSkillKindSkillInspection | undefined {
		return this.localSkills.find((candidate) => candidate.name === skillName);
	}

	private deleteSymlinkContractFailure(
		relativePath: string,
		description: string,
	): AregErrorInfo | undefined {
		const target = `${this.projectDir}/${relativePath}`;
		const mirror = parseSkillMirrorRelativePath(relativePath);
		const skill = mirror === undefined ? undefined : this.skillForMirrorName(mirror.skillName);
		const state =
			mirror === undefined
				? undefined
				: mirror.mirrorKind === "agents"
					? skill?.agentsPath
					: skill?.claudePath;
		return classifySkillMirrorSymlinkState(relativePath, state, description, target);
	}
}

export type FakeAregHostOperation = { type: "check-tool"; tool: AregHostToolName; cwd: string };

export interface FakeAregHostGatewayOptions {
	tools?: Partial<Record<AregHostToolName, string | null>>;
}

export class FakeAregHostGateway implements AregHostGateway {
	private readonly tools: ReadonlyMap<AregHostToolName, string | null>;
	private readonly log: FakeAregHostOperation[] = [];

	constructor(options: FakeAregHostGatewayOptions = {}) {
		this.tools = new Map(
			Object.entries(options.tools ?? {}) as Array<[AregHostToolName, string | null]>,
		);
	}

	async checkTool(options: {
		tool: AregHostToolName;
		cwd: string;
		env: NodeJS.ProcessEnv;
	}): Promise<AregToolCheckResult> {
		this.log.push({ type: "check-tool", tool: options.tool, cwd: options.cwd });
		const path = this.tools.get(options.tool);
		if (path === null)
			return {
				type: "missing",
				tool: options.tool,
				message: `Required host tool is missing: ${options.tool}`,
			};
		return { type: "found", tool: options.tool, path: path ?? `/fake/bin/${options.tool}` };
	}

	operations(): readonly FakeAregHostOperation[] {
		return this.log.map((operation) => ({ ...operation }));
	}
}

export type FakeAregGithubOperation =
	| {
			type: "list-skill-directory-names";
			repo: string;
			ref?: string;
	  }
	| {
			type: "check-skill-file";
			repo: string;
			path: string;
			ref?: string;
	  };

export interface FakeAregGithubGatewayOptions {
	repos?: Record<string, readonly string[] | "missing" | "auth-error" | AregErrorInfo>;
	files?: Record<string, "found" | "missing" | "auth-error" | AregErrorInfo>;
}

export class FakeAregGithubGateway implements AregGithubGateway {
	private readonly repos: ReadonlyMap<
		string,
		readonly string[] | "missing" | "auth-error" | AregErrorInfo
	>;
	private readonly files: ReadonlyMap<string, "found" | "missing" | "auth-error" | AregErrorInfo>;
	private readonly log: FakeAregGithubOperation[] = [];

	constructor(options: FakeAregGithubGatewayOptions = {}) {
		this.repos = new Map(
			Object.entries(options.repos ?? {}).map(([repo, value]) => [repo, copyGithubState(value)]),
		);
		this.files = new Map(
			Object.entries(options.files ?? {}).map(([path, value]) => [
				path,
				copyGithubFileState(value),
			]),
		);
	}

	async listSkillDirectoryNames(options: {
		repo: string;
		ref?: string;
		env: NodeJS.ProcessEnv;
	}): Promise<AregGithubSkillListResult> {
		this.log.push({
			type: "list-skill-directory-names",
			repo: options.repo,
			...optionalEntry("ref", options.ref),
		});
		const state = this.repos.get(options.repo);
		if (state === undefined || state === "missing")
			return { type: "missing", message: `Skill source not found: ${options.repo}` };
		if (state === "auth-error")
			return { type: "auth-error", message: `GitHub authentication failed for ${options.repo}` };
		if (isReadonlyStringArray(state)) return { type: "ok", skillNames: [...state] };
		return { type: "error", error: copyErrorInfo(state) };
	}

	async checkSkillFile(options: {
		repo: string;
		path: string;
		ref?: string;
		env: NodeJS.ProcessEnv;
	}): Promise<AregGithubSkillFileResult> {
		this.log.push({
			type: "check-skill-file",
			repo: options.repo,
			path: options.path,
			...optionalEntry("ref", options.ref),
		});
		const state = this.files.get(githubFileKey(options.repo, options.path, options.ref));
		if (state === undefined || state === "found") return { type: "found" };
		if (state === "missing")
			return { type: "missing", message: `Skill file not found: ${options.repo}/${options.path}` };
		if (state === "auth-error")
			return { type: "auth-error", message: `GitHub authentication failed for ${options.repo}` };
		return { type: "error", error: copyErrorInfo(state) };
	}

	operations(): readonly FakeAregGithubOperation[] {
		return this.log.map((operation) => ({ ...operation }));
	}
}

export type FakeAregNpxSkillsOperation = { type: "add-skills" } & Omit<
	AregNpxSkillsAddRequest,
	"env"
>;

export interface FakeAregNpxSkillsGatewayOptions {
	failure?: AregErrorInfo;
	failures?: Readonly<Record<string, AregErrorInfo>>;
}

export class FakeAregNpxSkillsGateway implements AregNpxSkillsGateway {
	private readonly failure: AregErrorInfo | undefined;
	private readonly failures: ReadonlyMap<string, AregErrorInfo>;
	private readonly log: FakeAregNpxSkillsOperation[] = [];

	constructor(options: FakeAregNpxSkillsGatewayOptions = {}) {
		this.failure = options.failure === undefined ? undefined : copyErrorInfo(options.failure);
		this.failures = new Map(
			Object.entries(options.failures ?? {}).map(([key, value]) => [key, copyErrorInfo(value)]),
		);
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
		return this.log.map((operation) => ({
			...operation,
			skillNames: [...operation.skillNames],
			targetAgents: [...operation.targetAgents],
		}));
	}
}

export type FakeAregPromptOperation = {
	type: "confirm";
	message: string;
	defaultValue: boolean;
	response: boolean;
};

export interface FakeAregPromptGatewayOptions {
	responses?: readonly boolean[];
	shouldConfirmByDefault?: boolean;
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
		this.log.push({
			type: "confirm",
			message: request.message,
			defaultValue: request.defaultValue,
			response,
		});
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
	workspaceRoot?: string;
	installedSkills?: readonly AregSkillxInstalledSkill[];
	failure?: AregErrorInfo;
	cleanupFailure?: AregErrorInfo;
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
		this.cleanupFailure =
			options.cleanupFailure === undefined ? undefined : copyErrorInfo(options.cleanupFailure);
	}

	async installIntoWorkspace(request: AregSkillxInstallRequest): Promise<AregSkillxInstallResult> {
		this.log.push({
			type: "install-into-workspace",
			sourceRepo: request.sourceRepo,
			...optionalEntry("skillName", request.skillName),
			cwd: request.cwd,
		});
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

function copyFakeSkillFindSkill(
	skill: FakeAregSkillFindSkillOptions,
): AregSkillFindSkillInspection {
	const root = skill.root ?? skillLookupDescriptorForSourceType(skill.sourceType ?? "repo").root;
	const sourceType = skill.sourceType ?? skillLookupDescriptorForRoot(root).sourceType;
	return {
		name: skill.name,
		root,
		sourceType,
		baseRelativePath: skill.baseRelativePath ?? skillLookupBaseRelativePath(root, skill.name),
		skillDir: copyPathState(skill.skillDir ?? { type: "directory" }),
		skillMd: normalizeTextFileState(
			skill.skillMd ?? `---\nname: ${skill.name}\ndescription: ${skill.name}\n---\n`,
		),
	};
}

function copyFakeSkillKindSkill(
	skill: FakeAregSkillKindSkillOptions,
): AregSkillKindSkillInspection {
	const sourceType = skill.sourceType ?? "repo";
	const descriptor = skillLookupDescriptorForSourceType(sourceType);
	return {
		name: skill.name,
		sourceType,
		baseRelativePath:
			skill.baseRelativePath ?? skillLookupBaseRelativePath(descriptor.root, skill.name),
		skillDir: copyPathState(skill.skillDir ?? { type: "directory" }),
		skillMd: normalizeTextFileState(
			skill.skillMd ?? `---\nname: ${skill.name}\ndescription: ${skill.name}\n---\n`,
		),
		openaiPolicy: normalizeTextFileState(skill.openaiPolicy ?? { type: "missing" }),
		agentsPath: copyPathState(skill.agentsPath ?? { type: "missing" }),
		claudePath: copyPathState(skill.claudePath ?? { type: "missing" }),
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

interface SkillInspectionCore {
	name: string;
	baseRelativePath: string;
	skillDir: PathState;
	skillMd: TextFileState;
}

function copySkillInspectionCore(skill: SkillInspectionCore): SkillInspectionCore {
	return {
		name: skill.name,
		baseRelativePath: skill.baseRelativePath,
		skillDir: copyPathState(skill.skillDir),
		skillMd: copyTextFileState(skill.skillMd),
	};
}

function copySkillKindSkill(skill: AregSkillKindSkillInspection): AregSkillKindSkillInspection {
	return {
		...copySkillInspectionCore(skill),
		sourceType: skill.sourceType,
		openaiPolicy: copyTextFileState(skill.openaiPolicy),
		agentsPath: copyPathState(skill.agentsPath),
		claudePath: copyPathState(skill.claudePath),
	};
}

function copySkillFindSkill(skill: AregSkillFindSkillInspection): AregSkillFindSkillInspection {
	return {
		...copySkillInspectionCore(skill),
		root: skill.root,
		sourceType: skill.sourceType,
	};
}

function skillKindSkillToFindSkill(
	skill: AregSkillKindSkillInspection,
): AregSkillFindSkillInspection {
	const descriptor = skillLookupDescriptorForSourceType(skill.sourceType);
	return {
		...copySkillInspectionCore(skill),
		root: descriptor.root,
		sourceType: descriptor.sourceType,
	};
}

function missingSkillKindSkill(name: string): AregSkillKindSkillInspection {
	const missing = { type: "missing" as const };
	return {
		name,
		sourceType: "repo",
		baseRelativePath: skillLookupBaseRelativePath("skills", name),
		skillDir: missing,
		skillMd: missing,
		openaiPolicy: missing,
		agentsPath: missing,
		claudePath: missing,
	};
}

function fakeResolveSkillName(spec: string): string {
	const normalized = spec.replaceAll("\\", "/");
	const withoutSkillMd = normalized.endsWith("/SKILL.md")
		? normalized.slice(0, -"/SKILL.md".length)
		: normalized;
	const parts = withoutSkillMd.split("/").filter((part) => part.length > 0);
	const skillsIndex = parts.lastIndexOf("skills");
	const skillPart = skillsIndex === -1 ? undefined : parts[skillsIndex + 1];
	if (skillPart !== undefined) return skillPart;
	return parts.at(-1) ?? spec;
}

function skillForRelativePath(
	skills: readonly AregSkillKindSkillInspection[],
	relativePath: string,
): AregSkillKindSkillInspection | undefined {
	return skills.find((skill) => relativePath.startsWith(`${skill.baseRelativePath}/`));
}

function normalizeTextFileState(value: TextFileState | object | string): TextFileState {
	if (typeof value === "string") return { type: "file", text: value };
	if ("type" in value) return copyTextFileState(value as TextFileState);
	return { type: "file", text: `${JSON.stringify(value, null, 2)}\n` };
}

function copyTextFileState(state: TextFileState): TextFileState {
	return { ...state };
}

function copyPiSkillInventory(
	inventory: Partial<AregPiSkillInventoryInspection>,
): AregPiSkillInventoryInspection {
	return {
		skillNames: [...(inventory.skillNames ?? [])],
		isApproximation: inventory.isApproximation ?? true,
		source: inventory.source ?? "fake-pi-skill-inventory",
	};
}

function copyPathState(state: PathState): PathState {
	return { ...state };
}

function copyPairingDirectory(directory: AregCheckPairingDirectory): AregCheckPairingDirectory {
	return {
		relativeDir: directory.relativeDir,
		hasAgents: directory.hasAgents,
		hasClaude: directory.hasClaude,
		...optionalEntry("claudeText", directory.claudeText),
	};
}

function copyGithubState(
	value: readonly string[] | "missing" | "auth-error" | AregErrorInfo,
): readonly string[] | "missing" | "auth-error" | AregErrorInfo {
	if (isReadonlyStringArray(value)) return [...value];
	if (value === "missing" || value === "auth-error") return value;
	return copyErrorInfo(value);
}

function copyGithubFileState(
	value: "found" | "missing" | "auth-error" | AregErrorInfo,
): "found" | "missing" | "auth-error" | AregErrorInfo {
	if (value === "found" || value === "missing" || value === "auth-error") return value;
	return copyErrorInfo(value);
}

function githubFileKey(repo: string, path: string, ref: string | undefined): string {
	return ref === undefined ? `${repo}:${path}` : `${repo}:${path}@${ref}`;
}

function isReadonlyStringArray(
	value: readonly string[] | "missing" | "auth-error" | AregErrorInfo,
): value is readonly string[] {
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
	return error.displayCommand === undefined
		? { code: error.code, message: error.message }
		: { code: error.code, message: error.message, displayCommand: error.displayCommand };
}
