import { lstat, mkdir, readFile, realpath, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { parseSkillFrontmatterBlock, transformSkillFrontmatter } from "@nseng-ai/ns/api";
import { commandBackedSkillSurface } from "./replacement-registry.ts";
import { diagnosticsFor, implicationsFor, inferPolicy } from "./policy.ts";
import type {
	OperationResult,
	PiSettings,
	SkillExposureBatch,
	SkillExposureGateway,
	SkillFacts,
	SkillInspection,
	SkillOverlayOperation,
} from "./types.ts";
import {
	MANAGED_OPENAI_POLICY,
	SkillExposureInputError,
	SkillExposureIoError,
	SkillExposureRepositoryError,
} from "./types.ts";

const MAX_DIAGNOSTICS = 20;
const DISABLE_KEY = "disable-model-invocation";

export class NodeSkillExposureGateway implements SkillExposureGateway {
	private readonly cwd: string;

	constructor(cwd: string) {
		this.cwd = cwd;
	}

	async readPiSettings(): Promise<PiSettings> {
		const root = await this.projectRoot();
		const settingsPath = path.join(root, ".pi", "settings.json");
		let text: string;
		try {
			text = await readFile(settingsPath, "utf8");
		} catch (error) {
			if (isNodeError(error, "ENOENT"))
				return { path: settingsPath, exists: false, data: {}, exclusions: [] };
			throw ioError(`Cannot read ${settingsPath}`, error);
		}
		let data: unknown;
		try {
			data = JSON.parse(text);
		} catch (error) {
			throw repositoryError(
				"malformed-pi-settings",
				`Invalid JSON in .pi/settings.json: ${errorMessage(error)}`,
				".pi/settings.json",
			);
		}
		if (!isRecord(data))
			throw repositoryError(
				"malformed-pi-settings",
				".pi/settings.json must contain an object.",
				".pi/settings.json",
			);
		const skills = data.skills;
		if (
			skills !== undefined &&
			(!Array.isArray(skills) || !skills.every((entry) => typeof entry === "string"))
		)
			throw repositoryError(
				"malformed-pi-settings",
				".pi/settings.json field 'skills' must be an array of strings.",
				".pi/settings.json",
			);
		return {
			path: settingsPath,
			exists: true,
			data,
			exclusions: skills === undefined ? [] : skills,
		};
	}

	async inspectSkill(input: string, settings: PiSettings): Promise<SkillInspection> {
		const resolved = await resolveSkillInput(await this.projectRoot(), input);
		const skillMdPath = path.join(resolved.canonicalPath, "SKILL.md");
		const skillMdState = await safeLstat(skillMdPath);
		if (skillMdState === undefined || !skillMdState.isFile() || skillMdState.isSymbolicLink())
			throw repositoryError(
				"unsafe-managed-path",
				`${resolved.relativePath}/SKILL.md must be a regular, non-symlink file.`,
				`${resolved.relativePath}/SKILL.md`,
			);
		let skillMdText: string;
		try {
			skillMdText = await readFile(skillMdPath, "utf8");
		} catch (error) {
			throw ioError(`Cannot read ${resolved.relativePath}/SKILL.md`, error);
		}
		const agentsPath = path.join(resolved.canonicalPath, "agents");
		const agentsState = await safeLstat(agentsPath);
		if (agentsState !== undefined && (!agentsState.isDirectory() || agentsState.isSymbolicLink()))
			throw repositoryError(
				"unsafe-managed-path",
				`Refusing unexpected parent path ${resolved.relativePath}/agents.`,
				`${resolved.relativePath}/agents`,
			);
		const skillMdDisplay = `${resolved.relativePath}/SKILL.md`;
		const frontmatter = transformSkillFrontmatter(skillMdText, skillMdDisplay, {});
		if (!frontmatter.ok)
			throw repositoryError(
				"malformed-skill-frontmatter",
				frontmatter.error.message,
				skillMdDisplay,
			);
		const parsedFrontmatter = parseSkillFrontmatterBlock(skillMdText);
		if (!parsedFrontmatter.ok)
			throw repositoryError(
				"malformed-skill-frontmatter",
				`${skillMdDisplay} ${parsedFrontmatter.error.message}`,
				skillMdDisplay,
			);
		const sidecarDisplay = `${resolved.relativePath}/agents/openai.yaml`;
		const sidecar = await inspectSidecar(path.join(agentsPath, "openai.yaml"), sidecarDisplay);
		if (sidecar === "symlink" || sidecar === "unexpected")
			throw repositoryError(
				"unsafe-managed-path",
				`Refusing unexpected sidecar at ${sidecarDisplay}.`,
				sidecarDisplay,
			);
		const replacementSurface = commandBackedSkillSurface(resolved.skill);
		const facts: SkillFacts = {
			modelInvocationDisabled: parsedFrontmatter.value.fields[DISABLE_KEY] === "true",
			managedSidecar: sidecar === "managed",
			sidecarState: sidecar,
			piExcluded: settings.exclusions.includes(`-skills/${resolved.skill}`),
			...optionalEntry("replacementSurface", replacementSurface),
			replacementVerified: replacementSurface !== undefined,
		};
		const policy = inferPolicy(facts);
		return {
			skill: resolved.skill,
			canonicalPath: resolved.canonicalPath,
			relativePath: resolved.relativePath,
			policy,
			facts,
			implications: implicationsFor(policy),
			replacementEvidence:
				replacementSurface === undefined
					? "no verified registry row"
					: `verified /${replacementSurface}`,
			diagnostics: diagnosticsFor(facts).slice(0, MAX_DIAGNOSTICS),
			skillMdText,
		};
	}

	async preflightBatch(batch: SkillExposureBatch): Promise<void> {
		const root = await this.projectRoot();
		for (const plan of batch.plans) {
			assertCanonicalSkill(root, plan.canonicalPath, plan.relativePath);
			await requireDirectory(plan.canonicalPath, plan.relativePath);
			for (const operation of plan.operations)
				await this.preflightOperation(plan.canonicalPath, operation);
		}
		await preflightSettings(root, batch.initialSettings);
	}

	async applyBatch(batch: SkillExposureBatch): Promise<readonly OperationResult[]> {
		const results: OperationResult[] = [];
		for (const plan of batch.plans) {
			for (const operation of plan.operations) {
				const target = operationTarget(plan.canonicalPath, operation);
				try {
					if (operation.type === "skip")
						results.push(result(operation, "skipped", operation.evidence));
					else if (operation.type === "write") {
						if (operation.target === "sidecar")
							await mkdir(path.dirname(target), { recursive: true });
						await writeFile(target, operation.content, "utf8");
						results.push(result(operation, "applied", operation.description));
					} else if (operation.type === "delete") {
						await rm(target);
						results.push(result(operation, "applied", operation.description));
					} else {
						try {
							await rmdir(target);
							results.push(result(operation, "applied", operation.description));
						} catch (error) {
							if (!isNodeError(error, "ENOTEMPTY") && !isNodeError(error, "ENOENT")) throw error;
							results.push(result(operation, "skipped", "directory not empty or absent"));
						}
					}
				} catch (error) {
					throw ioError(`Failed to ${operation.type} ${operation.path}`, error);
				}
			}
		}
		if (!settingsEqual(batch.initialSettings, batch.finalSettings)) {
			try {
				await mkdir(path.dirname(batch.initialSettings.path), { recursive: true });
				await writeFile(
					batch.initialSettings.path,
					`${JSON.stringify(batch.finalSettings.data, null, 2)}\n`,
					"utf8",
				);
				results.push({
					type: "write-settings",
					path: ".pi/settings.json",
					outcome: "applied",
					evidence: "consolidated Pi settings",
				});
			} catch (error) {
				throw ioError("Failed to write .pi/settings.json", error);
			}
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

	private async projectRoot(): Promise<string> {
		try {
			return await realpath(this.cwd);
		} catch (error) {
			throw ioError(`Cannot resolve project root ${this.cwd}`, error);
		}
	}

	private async preflightOperation(
		canonicalPath: string,
		operation: SkillOverlayOperation,
	): Promise<void> {
		if (operation.type === "skip") return;
		const target = operationTarget(canonicalPath, operation);
		if (operation.type === "write" && operation.target === "skill-md") {
			await requireRegularFile(target, operation.path);
			return;
		}
		const agentsPath = path.join(canonicalPath, "agents");
		const agentsState = await safeLstat(agentsPath);
		if (agentsState !== undefined && (!agentsState.isDirectory() || agentsState.isSymbolicLink()))
			throw repositoryError(
				"unsafe-managed-path",
				`Refusing unexpected parent path ${path.dirname(operation.path)}.`,
				path.dirname(operation.path),
			);
		if (operation.type === "write" && operation.target === "sidecar") {
			const state = await safeLstat(target);
			if (state !== undefined && (!state.isFile() || state.isSymbolicLink()))
				throw repositoryError(
					"unsafe-managed-path",
					`Refusing unexpected write target ${operation.path}.`,
					operation.path,
				);
			if (state !== undefined && (await readFile(target, "utf8")) !== MANAGED_OPENAI_POLICY)
				throw repositoryError(
					"unexpected-managed-content",
					`Refusing non-managed sidecar ${operation.path}.`,
					operation.path,
				);
			return;
		}
		if (operation.type === "delete") {
			await requireRegularFile(target, operation.path);
			if ((await readFile(target, "utf8")) !== MANAGED_OPENAI_POLICY)
				throw repositoryError(
					"unexpected-managed-content",
					`Refusing to delete non-managed sidecar ${operation.path}.`,
					operation.path,
				);
		}
	}
}

async function resolveSkillInput(root: string, input: string) {
	if (input.trim().length === 0 || (!input.includes("/") && !path.isAbsolute(input)))
		throw new SkillExposureInputError(
			`Expected an explicit skill directory or SKILL.md path, got ${JSON.stringify(input)}.`,
		);
	const spelling = path.resolve(root, input);
	let canonical: string;
	try {
		canonical = await realpath(spelling);
	} catch (error) {
		throw skillPathResolutionError(input, error);
	}
	const state = await safeLstat(canonical);
	if (state?.isFile()) {
		if (path.basename(canonical) !== "SKILL.md")
			throw new SkillExposureInputError(`Nested files are not skill inputs: ${input}`);
		canonical = path.dirname(canonical);
	} else if (!state?.isDirectory())
		throw new SkillExposureInputError(`Skill input is not a directory or SKILL.md: ${input}`);
	const relativePath = path.relative(root, canonical).split(path.sep).join("/");
	const segments = relativePath.split("/");
	const disposition = segments[1];
	const firstPartyFamilySkill =
		segments.length === 4 && segments[0] === "skills" && isSkillDisposition(disposition);
	const firstPartyProductSkill =
		segments.length === 3 &&
		segments[0] === "skills" &&
		disposition === "incubating" &&
		(segments[2] === "brmem" || segments[2] === "slots");
	const vendored = segments.length === 3 && segments[0] === ".agents" && segments[1] === "skills";
	if (!firstPartyFamilySkill && !firstPartyProductSkill && !vendored)
		throw new SkillExposureInputError(
			`Skill path must resolve canonically to skills/<public|incubating|internal>/<family>/<name>, skills/incubating/{brmem|slots}, or .agents/skills/<name>: ${input}`,
		);
	const skill = segments.at(-1);
	if (skill === undefined || skill.length === 0)
		throw new SkillExposureInputError(`Invalid skill path: ${input}`);
	return { skill, canonicalPath: canonical, relativePath };
}

async function preflightSettings(root: string, settings: PiSettings): Promise<void> {
	if (settings.path !== path.join(root, ".pi", "settings.json"))
		throw repositoryError("unsafe-managed-path", "Unsafe Pi settings path.", settings.path);
	const parent = path.dirname(settings.path);
	const parentState = await safeLstat(parent);
	if (parentState !== undefined && (!parentState.isDirectory() || parentState.isSymbolicLink()))
		throw repositoryError("unsafe-managed-path", "Refusing unexpected .pi parent path.", ".pi");
	const state = await safeLstat(settings.path);
	if (settings.exists) {
		if (state === undefined || !state.isFile() || state.isSymbolicLink())
			throw repositoryError(
				"unsafe-managed-path",
				"Refusing unexpected .pi/settings.json write target.",
				".pi/settings.json",
			);
	} else if (state !== undefined)
		throw repositoryError(
			"unsafe-managed-path",
			"Refusing unexpected .pi/settings.json write target.",
			".pi/settings.json",
		);
}

function assertCanonicalSkill(root: string, canonicalPath: string, relativePath: string): void {
	const expected = path.join(root, ...relativePath.split("/"));
	if (
		canonicalPath !== expected ||
		(canonicalPath !== root && !canonicalPath.startsWith(`${root}${path.sep}`))
	)
		throw repositoryError(
			"unsafe-managed-path",
			`Unsafe skill path: ${relativePath}`,
			relativePath,
		);
}

function operationTarget(canonicalPath: string, operation: SkillOverlayOperation): string {
	if (operation.type === "write" && operation.target === "skill-md")
		return path.join(canonicalPath, "SKILL.md");
	if (operation.type === "remove-empty-dir") return path.join(canonicalPath, "agents");
	return path.join(canonicalPath, "agents", "openai.yaml");
}

async function inspectSidecar(
	target: string,
	display: string,
): Promise<SkillFacts["sidecarState"]> {
	const state = await safeLstat(target);
	if (state === undefined) return "missing";
	if (state.isSymbolicLink()) return "symlink";
	if (!state.isFile()) return "unexpected";
	try {
		return (await readFile(target, "utf8")) === MANAGED_OPENAI_POLICY ? "managed" : "unexpected";
	} catch (error) {
		throw ioError(`Cannot read ${display}`, error);
	}
}

async function requireDirectory(target: string, display: string): Promise<void> {
	const state = await safeLstat(target);
	if (state === undefined || !state.isDirectory() || state.isSymbolicLink())
		throw repositoryError(
			"unsafe-managed-path",
			`Refusing unexpected skill directory ${display}.`,
			display,
		);
}

async function requireRegularFile(target: string, display: string): Promise<void> {
	const state = await safeLstat(target);
	if (state === undefined || !state.isFile() || state.isSymbolicLink())
		throw repositoryError("unsafe-managed-path", `Refusing unexpected file ${display}.`, display);
}

function result(
	operation: SkillOverlayOperation,
	outcome: "applied" | "skipped",
	evidence: string,
): OperationResult {
	return { type: operation.type, path: operation.path, outcome, evidence };
}

function settingsEqual(left: PiSettings, right: PiSettings): boolean {
	return left.exists === right.exists && JSON.stringify(left.data) === JSON.stringify(right.data);
}

async function safeLstat(target: string) {
	try {
		return await lstat(target);
	} catch (error) {
		if (isNodeError(error, "ENOENT")) return undefined;
		throw ioError(`Cannot inspect ${target}`, error);
	}
}
export function skillPathResolutionError(input: string, error: unknown): Error {
	if (isNodeError(error, "ENOENT"))
		return new SkillExposureInputError(
			`Skill path does not exist: ${input} (${errorMessage(error)})`,
		);
	return ioError(`Cannot resolve skill path ${input}`, error);
}

function isSkillDisposition(value: string | undefined): boolean {
	return value === "public" || value === "incubating" || value === "internal";
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error && error.code === code;
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
function repositoryError(
	errorType: string,
	message: string,
	managedPath: string,
): SkillExposureRepositoryError {
	return new SkillExposureRepositoryError(errorType, message, { path: managedPath });
}
function ioError(message: string, error: unknown): SkillExposureIoError {
	return new SkillExposureIoError(`${message}: ${errorMessage(error)}`);
}
