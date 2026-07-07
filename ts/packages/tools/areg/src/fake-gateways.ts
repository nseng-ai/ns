import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	skillLookupBaseRelativePath,
	skillLookupDescriptorForRoot,
	skillLookupDescriptorForSourceType,
	type SkillLookupRoot,
	type SkillLookupSourceType,
} from "@nseng-ai/foundation/skill-lookup";

import { groupBySkillName, missingCheckSkillInspection } from "./gateways.ts";
import type {
	AregCheckPairingDirectory,
	AregCheckSkillInspection,
	AregErrorInfo,
	AregGithubGateway,
	AregManifestSkillSourceInspection,
	AregManifestSkillSourcesInspection,
	AregGithubSkillFileResult,
	AregGithubSkillListResult,
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
	TextFileState,
} from "./gateways.ts";
import { classifyResolvedSkillKindInspection } from "./gateways/skill-kind-classification.ts";
import {
	classifySkillMirrorSymlinkState,
	parseSkillMirrorRelativePath,
} from "@nseng-ai/harness-artifacts/api";

export type FakeAregProjectOperation =
	| { type: "inspect-project-base"; cwd: string; projectPath: string }
	| { type: "inspect-pi-artifacts"; projectDir: string }
	| { type: "inspect-pi-skill-inventory"; projectDir: string }
	| { type: "inspect-skill-name-inventory"; projectDir: string }
	| { type: "inspect-manifest-skill-sources"; projectDir: string }
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

export interface FakeAregManifestSkillSourceOptions {
	skillName: string;
	harness?: AregManifestSkillSourceInspection["harness"];
	scope?: AregManifestSkillSourceInspection["scope"];
	manifestPath?: string;
	manifestKey?: string;
	source?: Partial<AregManifestSkillSourceInspection["source"]>;
	targetRootRelativePath?: string;
	targetSkillRelativePath?: string;
	skillDir?: PathState;
	skillMd?: TextFileState | string;
}

export interface FakeAregSkillFindSkillOptions {
	name: string;
	root?: SkillLookupRoot;
	sourceType?: SkillLookupSourceType;
	baseRelativePath?: string;
	skillDir?: PathState;
	skillMd?: TextFileState | string;
	manifestSources?: readonly FakeAregManifestSkillSourceOptions[];
}

export interface FakeAregProjectGatewayOptions {
	projectDir?: string;
	projectPathState?: PathState;
	targetPathState?: PathState;
	lockfile?: TextFileState | object | string;
	nsToml?: TextFileState | string;
	aregJson?: TextFileState | object | string;
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
	manifestSkillSources?: readonly FakeAregManifestSkillSourceOptions[];
	manifestErrors?: readonly AregManifestSkillSourcesInspection["errors"][number][];
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
	private readonly manifestSkillSources: AregManifestSkillSourcesInspection;
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
			[".pi/settings.json", normalizeTextFileState(options.piSettings ?? { type: "missing" })],
		]);
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
		this.manifestSkillSources = {
			sources: (options.manifestSkillSources ?? []).map(copyFakeManifestSkillSource),
			errors: (options.manifestErrors ?? []).map((error) => ({ ...error })),
		};
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

	async inspectManifestSkillSources(
		request: AregProjectDirRequest,
	): Promise<AregManifestSkillSourcesInspection> {
		this.log.push({ type: "inspect-manifest-skill-sources", projectDir: request.projectDir });
		return {
			sources: this.manifestSkillSources.sources.map(copyManifestSkillSource),
			errors: this.manifestSkillSources.errors.map((error) => ({ ...error })),
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
		const skills = this.explicitFindSkills ?? this.localSkills.map(skillKindSkillToFindSkill);
		const manifestSourcesBySkill = groupBySkillName(this.manifestSkillSources.sources);
		return skills.map((skill) => {
			const manifestSources = manifestSourcesBySkill.get(skill.name);
			return {
				...skill,
				...(manifestSources === undefined ? {} : { manifestSources }),
			};
		});
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
		...(skill.manifestSources === undefined
			? {}
			: { manifestSources: skill.manifestSources.map(copyFakeManifestSkillSource) }),
	};
}

function copyFakeManifestSkillSource(
	source: FakeAregManifestSkillSourceOptions,
): AregManifestSkillSourceInspection {
	const manifestKey = source.manifestKey ?? `skill:${source.skillName}:pi:project`;
	const targetSkillRelativePath =
		source.targetSkillRelativePath ?? `.pi/skills/${source.skillName}`;
	return {
		skillName: source.skillName,
		harness: source.harness ?? "pi",
		scope: source.scope ?? "project",
		manifestPath: source.manifestPath ?? "/repo/.pi/skills/.ns-harness-artifacts-manifest.json",
		manifestKey,
		source: {
			type: source.source?.type ?? "npm-module",
			packageName: source.source?.packageName ?? "@example/skills",
			relativePath: source.source?.relativePath ?? `skills/${source.skillName}`,
			version: source.source?.version ?? "1.0.0",
		},
		targetRootRelativePath: source.targetRootRelativePath ?? ".pi/skills",
		targetSkillRelativePath,
		skillDir: copyPathState(source.skillDir ?? { type: "directory" }),
		skillMd: normalizeTextFileState(
			source.skillMd ?? `---\nname: ${source.skillName}\ndescription: ${source.skillName}\n---\n`,
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
		...(skill.manifestSources === undefined
			? {}
			: { manifestSources: skill.manifestSources.map(copyManifestSkillSource) }),
	};
}

function copyManifestSkillSource(
	source: AregManifestSkillSourceInspection,
): AregManifestSkillSourceInspection {
	return {
		...source,
		source: { ...source.source },
		skillDir: copyPathState(source.skillDir),
		skillMd: copyTextFileState(source.skillMd),
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

function copyErrorInfo(error: AregErrorInfo): AregErrorInfo {
	return error.displayCommand === undefined
		? { code: error.code, message: error.message }
		: { code: error.code, message: error.message, displayCommand: error.displayCommand };
}
