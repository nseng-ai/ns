import type { Dirent } from "node:fs";
import { lstat, mkdir, readdir, realpath, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { RealGitGateway } from "@nseng-ai/capability-kit/git";
import { visibleCommandBackedReplacementSurfaces } from "@nseng-ai/command-backed-skill-registry";
import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import {
	SKILL_LOOKUP_ROOT_DESCRIPTORS,
	skillLookupBaseRelativePath,
	skillLookupDescriptorForSourceType,
	skillLookupFileRelativePath,
	type SkillLookupSourceType,
} from "@nseng-ai/foundation/skill-lookup";
import {
	ALL_HARNESS_IDS,
	INSTALL_MANIFEST_FILE_NAME,
	readInstallManifestAtRoot,
	resolveHarnessSkillRoot,
	sortStrings,
	type InstallManifestEntryData,
} from "@nseng-ai/harness-artifacts/api";

import {
	AREG_SKILL_KIND_ROOT_DESCRIPTORS,
	groupBySkillName,
	skillKindDescriptorForSourceType,
} from "../gateways.ts";
import type {
	AregCheckPairingDirectory,
	AregCheckSkillInspection,
	AregErrorInfo,
	AregGitGateway,
	AregManifestInspectionError,
	AregManifestSkillSourceInspection,
	AregManifestSkillSourcesInspection,
	AregPiSkillInventoryInspection,
	AregProjectFileDeleteRequest,
	AregProjectGateway,
	AregProjectMutationResult,
	AregProjectRemoveEmptyDirRequest,
	AregProjectRemoveEmptyDirResult,
	AregProjectSymlinkDeleteRequest,
	AregProjectTextWriteRequest,
	AregSkillFindRootsInspection,
	AregSkillFindSkillInspection,
	AregSkillInspectionRequest,
	AregSkillKindResolveRequest,
	AregSkillKindResolveResult,
	AregSkillKindSkillInspection,
	TextFileState,
} from "../gateways.ts";
import { errorInfo } from "./errors.ts";
import { getAregProjectMutationPolicyDescriptor } from "./mutation-policy.ts";
import {
	inspectPath,
	inspectTextFile,
	isNodeErrorCode,
	resolveAllowedWriteTarget,
	resolveExistingDirectory,
	toProjectPath,
	validateSkillKindDeleteSymlinkTarget,
	validateSkillKindDeleteTarget,
	validateSkillKindRemoveDirTarget,
	validateWriteTarget,
} from "./project-fs.ts";
import { classifyResolvedSkillKindInspection } from "./skill-kind-classification.ts";

const PI_GENERIC_REPLACEMENT_ADAPTER_RELATIVE_PATH = ".pi/extensions/backing-skill-commands.ts";
const PI_GENERIC_REPLACEMENT_PACKAGE_MODULE_RELATIVE_PATH =
	"ts/packages/internal/pi-tools/src/backing-skill-commands/extension.ts";
// AREG reads the composed command-backed skill catalog without importing
// the project-local Pi extension entrypoint.
const AREG_VISIBLE_REPLACEMENT_SURFACES = visibleCommandBackedReplacementSurfaces();

export class RealAregProjectGateway implements AregProjectGateway {
	private readonly git: AregGitGateway;

	constructor(options: { git?: AregGitGateway } = {}) {
		this.git = options.git ?? new RealGitGateway(new NodeCommandExecApi());
	}

	async inspectProjectBase(request: { cwd: string; projectPath: string; env: NodeJS.ProcessEnv }) {
		const projectDir = path.resolve(request.cwd, request.projectPath);
		return {
			projectDir,
			projectPathState: await inspectPath(projectDir),
			lockfile: await inspectTextFile(path.join(projectDir, "skills-lock.json")),
			nsToml: await inspectTextFile(path.join(projectDir, "ns.toml")),
			aregJson: await inspectTextFile(path.join(projectDir, "areg.json")),
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

	async inspectManifestSkillSources(request: {
		projectDir: string;
		env: NodeJS.ProcessEnv;
	}): Promise<AregManifestSkillSourcesInspection> {
		return inspectManifestSkillSources(request.projectDir, request.env);
	}

	async inspectSkillFindRoots(request: {
		projectDir: string;
		env: NodeJS.ProcessEnv;
	}): Promise<AregSkillFindRootsInspection> {
		return { skills: await inspectSkillFindRoots(request.projectDir, request.env) };
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

	async preflightDeleteSymlink(
		request: AregProjectSymlinkDeleteRequest,
	): Promise<AregProjectMutationResult> {
		const target = await resolveDeleteSymlinkTarget(request);
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

	async deleteSymlink(
		request: AregProjectSymlinkDeleteRequest,
	): Promise<AregProjectMutationResult> {
		const target = await resolveDeleteSymlinkTarget(request);
		if (target.type === "error") return { ok: false, error: target.error };
		try {
			await unlink(target.value);
			return { ok: true };
		} catch (error) {
			return {
				ok: false,
				error: errorInfo(
					"skill-kind-delete-symlink-failed",
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

async function resolveDeleteSymlinkTarget(
	request: AregProjectSymlinkDeleteRequest,
): Promise<{ type: "ok"; value: string } | { type: "error"; error: AregErrorInfo }> {
	const projectRoot = await resolveExistingDirectory(request.projectDir, "project root");
	if (projectRoot.type === "error") return { type: "error", error: projectRoot.error };
	if (path.isAbsolute(request.relativePath) || request.relativePath.split("/").includes("..")) {
		return {
			type: "error",
			error: errorInfo(
				"skill-kind-delete-symlink-refused",
				`Refusing to delete ${request.description}: unsafe target ${request.relativePath}.`,
			),
		};
	}
	const target = toProjectPath(projectRoot.value, request.relativePath);
	const validation = await validateSkillKindDeleteSymlinkTarget(
		target,
		projectRoot.value,
		request.relativePath,
		request.description,
	);
	if (!validation.ok) return { type: "error", error: validation.error };
	return { type: "ok", value: target };
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
	const repoDescriptor = skillLookupDescriptorForSourceType("repo");
	const vendoredDescriptor = skillLookupDescriptorForSourceType("vendored");
	const claudeDescriptor = skillLookupDescriptorForSourceType("claude");
	const repoBase = toProjectPath(
		projectDir,
		skillLookupBaseRelativePath(repoDescriptor.root, name),
	);
	const vendoredBase = toProjectPath(
		projectDir,
		skillLookupBaseRelativePath(vendoredDescriptor.root, name),
	);
	const localSkillMd = await inspectTextFile(
		toProjectPath(projectDir, skillLookupFileRelativePath(repoDescriptor.root, name)),
	);
	const remoteSkillMd = await inspectTextFile(
		toProjectPath(projectDir, skillLookupFileRelativePath(vendoredDescriptor.root, name)),
	);
	const policyRoot = localSkillMd.type === "file" ? repoDescriptor.root : vendoredDescriptor.root;
	return {
		name,
		skillsPath: await inspectPath(repoBase),
		agentsPath: await inspectPath(vendoredBase),
		claudePath: await inspectPath(
			toProjectPath(projectDir, skillLookupBaseRelativePath(claudeDescriptor.root, name)),
		),
		localSkillMd,
		remoteSkillMd,
		openaiPolicy: await inspectTextFile(
			toProjectPath(
				projectDir,
				`${skillLookupBaseRelativePath(policyRoot, name)}/agents/openai.yaml`,
			),
		),
	};
}

async function listPiRepoFallbackSkillNames(projectDir: string): Promise<string[]> {
	return collectSortedUniqueNames(
		await Promise.all(
			AREG_SKILL_KIND_ROOT_DESCRIPTORS.map((descriptor) =>
				listSkillsWithSkillMd(toProjectPath(projectDir, descriptor.root), {
					includeSymlinks: descriptor.sourceType !== "vendored",
				}),
			),
		),
	);
}

async function listSkillKindNames(projectDir: string): Promise<string[]> {
	return collectSortedUniqueNames(
		await Promise.all(
			AREG_SKILL_KIND_ROOT_DESCRIPTORS.map((descriptor) =>
				descriptor.sourceType === "repo"
					? listFirstPartySkillKindNames(projectDir)
					: listVendoredSkillKindNames(projectDir),
			),
		),
	);
}

function collectSortedUniqueNames(namesByRoot: readonly (readonly string[])[]): string[] {
	return sortStrings([...new Set(namesByRoot.flat())]);
}

async function listFirstPartySkillKindNames(projectDir: string): Promise<string[]> {
	const descriptor = skillKindDescriptorForSourceType("repo");
	const skillsRoot = toProjectPath(projectDir, descriptor.root);
	return (
		await scanSkillRootEntries(skillsRoot, {
			includeSymlinks: true,
			keepEntry: (entry) =>
				entry.dirent.isDirectory() ||
				entry.dirent.isSymbolicLink() ||
				entry.skillMd.type !== "missing",
		})
	).map((entry) => entry.name);
}

async function listSkillsWithSkillMd(
	root: string,
	options: ScanSkillRootOptions,
): Promise<string[]> {
	return (
		await scanSkillRootEntries(root, {
			...options,
			keepEntry: (entry) => entry.skillMd.type === "file",
		})
	).map((entry) => entry.name);
}

async function listVendoredSkillKindNames(projectDir: string): Promise<string[]> {
	const descriptor = skillKindDescriptorForSourceType("vendored");
	const agentsRoot = toProjectPath(projectDir, descriptor.root);
	return (
		await scanSkillRootEntries(agentsRoot, {
			includeSymlinks: false,
			keepEntry: (entry) => entry.dirent.isDirectory() || entry.skillMd.type !== "missing",
		})
	).map((entry) => entry.name);
}

async function inspectManifestSkillSources(
	projectDir: string,
	env: NodeJS.ProcessEnv,
): Promise<AregManifestSkillSourcesInspection> {
	const sources: AregManifestSkillSourceInspection[] = [];
	const errors: AregManifestInspectionError[] = [];
	const context = { projectRoot: projectDir, homeDir: env.HOME ?? "", env };
	for (const harness of ALL_HARNESS_IDS) {
		const root = resolveHarnessSkillRoot({ harness, scope: "project", context });
		if (!root.ok) {
			errors.push({ manifestPath: harness, message: root.error.message });
			continue;
		}
		const manifestPath = path.join(root.value.rootPath, INSTALL_MANIFEST_FILE_NAME);
		const manifest = await readInstallManifestAtRoot({ targetRoot: root.value.rootPath });
		if (!manifest.ok) {
			errors.push({ manifestPath, message: manifest.error.message });
			continue;
		}
		for (const [manifestKey, entry] of Object.entries(manifest.value.artifacts)) {
			if (entry.kind !== "skill") continue;
			sources.push(await inspectManifestSkillSource(projectDir, manifestPath, manifestKey, entry));
		}
	}
	return { sources: sortManifestSkillSources(sources), errors };
}

async function inspectManifestSkillSource(
	projectDir: string,
	manifestPath: string,
	manifestKey: string,
	entry: InstallManifestEntryData,
): Promise<AregManifestSkillSourceInspection> {
	return {
		skillName: entry.provisionName,
		harness: entry.harness,
		scope: entry.scope,
		manifestPath,
		manifestKey,
		source: { ...entry.source },
		targetRootRelativePath: path.relative(projectDir, entry.targetRoot),
		targetSkillRelativePath: path.relative(projectDir, entry.targetArtifactPath),
		skillDir: await inspectPath(entry.targetArtifactPath),
		skillMd: await inspectTextFile(path.join(entry.targetArtifactPath, "SKILL.md")),
	};
}

function sortManifestSkillSources(
	sources: readonly AregManifestSkillSourceInspection[],
): AregManifestSkillSourceInspection[] {
	return [...sources].sort(
		(left, right) =>
			left.skillName.localeCompare(right.skillName) ||
			left.harness.localeCompare(right.harness) ||
			left.manifestKey.localeCompare(right.manifestKey),
	);
}

async function inspectSkillFindRoots(
	projectDir: string,
	env: NodeJS.ProcessEnv,
): Promise<AregSkillFindSkillInspection[]> {
	const skills: AregSkillFindSkillInspection[] = [];
	const manifestInspection = await inspectManifestSkillSources(projectDir, env);
	const manifestSourcesBySkill = groupBySkillName(manifestInspection.sources);
	for (const root of SKILL_LOOKUP_ROOT_DESCRIPTORS) {
		const rootPath = toProjectPath(projectDir, root.root);
		const entries = await scanSkillRootEntries(rootPath, {
			includeSymlinks: root.sourceType !== "vendored",
			keepEntry: (entry) =>
				(entry.dirent.isDirectory() || entry.dirent.isSymbolicLink()) &&
				entry.skillMd.type === "file",
		});
		for (const entry of entries) {
			const baseRelativePath = skillLookupBaseRelativePath(root.root, entry.name);
			const basePath = path.join(rootPath, entry.name);
			const manifestSources = manifestSourcesBySkill.get(entry.name);
			skills.push({
				name: entry.name,
				root: root.root,
				sourceType: root.sourceType,
				baseRelativePath,
				skillDir: await inspectPath(basePath),
				skillMd: entry.skillMd,
				...(manifestSources === undefined ? {} : { manifestSources }),
			});
		}
	}
	return skills;
}

interface ScanSkillRootOptions {
	includeSymlinks: boolean;
}

interface ScannedSkillRootEntry {
	name: string;
	dirent: Dirent;
	skillMd: TextFileState;
}

async function scanSkillRootEntries(
	root: string,
	options: ScanSkillRootOptions & {
		keepEntry: (entry: ScannedSkillRootEntry) => boolean;
	},
): Promise<ScannedSkillRootEntry[]> {
	try {
		const rootInfo = await lstat(root);
		if (!rootInfo.isDirectory()) return [];
		const dirents = await readdir(root, { withFileTypes: true });
		const entries: ScannedSkillRootEntry[] = [];
		for (const dirent of dirents) {
			if (dirent.name === ".DS_Store") continue;
			if (!options.includeSymlinks && dirent.isSymbolicLink()) continue;
			const entry = {
				name: dirent.name,
				dirent,
				skillMd: await inspectTextFile(path.join(root, dirent.name, "SKILL.md")),
			};
			if (options.keepEntry(entry)) entries.push(entry);
		}
		return entries;
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
	const repoBase = toProjectPath(
		projectDir,
		skillLookupBaseRelativePath(repoDescriptor.root, name),
	);
	const repoDir = await inspectPath(repoBase);
	const repoSkillMd = await inspectTextFile(
		toProjectPath(projectDir, skillLookupFileRelativePath(repoDescriptor.root, name)),
	);
	const agentsPath = await inspectPath(toProjectPath(projectDir, `.agents/skills/${name}`));
	const claudePath = await inspectPath(toProjectPath(projectDir, `.claude/skills/${name}`));
	if (repoDir.type !== "missing" || repoSkillMd.type !== "missing") {
		return {
			name,
			sourceType: repoDescriptor.sourceType,
			baseRelativePath: skillLookupBaseRelativePath(repoDescriptor.root, name),
			skillDir: repoDir,
			skillMd: repoSkillMd,
			openaiPolicy: await inspectTextFile(path.join(repoBase, "agents", "openai.yaml")),
			agentsPath,
			claudePath,
		};
	}
	const vendoredDescriptor = skillKindDescriptorForSourceType("vendored");
	const vendoredBase = toProjectPath(
		projectDir,
		skillLookupBaseRelativePath(vendoredDescriptor.root, name),
	);
	return {
		name,
		sourceType: vendoredDescriptor.sourceType,
		baseRelativePath: skillLookupBaseRelativePath(vendoredDescriptor.root, name),
		skillDir: await inspectPath(vendoredBase),
		skillMd: await inspectTextFile(
			toProjectPath(projectDir, skillLookupFileRelativePath(vendoredDescriptor.root, name)),
		),
		openaiPolicy: await inspectTextFile(path.join(vendoredBase, "agents", "openai.yaml")),
		agentsPath,
		claudePath,
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
	sourceType: SkillLookupSourceType,
): Promise<string[]> {
	const descriptor = skillLookupDescriptorForSourceType(sourceType);
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
	git: AregGitGateway;
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
