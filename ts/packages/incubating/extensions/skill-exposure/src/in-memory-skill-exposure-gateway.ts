import { transformSkillFrontmatter } from "@nseng-ai/ns/api";
import { diagnosticsFor, implicationsFor, inferPolicy } from "./policy.ts";
import { commandBackedSkillSurface } from "./replacement-registry.ts";
import type {
	OperationResult,
	PiSettings,
	SkillExposureBatch,
	SkillExposureGateway,
	SkillFacts,
	SkillInspection,
} from "./types.ts";
import {
	MANAGED_OPENAI_POLICY,
	SkillExposureInputError,
	SkillExposureRepositoryError,
} from "./types.ts";

export interface InMemorySkill {
	path: string;
	skillMdText: string;
	sidecarState?: SkillFacts["sidecarState"];
	canonicalPath?: string;
	skillMdSymlink?: boolean;
	parentState?: "directory" | "symlink" | "file";
	agentsParentState?: "missing" | "directory" | "symlink" | "file";
}

export interface InMemorySkillExposureState {
	root?: string;
	settings?: PiSettings;
	skills: readonly InMemorySkill[];
	settingsTargetState?: "missing" | "file" | "symlink" | "directory";
	settingsParentState?: "missing" | "directory" | "symlink" | "file";
}

export class InMemorySkillExposureGateway implements SkillExposureGateway {
	readonly appliedBatches: SkillExposureBatch[] = [];
	readonly skills: Map<string, InMemorySkill>;
	settings: PiSettings;
	private readonly root: string;
	private readonly settingsTargetState: NonNullable<
		InMemorySkillExposureState["settingsTargetState"]
	>;
	private readonly settingsParentState: NonNullable<
		InMemorySkillExposureState["settingsParentState"]
	>;

	constructor(state: InMemorySkillExposureState) {
		this.root = state.root ?? "/repo";
		this.skills = new Map(state.skills.map((skill) => [skill.path, { ...skill }]));
		this.settings = state.settings ?? {
			path: `${this.root}/.pi/settings.json`,
			exists: true,
			data: { skills: [] },
			exclusions: [],
		};
		this.settingsTargetState =
			state.settingsTargetState ?? (this.settings.exists ? "file" : "missing");
		this.settingsParentState = state.settingsParentState ?? "directory";
	}

	async readPiSettings(): Promise<PiSettings> {
		if (!isRecord(this.settings.data))
			throw new SkillExposureRepositoryError(
				"malformed-pi-settings",
				".pi/settings.json must contain an object.",
				{ path: ".pi/settings.json" },
			);
		const skills = this.settings.data.skills;
		if (
			skills !== undefined &&
			(!Array.isArray(skills) || !skills.every((entry) => typeof entry === "string"))
		)
			throw new SkillExposureRepositoryError(
				"malformed-pi-settings",
				".pi/settings.json field 'skills' must be an array of strings.",
				{ path: ".pi/settings.json" },
			);
		return copySettings(this.settings);
	}

	async inspectSkill(input: string, settings: PiSettings): Promise<SkillInspection> {
		if (!input.includes("/") && !input.startsWith(this.root))
			throw new SkillExposureInputError(
				`Expected an explicit skill directory or SKILL.md path, got ${JSON.stringify(input)}.`,
			);
		const normalized = input.endsWith("/SKILL.md") ? input.slice(0, -9) : input;
		const direct = this.skills.get(normalized);
		const linked = [...this.skills.values()].find(
			(skill) => skill.canonicalPath !== undefined && skill.path === normalized,
		);
		const skill = direct ?? linked;
		if (skill === undefined)
			throw new SkillExposureInputError(`Skill path does not exist: ${input}`);
		const canonical = skill.canonicalPath ?? `${this.root}/${skill.path}`;
		const relativePath = canonical.slice(this.root.length + 1);
		if (!/^skills\/[^/]+$/.test(relativePath) && !/^\.agents\/skills\/[^/]+$/.test(relativePath))
			throw new SkillExposureInputError(
				`Skill path must resolve canonically to skills/<name> or .agents/skills/<name>: ${input}`,
			);
		if (skill.skillMdSymlink)
			throw new SkillExposureRepositoryError(
				"unsafe-managed-path",
				`${relativePath}/SKILL.md must be a regular, non-symlink file.`,
				{ path: `${relativePath}/SKILL.md` },
			);
		if (skill.agentsParentState === "symlink" || skill.agentsParentState === "file")
			throw new SkillExposureRepositoryError(
				"unsafe-managed-path",
				`Refusing unexpected parent path ${relativePath}/agents.`,
				{ path: `${relativePath}/agents` },
			);
		const name = relativePath.split("/").at(-1);
		if (name === undefined) throw new SkillExposureInputError(`Invalid skill path: ${input}`);
		const skillMdDisplay = `${relativePath}/SKILL.md`;
		const frontmatter = transformSkillFrontmatter(skill.skillMdText, skillMdDisplay, {});
		if (!frontmatter.ok)
			throw new SkillExposureRepositoryError(
				"malformed-skill-frontmatter",
				frontmatter.error.message,
				{ path: skillMdDisplay },
			);
		const replacementSurface = commandBackedSkillSurface(name);
		const sidecarState = skill.sidecarState ?? "missing";
		if (sidecarState === "symlink" || sidecarState === "unexpected")
			throw new SkillExposureRepositoryError(
				"unsafe-managed-path",
				`Refusing unexpected sidecar at ${relativePath}/agents/openai.yaml.`,
				{ path: `${relativePath}/agents/openai.yaml` },
			);
		const facts: SkillFacts = {
			modelInvocationDisabled: /disable-model-invocation:\s*true/.test(skill.skillMdText),
			managedSidecar: sidecarState === "managed",
			sidecarState,
			piExcluded: settings.exclusions.includes(`-skills/${name}`),
			...(replacementSurface === undefined ? {} : { replacementSurface }),
			replacementVerified: replacementSurface !== undefined,
		};
		const policy = inferPolicy(facts);
		return {
			skill: name,
			canonicalPath: canonical,
			relativePath,
			policy,
			facts,
			implications: implicationsFor(policy),
			replacementEvidence:
				replacementSurface === undefined
					? "no verified registry row"
					: `verified /${replacementSurface}`,
			diagnostics: diagnosticsFor(facts),
			skillMdText: skill.skillMdText,
		};
	}

