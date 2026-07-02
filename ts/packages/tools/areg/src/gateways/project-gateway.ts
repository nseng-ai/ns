import type { Dirent } from "node:fs";
import { lstat, mkdir, readdir, realpath, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { formatErrorMessage } from "@sdl/core/primitives";
import { NodeCommandExecApi } from "@sdl/core/exec";
import { RealGitGateway } from "@sdl/capability-kit/git";
import type { GitGateway } from "@sdl/capability-kit/git";
import { deriveVisiblePiReplacementSurfaces } from "@sdl/pi/commands";

import {
	AREG_SKILL_FIND_ROOT_DESCRIPTORS,
	AREG_SKILL_KIND_ROOT_DESCRIPTORS,
	skillFindDescriptorForSourceType,
	skillKindDescriptorForSourceType,
} from "../gateways.ts";
import type {
	AregCheckPairingDirectory,
	AregCheckSkillInspection,
	AregErrorInfo,
	AregPiSkillInventoryInspection,
	AregProjectFileDeleteRequest,
	AregProjectGateway,
	AregProjectMutationResult,
	AregProjectRemoveEmptyDirRequest,
	AregProjectRemoveEmptyDirResult,
	AregProjectTextWriteRequest,
	AregSkillFindRootsInspection,
	AregSkillFindSkillInspection,
	AregSkillFindSourceType,
	AregSkillInspectionRequest,
	AregSkillKindResolveRequest,
	AregSkillKindResolveResult,
	AregSkillKindSkillInspection,
} from "../gateways.ts";
import { sortStrings } from "../sort.ts";
import { errorInfo } from "./errors.ts";
import { getAregProjectMutationPolicyDescriptor } from "./mutation-policy.ts";
import {
	inspectPath,
	inspectTextFile,
	isNodeErrorCode,
	resolveAllowedWriteTarget,
	resolveExistingDirectory,
	toProjectPath,
	validateSkillKindDeleteTarget,
	validateSkillKindRemoveDirTarget,
	validateWriteTarget,
} from "./project-fs.ts";
import { classifyResolvedSkillKindInspection } from "./skill-kind-classification.ts";

const PI_GENERIC_REPLACEMENT_ADAPTER_RELATIVE_PATH = ".pi/extensions/backing-skill-commands.ts";
const PI_GENERIC_REPLACEMENT_PACKAGE_MODULE_RELATIVE_PATH =
	"ts/packages/local/pi-tools/src/backing-skill-commands/extension.ts";
// AREG imports only the neutral @sdl/pi/commands surface, not project-local
// Pi extension entrypoints.
const AREG_VISIBLE_REPLACEMENT_SURFACES = deriveVisiblePiReplacementSurfaces();

export class RealAregProjectGateway implements AregProjectGateway {
	private readonly git: GitGateway;

	constructor(options: { git?: GitGateway } = {}) {
		this.git = options.git ?? new RealGitGateway(new NodeCommandExecApi());
	}

	async inspectProjectBase(request: { cwd: string; projectPath: string; env: NodeJS.ProcessEnv }) {
		const projectDir = path.resolve(request.cwd, request.projectPath);
		return {
			projectDir,
			projectPathState: await inspectPath(projectDir),
			lockfile: await inspectTextFile(path.join(projectDir, "skills-lock.json")),
			sdlToml: await inspectTextFile(path.join(projectDir, "sdl.toml")),
			aregJson: await inspectTextFile(path.join(projectDir, "areg.json")),
		};
	}

	async inspectInstructionFiles(request: { projectDir: string; env: NodeJS.ProcessEnv }) {
		return {
			agentsMd: await inspectTextFile(path.join(request.projectDir, "AGENTS.md")),
			claudeMd: await inspectTextFile(path.join(request.projectDir, "CLAUDE.md")),
			claudeDir: await inspectPath(path.join(request.projectDir, ".claude")),
			claudeSettings: await inspectTextFile(
				path.join(request.projectDir, ".claude", "settings.local.json"),
			),
		};
	}

	async inspectPiArtifacts(request: { projectDir: string; env: NodeJS.ProcessEnv }) {
		return {
			piDir: await inspectPath(path.join(request.projectDir, ".pi")),
			piSettings: await inspectTextFile(path.join(request.projectDir, ".pi", "settings.json")),
			replacement: await inspectReplacementSurfaces(request.projectDir),
		};
	}

	async inspectPiSkillInventory(request: {
		projectDir: string;
		env: NodeJS.ProcessEnv;
	}): Promise<AregPiSkillInventoryInspection> {
		return {
			skillNames: await listPiRepoFallbackSkillNames(request.projectDir),
			isApproximation: true,
			source: "repo-fallback-resolvable-skill-roots",
		};
	}

	async inspectSkillNameInventory(request: { projectDir: string; env: NodeJS.ProcessEnv }) {
		return {
			skillsDirectoryNames: await listChildNamesForSourceType(request.projectDir, "repo"),
			agentsSkillNames: await listChildNamesForSourceType(request.projectDir, "vendored"),
			claudeSkillNames: await listChildNamesForSourceType(request.projectDir, "claude"),
			skillKindNames: await listSkillKindNames(request.projectDir),
		};
	}

	async inspectSkillFindRoots(request: {
		projectDir: string;
		env: NodeJS.ProcessEnv;
	}): Promise<AregSkillFindRootsInspection> {
		return { skills: await inspectSkillFindRoots(request.projectDir) };
	}

	async inspectCheckSkill(request: AregSkillInspectionRequest): Promise<AregCheckSkillInspection> {
		return inspectCheckSkill(request.projectDir, request.skillName);
	}

	async inspectSkillKindSkill(
		request: AregSkillInspectionRequest,
	): Promise<AregSkillKindSkillInspection> {
		return inspectSkillKindSkill(request.projectDir, request.skillName);
	}

	async inspectPairingDirectories(request: {
		projectDir: string;
		env: NodeJS.ProcessEnv;
	}): Promise<readonly AregCheckPairingDirectory[]> {
		return await inspectPairingDirectories(request.projectDir);
	}

	async readLocallyExcludedSkillNames(request: {
		projectDir: string;
		env: NodeJS.ProcessEnv;
	}): Promise<readonly string[]> {
		return await readLocallyExcludedSkillNames({ projectDir: request.projectDir, git: this.git });
	}

	async resolveSkillKindSpec(
		request: AregSkillKindResolveRequest,
	): Promise<AregSkillKindResolveResult> {
		const resolved = await resolveSkillKindSpec(request);
		if (resolved.type === "error") return resolved;
		const inspected = await inspectSkillKindSkill(request.projectDir, resolved.skillName);
		return classifyResolvedSkillKindInspection({
			spec: request.spec,
			skillName: resolved.skillName,
			inspection: inspected,
		});
	}

	async preflightWriteTextFile(
		request: AregProjectTextWriteRequest,
	): Promise<AregProjectMutationResult> {
		const target = await resolveWriteTextFileTarget(request);
		return target.type === "error" ? { ok: false, error: target.error } : { ok: true };
	}

	async preflightDeleteFile(
		request: AregProjectFileDeleteRequest,
	): Promise<AregProjectMutationResult> {
		const target = await resolveDeleteFileTarget(request);
		return target.type === "error" ? { ok: false, error: target.error } : { ok: true };
	}

	async preflightRemoveEmptyDir(
		request: AregProjectRemoveEmptyDirRequest,
	): Promise<AregProjectMutationResult> {
		const target = await resolveRemoveEmptyDirTarget(request);
		return target.type === "error" ? { ok: false, error: target.error } : { ok: true };
	}

	async writeTextFile(request: AregProjectTextWriteRequest): Promise<AregProjectMutationResult> {
		const target = await resolveWriteTextFileTarget(request);
		if (target.type === "error") return { ok: false, error: target.error };
		const policyDescriptor = getAregProjectMutationPolicyDescriptor(request.policy);
		if (request.createParent) {
			try {
				await mkdir(path.dirname(target.value), { recursive: true });
			} catch (error) {
				return {
					ok: false,
					error: errorInfo(
						policyDescriptor.parentCreateFailedCode,
						`Failed to create ${path.dirname(target.value)}: ${formatErrorMessage(error)}`,
					),
				};
			}
			const revalidation = await validateWriteTarget({
				policy: request.policy,
				target: target.value,
				projectRoot: target.projectRoot,
				shouldCreateParent: request.createParent,
				description: request.description,
			});
			if (!revalidation.ok) return revalidation;
		}
		try {
			await writeFile(target.value, request.content, "utf8");
			return { ok: true };
		} catch (error) {
			return {
				ok: false,
				error: errorInfo(
					policyDescriptor.writeFailedCode,
					`Failed to write ${request.description} at ${target.value}: ${formatErrorMessage(error)}`,
				),
			};
		}
	}

	async deleteFile(request: AregProjectFileDeleteRequest): Promise<AregProjectMutationResult> {
		const target = await resolveDeleteFileTarget(request);
		if (target.type === "error") return { ok: false, error: target.error };
		try {
			await rm(target.value);
			return { ok: true };
		} catch (error) {
			return {
				ok: false,
				error: errorInfo(
					"skill-kind-delete-failed",
					`Failed to delete ${request.description} at ${target.value}: ${formatErrorMessage(error)}`,
				),
			};
		}
	}

	async removeEmptyDir(
		request: AregProjectRemoveEmptyDirRequest,
	): Promise<AregProjectRemoveEmptyDirResult> {
		const target = await resolveRemoveEmptyDirTarget(request);
		if (target.type === "error") return { ok: false, error: target.error };
		if (!target.exists) return { ok: true, removed: false };
		try {
			await rmdir(target.value);
			return { ok: true, removed: true };
		} catch (error) {
			if (isNodeErrorCode(error, "ENOTEMPTY")) return { ok: true, removed: false };
			return {
				ok: false,
				error: errorInfo(
					"skill-kind-remove-dir-failed",
					`Failed to remove ${request.description} at ${target.value}: ${formatErrorMessage(error)}`,
				),
			};
		}
	}
}

async function resolveWriteTextFileTarget(
	request: AregProjectTextWriteRequest,
): Promise<
	{ type: "ok"; value: string; projectRoot: string } | { type: "error"; error: AregErrorInfo }
> {
	const target = await resolveProjectMutationTarget(request);
	if (target.type === "error") return target;
	const validation = await validateWriteTarget({
		policy: request.policy,
		target: target.value,
		projectRoot: target.projectRoot,
		shouldCreateParent: request.createParent,
		description: request.description,
	});
	if (!validation.ok) return { type: "error", error: validation.error };
	return target;
}

async function resolveDeleteFileTarget(
	request: AregProjectFileDeleteRequest,
): Promise<{ type: "ok"; value: string } | { type: "error"; error: AregErrorInfo }> {
	const target = await resolveProjectMutationTarget(request);
	if (target.type === "error") return target;
	const validation = await validateSkillKindDeleteTarget(
		target.value,
		target.projectRoot,
		request.description,
	);
	if (!validation.ok) return { type: "error", error: validation.error };
	return { type: "ok", value: target.value };
}

async function resolveRemoveEmptyDirTarget(
	request: AregProjectRemoveEmptyDirRequest,
): Promise<
	{ type: "ok"; value: string; exists: boolean } | { type: "error"; error: AregErrorInfo }
> {
	const target = await resolveProjectMutationTarget(request);
	if (target.type === "error") return target;
	const validation = await validateSkillKindRemoveDirTarget(
		target.value,
		target.projectRoot,
		request.description,
	);
	if (!validation.ok) return { type: "error", error: validation.error };
	return { type: "ok", value: target.value, exists: validation.exists };
}

async function resolveProjectMutationTarget(request: {
	projectDir: string;
	policy: AregProjectTextWriteRequest["policy"];
	relativePath: string;
	description: string;
}): Promise<
	{ type: "ok"; value: string; projectRoot: string } | { type: "error"; error: AregErrorInfo }
> {
	const projectRoot = await resolveExistingDirectory(request.projectDir, "project root");
	if (projectRoot.type === "error") return { type: "error", error: projectRoot.error };
	const target = resolveAllowedWriteTarget({
		policy: request.policy,
		projectRoot: projectRoot.value,
		relativePath: request.relativePath,
		description: request.description,
	});
	if (target.type === "error") return { type: "error", error: target.error };
	return { type: "ok", value: target.value, projectRoot: projectRoot.value };
}

async function inspectCheckSkill(
	projectDir: string,
	name: string,
): Promise<AregCheckSkillInspection> {
	const repoDescriptor = skillFindDescriptorForSourceType("repo");
	const vendoredDescriptor = skillFindDescriptorForSourceType("vendored");
	const claudeDescriptor = skillFindDescriptorForSourceType("claude");
	const repoBase = toProjectPath(projectDir, `${repoDescriptor.root}/${name}`);
	const vendoredBase = toProjectPath(projectDir, `${vendoredDescriptor.root}/${name}`);
	const localSkillMd = await inspectTextFile(path.join(repoBase, "SKILL.md"));
	const remoteSkillMd = await inspectTextFile(path.join(vendoredBase, "SKILL.md"));
	const policyRoot = localSkillMd.type === "file" ? repoDescriptor.root : vendoredDescriptor.root;
	return {
		name,
		skillsPath: await inspectPath(repoBase),
		agentsPath: await inspectPath(vendoredBase),
		claudePath: await inspectPath(toProjectPath(projectDir, `${claudeDescriptor.root}/${name}`)),
		localSkillMd,
		remoteSkillMd,
		openaiPolicy: await inspectTextFile(
			toProjectPath(projectDir, `${policyRoot}/${name}/agents/openai.yaml`),
		),
	};
}

async function listPiRepoFallbackSkillNames(projectDir: string): Promise<string[]> {
	const names = await Promise.all(
		AREG_SKILL_KIND_ROOT_DESCRIPTORS.map((descriptor) =>
			listSkillsWithSkillMd(toProjectPath(projectDir, descriptor.root)),
		),
	);
	return sortStrings([...new Set(names.flat())]);
}

async function listSkillKindNames(projectDir: string): Promise<string[]> {
	const names = await Promise.all(
		AREG_SKILL_KIND_ROOT_DESCRIPTORS.map((descriptor) =>
			descriptor.sourceType === "repo"
				? listFirstPartySkillKindNames(projectDir)
				: listVendoredSkillKindNames(projectDir),
		),
	);
	return sortStrings([...new Set(names.flat())]);
}

async function listFirstPartySkillKindNames(projectDir: string): Promise<string[]> {
	const descriptor = skillKindDescriptorForSourceType("repo");
	const skillsRoot = toProjectPath(projectDir, descriptor.root);
	return await scanSkillDirectoryNames(skillsRoot, {
		keepEntry: async (entry) => {
			const skillMd = await inspectPath(path.join(skillsRoot, entry.name, "SKILL.md"));
			return entry.isDirectory() || entry.isSymbolicLink() || skillMd.type !== "missing";
		},
	});
}

async function listSkillsWithSkillMd(root: string): Promise<string[]> {
	return await scanSkillDirectoryNames(root, {
		keepEntry: async (entry) =>
			(await inspectTextFile(path.join(root, entry.name, "SKILL.md"))).type === "file",
	});
}

async function listVendoredSkillKindNames(projectDir: string): Promise<string[]> {
	const descriptor = skillKindDescriptorForSourceType("vendored");
	const agentsRoot = toProjectPath(projectDir, descriptor.root);
	return await scanSkillDirectoryNames(agentsRoot, {
		keepEntry: async (entry) => {
			if (entry.isSymbolicLink()) return false;
			const skillMd = await inspectPath(path.join(agentsRoot, entry.name, "SKILL.md"));
			return entry.isDirectory() || skillMd.type !== "missing";
		},
	});
}

async function inspectSkillFindRoots(projectDir: string): Promise<AregSkillFindSkillInspection[]> {
	const skills: AregSkillFindSkillInspection[] = [];
	for (const root of AREG_SKILL_FIND_ROOT_DESCRIPTORS) {
		const rootPath = toProjectPath(projectDir, root.root);
		const names = await scanSkillDirectoryNames(rootPath, {
			keepEntry: async (entry) =>
				(entry.isDirectory() || entry.isSymbolicLink()) &&
				(await inspectTextFile(path.join(rootPath, entry.name, "SKILL.md"))).type === "file",
		});
		for (const name of names) {
			const baseRelativePath = `${root.root}/${name}`;
			const basePath = path.join(rootPath, name);
			skills.push({
				name,
				root: root.root,
				sourceType: root.sourceType,
				baseRelativePath,
				skillDir: await inspectPath(basePath),
				skillMd: await inspectTextFile(path.join(basePath, "SKILL.md")),
			});
		}
	}
	return skills;
}

async function scanSkillDirectoryNames(
	root: string,
	options: {
		keepEntry: (entry: Dirent) => Promise<boolean>;
	},
): Promise<string[]> {
	try {
		const rootInfo = await lstat(root);
		if (!rootInfo.isDirectory()) return [];
		const entries = await readdir(root, { withFileTypes: true });
		const names: string[] = [];
		for (const entry of entries) {
			if (entry.name === ".DS_Store") continue;
			if (await options.keepEntry(entry)) names.push(entry.name);
		}
		return names;
	} catch {
		// Skill root inventory is best-effort: absent or unreadable roots behave like empty
		// roots so diagnostics can continue from the remaining registry sources.
		return [];
	}
}

async function inspectSkillKindSkill(
	projectDir: string,
	name: string,
): Promise<AregSkillKindSkillInspection> {
	const repoDescriptor = skillKindDescriptorForSourceType("repo");
	const repoBase = toProjectPath(projectDir, `${repoDescriptor.root}/${name}`);
	const repoDir = await inspectPath(repoBase);
	const repoSkillMd = await inspectTextFile(path.join(repoBase, "SKILL.md"));
	if (repoDir.type !== "missing" || repoSkillMd.type !== "missing") {
		return {
			name,
			sourceType: repoDescriptor.sourceType,
			baseRelativePath: `${repoDescriptor.root}/${name}`,
			skillDir: repoDir,
			skillMd: repoSkillMd,
			openaiPolicy: await inspectTextFile(path.join(repoBase, "agents", "openai.yaml")),
		};
	}
	const vendoredDescriptor = skillKindDescriptorForSourceType("vendored");
	const vendoredBase = toProjectPath(projectDir, `${vendoredDescriptor.root}/${name}`);
	return {
		name,
		sourceType: vendoredDescriptor.sourceType,
		baseRelativePath: `${vendoredDescriptor.root}/${name}`,
		skillDir: await inspectPath(vendoredBase),
		skillMd: await inspectTextFile(path.join(vendoredBase, "SKILL.md")),
		openaiPolicy: await inspectTextFile(path.join(vendoredBase, "agents", "openai.yaml")),
	};
}

async function resolveSkillKindSpec(
	request: AregSkillKindResolveRequest,
): Promise<AregSkillKindResolveResult> {
	if (!isPathLikeSkillSpec(request.spec)) return { type: "ok", skillName: request.spec };
	const candidate = path.resolve(request.cwd, request.spec);
	const projectDir = await realpath(request.projectDir);
	const canonical = await canonicalSkillKindPath(projectDir, candidate);
	if (canonical.type === "ok") return canonical;
	if (canonical.error.code === "skill-kind-outside-managed-skills") {
		return {
			type: "error",
			error: errorInfo(
				"skill-kind-non-managed-skill",
				`Skill spec does not resolve to a managed skill: ${request.spec}`,
			),
		};
	}
	return canonical;
}

async function canonicalSkillKindPath(
	projectDir: string,
	candidate: string,
): Promise<AregSkillKindResolveResult> {
	const direct = classifyCanonicalSkillPath(projectDir, candidate);
	if (direct.type === "ok") return direct;
	if (direct.error.code === "skill-kind-nested-spec") return direct;
	try {
		const resolved = await realpath(candidate);
		return classifyCanonicalSkillPath(projectDir, resolved);
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT"))
			return {
				type: "error",
				error: errorInfo("skill-kind-missing-spec", `Skill path does not exist: ${candidate}`),
			};
		return {
			type: "error",
			error: errorInfo(
				"skill-kind-resolve-failed",
				`Could not resolve skill path ${candidate}: ${formatErrorMessage(error)}`,
			),
		};
	}
}

function classifyCanonicalSkillPath(
	projectDir: string,
	candidate: string,
): AregSkillKindResolveResult {
	const roots = AREG_SKILL_KIND_ROOT_DESCRIPTORS.map((descriptor) =>
		toProjectPath(projectDir, descriptor.root),
	);
	for (const root of roots) {
		const classified = classifySkillPathUnderRoot(root, candidate);
		if (classified.type === "ok" || classified.error.code === "skill-kind-nested-spec")
			return classified;
	}
	return {
		type: "error",
		error: errorInfo(
			"skill-kind-outside-managed-skills",
			`Skill path is outside ${AREG_SKILL_KIND_ROOT_DESCRIPTORS.map((descriptor) => descriptor.root).join(" and ")}: ${candidate}`,
		),
	};
}

function classifySkillPathUnderRoot(root: string, candidate: string): AregSkillKindResolveResult {
	const relative = path.relative(root, candidate);
	if (relative.length === 0 || relative.startsWith("..") || path.isAbsolute(relative)) {
		return {
			type: "error",
			error: errorInfo(
				"skill-kind-outside-managed-skills",
				`Skill path is outside ${root}: ${candidate}`,
			),
		};
	}
	const parts = relative.split(path.sep).filter((part) => part.length > 0);
	const skillName = parts[0];
	if (skillName === undefined)
		return {
			type: "error",
			error: errorInfo("skill-kind-invalid-spec", `Invalid skill path: ${candidate}`),
		};
	if (parts.length === 1) return { type: "ok", skillName };
	if (parts.length === 2 && parts[1] === "SKILL.md") return { type: "ok", skillName };
	return {
		type: "error",
		error: errorInfo(
			"skill-kind-nested-spec",
			`Skill path must be skills/<name>, .agents/skills/<name>, or a direct SKILL.md: ${candidate}`,
		),
	};
}

function isPathLikeSkillSpec(spec: string): boolean {
	return (
		path.isAbsolute(spec) || spec.includes("/") || spec.includes("\\") || spec.endsWith("SKILL.md")
	);
}

async function inspectReplacementSurfaces(
	projectDir: string,
): Promise<{ verifiedSurfaces: readonly string[] }> {
	const hasAdapter =
		(await inspectTextFile(path.join(projectDir, PI_GENERIC_REPLACEMENT_ADAPTER_RELATIVE_PATH)))
			.type === "file";
	const hasPackageModule =
		(
			await inspectTextFile(
				path.join(projectDir, PI_GENERIC_REPLACEMENT_PACKAGE_MODULE_RELATIVE_PATH),
			)
		).type === "file";
	return {
		verifiedSurfaces: hasAdapter && hasPackageModule ? [...AREG_VISIBLE_REPLACEMENT_SURFACES] : [],
	};
}

async function listChildNamesForSourceType(
	projectDir: string,
	sourceType: AregSkillFindSourceType,
): Promise<string[]> {
	const descriptor = skillFindDescriptorForSourceType(sourceType);
	return await listChildNames(toProjectPath(projectDir, descriptor.root));
}

async function listChildNames(directory: string): Promise<string[]> {
	try {
		const info = await lstat(directory);
		if (!info.isDirectory()) return [];
		const entries = await readdir(directory);
		return sortStrings(entries.filter((entry) => entry !== ".DS_Store"));
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT")) return [];
		return [];
	}
}

async function readLocallyExcludedSkillNames(options: {
	projectDir: string;
	git: GitGateway;
}): Promise<string[]> {
	const gitPath = await options.git.gitPath({
		cwd: options.projectDir,
		relativePath: "info/exclude",
	});
	if (!gitPath.ok) return [];
	const exclude = await inspectTextFile(gitPath.value);
	if (exclude.type !== "file") return [];
	const prefixes = [".agents/skills/", ".claude/skills/"];
	const names = new Set<string>();
	for (const rawLine of exclude.text.split(/\r?\n/u)) {
		const line = rawLine.trim();
		if (line.length === 0 || line.startsWith("#")) continue;
		for (const prefix of prefixes) {
			if (line.startsWith(prefix)) names.add(line.slice(prefix.length));
		}
	}
	return sortStrings([...names]);
}

async function inspectPairingDirectories(projectDir: string): Promise<AregCheckPairingDirectory[]> {
	const results: AregCheckPairingDirectory[] = [];
	async function visit(directory: string, relativeDir: string): Promise<void> {
		let entries;
		try {
			entries = await readdir(directory, { withFileTypes: true });
		} catch {
			// Pairing directory inspection is best-effort; unreadable or disappearing directories
			// should not fail the whole project inspection.
			return;
		}
		const names = new Set(entries.map((entry) => entry.name));
		const hasAgents =
			names.has("AGENTS.md") &&
			(await inspectTextFile(path.join(directory, "AGENTS.md"))).type === "file";
		const claude = names.has("CLAUDE.md")
			? await inspectTextFile(path.join(directory, "CLAUDE.md"))
			: { type: "missing" as const };
		const hasClaude = claude.type === "file";
		if (hasAgents || hasClaude) {
			results.push({
				relativeDir,
				hasAgents,
				hasClaude,
				...(claude.type === "file" ? { claudeText: claude.text } : {}),
			});
		}
		const subdirs = sortStrings(
			entries
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name)
				.filter((name) => ![".venv", ".git", "node_modules"].includes(name)),
		);
		for (const name of subdirs) {
			const childRelative = relativeDir.length === 0 ? name : `${relativeDir}/${name}`;
			if (childRelative === ".agents/skills" || childRelative === ".claude/skills") continue;
			await visit(path.join(directory, name), childRelative);
		}
	}
	await visit(projectDir, "");
	return results;
}