	async preflightBatch(batch: SkillExposureBatch): Promise<void> {
		if (this.settingsParentState === "symlink" || this.settingsParentState === "file")
			throw new SkillExposureRepositoryError(
				"unsafe-managed-path",
				"Refusing unexpected .pi parent path.",
				{ path: ".pi" },
			);
		if (
			(batch.initialSettings.exists && this.settingsTargetState !== "file") ||
			(!batch.initialSettings.exists && this.settingsTargetState !== "missing")
		)
			throw new SkillExposureRepositoryError(
				"unsafe-managed-path",
				"Refusing unexpected .pi/settings.json write target.",
				{ path: ".pi/settings.json" },
			);
		for (const plan of batch.plans) {
			const skill = [...this.skills.values()].find(
				(candidate) =>
					(candidate.canonicalPath ?? `${this.root}/${candidate.path}`) === plan.canonicalPath,
			);
			if (skill === undefined || skill.parentState === "symlink" || skill.parentState === "file")
				throw new SkillExposureRepositoryError(
					"unsafe-managed-path",
					`Refusing unexpected skill directory ${plan.relativePath}.`,
					{ path: plan.relativePath },
				);
			if (skill.skillMdSymlink)
				throw new SkillExposureRepositoryError(
					"unsafe-managed-path",
					`Refusing unexpected file ${plan.relativePath}/SKILL.md.`,
					{ path: `${plan.relativePath}/SKILL.md` },
				);
			if (skill.agentsParentState === "symlink" || skill.agentsParentState === "file")
				throw new SkillExposureRepositoryError(
					"unsafe-managed-path",
					`Refusing unexpected parent path ${plan.relativePath}/agents.`,
					{ path: `${plan.relativePath}/agents` },
				);
			if (
				plan.operations.some((operation) => operation.type === "delete") &&
				skill.sidecarState !== "managed"
			)
				throw new SkillExposureRepositoryError(
					"unexpected-managed-content",
					`Refusing to delete non-managed sidecar ${plan.relativePath}/agents/openai.yaml.`,
					{ path: `${plan.relativePath}/agents/openai.yaml` },
				);
			if (
				plan.operations.some(
					(operation) => operation.type === "write" && operation.target === "sidecar",
				) &&
				(skill.sidecarState === "symlink" || skill.sidecarState === "unexpected")
			)
				throw new SkillExposureRepositoryError(
					"unsafe-managed-path",
					`Refusing unexpected write target ${plan.relativePath}/agents/openai.yaml.`,
					{ path: `${plan.relativePath}/agents/openai.yaml` },
				);
		}
	}

	async applyBatch(batch: SkillExposureBatch): Promise<readonly OperationResult[]> {
		this.appliedBatches.push(batch);
		const results: OperationResult[] = [];
		for (const plan of batch.plans) {
			const skill = [...this.skills.values()].find(
				(candidate) =>
					(candidate.canonicalPath ?? `${this.root}/${candidate.path}`) === plan.canonicalPath,
			);
			if (skill === undefined) throw new Error(`Missing preflighted skill ${plan.skill}`);
			for (const operation of plan.operations) {
				if (operation.type === "skip") results.push({ ...operation, outcome: "skipped" });
				else {
					if (operation.type === "write" && operation.target === "skill-md")
						skill.skillMdText = operation.content;
					if (operation.type === "write" && operation.target === "sidecar")
						skill.sidecarState = "managed";
					if (operation.type === "delete") skill.sidecarState = "missing";
					results.push({
						type: operation.type,
						path: operation.path,
						outcome: "applied",
						evidence: operation.description,
					});
				}
			}
		}
		if (JSON.stringify(batch.initialSettings.data) !== JSON.stringify(batch.finalSettings.data)) {
			this.settings = copySettings(batch.finalSettings);
			results.push({
				type: "write-settings",
				path: ".pi/settings.json",
				outcome: "applied",
				evidence: "consolidated Pi settings",
			});
		} else {
			results.push({
				type: "write-settings",
				path: ".pi/settings.json",
				outcome: "skipped",
				evidence: "Pi settings already current",
			});
		}
		return results;
	}
}

export function inMemorySkill(path: string, options: Partial<InMemorySkill> = {}): InMemorySkill {
	const name = path.split("/").at(-1) ?? "demo";
	return {
		path,
		skillMdText: `---\nname: ${name}\ndescription: Test skill\n---\n\nBody\n`,
		...options,
	};
}

function copySettings(settings: PiSettings): PiSettings {
	return {
		...settings,
		data: { ...settings.data },
		exclusions: [...settings.exclusions],
	};
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

void MANAGED_OPENAI_POLICY;
