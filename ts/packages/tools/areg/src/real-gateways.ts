import {
	lstat,
	mkdir,
	readdir,
	readFile,
	readlink,
	realpath,
	rm,
	rmdir,
	writeFile,
} from "node:fs/promises";
import path from "node:path";

import { NodeCommandExecApi } from "@sdl/core/exec";
import { RealGitGateway } from "@sdl/git";
import type { GitGateway } from "@sdl/capability-kit/git";
import { formatErrorMessage } from "@sdl/core/primitives";
import { deriveVisiblePiReplacementSurfaces } from "@sdl/pi/commands";

export { RealAregGithubGateway } from "./gateways/github-gateway.ts";
export { RealAregHostGateway } from "./gateways/host-gateway.ts";
export { buildNpxSkillsAddArgs, RealAregNpxSkillsGateway } from "./gateways/npx-skills-gateway.ts";
export { RealAregPromptGateway } from "./gateways/prompt-gateway.ts";
export { RealAregSkillxWorkspaceGateway } from "./gateways/skillx-workspace-gateway.ts";

import type {
	AregCheckPairingDirectory,
	AregCheckSkillInspection,
	AregErrorInfo,
	AregPathState,
	AregProjectFileDeleteRequest,
	AregProjectGateway,
	AregProjectMutationResult,
	AregProjectRemoveEmptyDirRequest,
	AregProjectRemoveEmptyDirResult,
	AregProjectTextWriteRequest,
	AregSkillInspectionRequest,
	AregSkillKindResolveRequest,
	AregSkillKindResolveResult,
	AregSkillKindSkillInspection,
	AregTextFileState,
} from "./gateways.ts";
import { sortStrings } from "./sort.ts";

const PI_GENERIC_REPLACEMENT_ADAPTER_RELATIVE_PATH = ".pi/extensions/backing-skill-commands.ts";
const PI_GENERIC_REPLACEMENT_PACKAGE_MODULE_RELATIVE_PATH =
	"ts/packages/local-pi-tools/backing-skill-commands/src/extension.ts";
// AREG imports only the neutral @sdl/pi/commands surface, not project-local
// Pi extension entrypoints.
const AREG_VISIBLE_REPLACEMENT_SURFACES = deriveVisiblePiReplacementSurfaces();

interface ResolveAllowedTargetOptions {
	projectRoot: string;
	relativePath: string;
	isAllowedRelativePath: (relativePath: string) => boolean;
	errorCode: string;
	shouldCheckUnsupportedFirst: boolean;
	unsupportedMessage: (relativePath: string) => string;
	unsafeMessage: (relativePath: string) => string;
	outsideMessage: (relativePath: string) => string;
}

interface SkillKindWriteTargetValidationOptions {
	target: string;
	projectRoot: string;
	shouldCreateParent: boolean;
	description: string;
}

interface ValidateTextWriteTargetOptions {
	target: string;
	projectRoot: string;
	description: string;
	shouldCreateParent: boolean;
	symlinkCode: string;
	notFileCode: string;
	parentSymlinkCode: string;
	parentNotDirectoryCode: string;
	parentMissingCode: string;
}

type WriteTargetValidationResult = { ok: true } | { ok: false; error: AregErrorInfo };

export class RealAregProjectGateway implements AregProjectGateway {
	private readonly git: GitGateway;

	constructor(options: { git?: GitGateway | undefined } = {}) {
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

	async inspectSkillNameInventory(request: { projectDir: string; env: NodeJS.ProcessEnv }) {
		return {
			skillsDirectoryNames: await listChildNames(path.join(request.projectDir, "skills")),
			agentsSkillNames: await listChildNames(path.join(request.projectDir, ".agents", "skills")),
			claudeSkillNames: await listChildNames(path.join(request.projectDir, ".claude", "skills")),
			skillKindNames: await listSkillKindNames(request.projectDir),
		};
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
		if (inspected.skillDir.type === "symlink")
			return {
				type: "error",
				error: errorInfo(
					"skill-kind-symlink-skill-dir",
					`${inspected.baseRelativePath} is a symlink; refusing to manage invocation metadata`,
				),
			};
		if (inspected.skillDir.type !== "directory")
			return {
				type: "error",
				error: errorInfo("skill-kind-missing-skill", `Managed skill not found: ${request.spec}`),
			};
		if (inspected.skillMd.type === "symlink")
			return {
				type: "error",
				error: errorInfo(
					"skill-kind-symlink-skill-md",
					`${inspected.baseRelativePath}/SKILL.md is a symlink; refusing to manage invocation metadata`,
				),
			};
		if (inspected.skillMd.type !== "file")
			return {
				type: "error",
				error: errorInfo(
					"skill-kind-missing-skill-md",
					`${inspected.baseRelativePath}/SKILL.md does not exist`,
				),
			};
		return { type: "ok", skillName: resolved.skillName };
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
		if (request.createParent) {
			try {
				await mkdir(path.dirname(target.value), { recursive: true });
			} catch (error) {
				const code =
					request.policy === "init"
						? "init-parent-create-failed"
						: "skill-kind-parent-create-failed";
				return {
					ok: false,
					error: errorInfo(
						code,
						`Failed to create ${path.dirname(target.value)}: ${formatErrorMessage(error)}`,
					),
				};
			}
			const revalidation =
				request.policy === "init"
					? await validateInitWriteTarget(target.value, target.projectRoot, request)
					: await validateSkillKindWriteTarget({
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
			const code = request.policy === "init" ? "init-write-failed" : "skill-kind-write-failed";
			return {
				ok: false,
				error: errorInfo(
					code,
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
	const projectRoot = await resolveExistingDirectory(request.projectDir, "project root");
	if (projectRoot.type === "error") return { type: "error", error: projectRoot.error };
	const target =
		request.policy === "init"
			? resolveAllowedInitTarget(projectRoot.value, request)
			: resolveAllowedSkillKindTarget(projectRoot.value, request.relativePath, request.description);
	if (target.type === "error") return { type: "error", error: target.error };
	const validation =
		request.policy === "init"
			? await validateInitWriteTarget(target.value, projectRoot.value, request)
			: await validateSkillKindWriteTarget({
					target: target.value,
					projectRoot: projectRoot.value,
					shouldCreateParent: request.createParent,
					description: request.description,
				});
	if (!validation.ok) return { type: "error", error: validation.error };
	return { type: "ok", value: target.value, projectRoot: projectRoot.value };
}

async function resolveDeleteFileTarget(
	request: AregProjectFileDeleteRequest,
): Promise<{ type: "ok"; value: string } | { type: "error"; error: AregErrorInfo }> {
	const projectRoot = await resolveExistingDirectory(request.projectDir, "project root");
	if (projectRoot.type === "error") return { type: "error", error: projectRoot.error };
	const target = resolveAllowedSkillKindTarget(
		projectRoot.value,
		request.relativePath,
		request.description,
	);
	if (target.type === "error") return { type: "error", error: target.error };
	const validation = await validateSkillKindDeleteTarget(
		target.value,
		projectRoot.value,
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
	const projectRoot = await resolveExistingDirectory(request.projectDir, "project root");
	if (projectRoot.type === "error") return { type: "error", error: projectRoot.error };
	const target = resolveAllowedSkillKindTarget(
		projectRoot.value,
		request.relativePath,
		request.description,
	);
	if (target.type === "error") return { type: "error", error: target.error };
	const validation = await validateSkillKindRemoveDirTarget(
		target.value,
		projectRoot.value,
		request.description,
	);
	if (!validation.ok) return { type: "error", error: validation.error };
	return { type: "ok", value: target.value, exists: validation.exists };
}

async function inspectCheckSkill(
	projectDir: string,
	name: string,
): Promise<AregCheckSkillInspection> {
	const localSkillMd = await inspectTextFile(path.join(projectDir, "skills", name, "SKILL.md"));
	const remoteSkillMd = await inspectTextFile(
		path.join(projectDir, ".agents", "skills", name, "SKILL.md"),
	);
	return {
		name,
		skillsPath: await inspectPath(path.join(projectDir, "skills", name)),
		agentsPath: await inspectPath(path.join(projectDir, ".agents", "skills", name)),
		claudePath: await inspectPath(path.join(projectDir, ".claude", "skills", name)),
		localSkillMd,
		remoteSkillMd,
		openaiPolicy: await inspectTextFile(
			path.join(
				projectDir,
				localSkillMd.type === "file" ? "skills" : ".agents/skills",
				name,
				"agents",
				"openai.yaml",
			),
		),
	};
}

async function listSkillKindNames(projectDir: string): Promise<string[]> {
	return sortStrings([
		...new Set([
			...(await listFirstPartySkillKindNames(projectDir)),
			...(await listVendoredSkillKindNames(projectDir)),
		]),
	]);
}

async function listFirstPartySkillKindNames(projectDir: string): Promise<string[]> {
	const skillsRoot = path.join(projectDir, "skills");
	try {
		const rootInfo = await lstat(skillsRoot);
		if (!rootInfo.isDirectory()) return [];
		const entries = await readdir(skillsRoot, { withFileTypes: true });
		const names: string[] = [];
		for (const entry of entries) {
			if (entry.name === ".DS_Store") continue;
			const skillMd = await inspectPath(path.join(skillsRoot, entry.name, "SKILL.md"));
			if (entry.isDirectory() || entry.isSymbolicLink() || skillMd.type !== "missing")
				names.push(entry.name);
		}
		return names;
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT")) return [];
		return [];
	}
}

async function listVendoredSkillKindNames(projectDir: string): Promise<string[]> {
	const agentsRoot = path.join(projectDir, ".agents", "skills");
	try {
		const rootInfo = await lstat(agentsRoot);
		if (!rootInfo.isDirectory()) return [];
		const entries = await readdir(agentsRoot, { withFileTypes: true });
		const names: string[] = [];
		for (const entry of entries) {
			if (entry.name === ".DS_Store" || entry.isSymbolicLink()) continue;
			const skillMd = await inspectPath(path.join(agentsRoot, entry.name, "SKILL.md"));
			if (entry.isDirectory() || skillMd.type !== "missing") names.push(entry.name);
		}
		return names;
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT")) return [];
		return [];
	}
}

async function inspectSkillKindSkill(
	projectDir: string,
	name: string,
): Promise<AregSkillKindSkillInspection> {
	const localBase = path.join(projectDir, "skills", name);
	const localDir = await inspectPath(localBase);
	const localSkillMd = await inspectTextFile(path.join(localBase, "SKILL.md"));
	if (localDir.type !== "missing" || localSkillMd.type !== "missing") {
		return {
			name,
			sourceType: "local",
			baseRelativePath: `skills/${name}`,
			skillDir: localDir,
			skillMd: localSkillMd,
			openaiPolicy: await inspectTextFile(path.join(localBase, "agents", "openai.yaml")),
		};
	}
	const vendoredBase = path.join(projectDir, ".agents", "skills", name);
	return {
		name,
		sourceType: "vendored",
		baseRelativePath: `.agents/skills/${name}`,
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
	const roots = [path.join(projectDir, "skills"), path.join(projectDir, ".agents", "skills")];
	for (const root of roots) {
		const classified = classifySkillPathUnderRoot(root, candidate);
		if (classified.type === "ok" || classified.error.code === "skill-kind-nested-spec")
			return classified;
	}
	return {
		type: "error",
		error: errorInfo(
			"skill-kind-outside-managed-skills",
			`Skill path is outside skills/ and .agents/skills/: ${candidate}`,
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

async function inspectPath(candidate: string): Promise<AregPathState> {
	try {
		const info = await lstat(candidate);
		if (info.isSymbolicLink()) return { type: "symlink", target: await readlink(candidate) };
		if (info.isDirectory()) return { type: "directory" };
		if (info.isFile()) return { type: "file" };
		return { type: "other" };
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT")) return { type: "missing" };
		return { type: "other" };
	}
}

async function inspectTextFile(candidate: string): Promise<AregTextFileState> {
	const pathState = await inspectPath(candidate);
	if (
		pathState.type === "missing" ||
		pathState.type === "directory" ||
		pathState.type === "symlink" ||
		pathState.type === "other"
	)
		return pathState;
	try {
		return { type: "file", text: await readFile(candidate, "utf8") };
	} catch (error) {
		return { type: "unreadable", message: formatErrorMessage(error) };
	}
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
				claudeText: claude.type === "file" ? claude.text : undefined,
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

async function resolveExistingDirectory(
	candidate: string,
	description: string,
): Promise<{ type: "ok"; value: string } | { type: "error"; error: AregErrorInfo }> {
	const state = await inspectPath(candidate);
	if (state.type === "symlink")
		return {
			type: "error",
			error: errorInfo(
				"init-symlink",
				`${description} at ${candidate} is a symlink; refusing to manage it.`,
			),
		};
	if (state.type !== "directory")
		return {
			type: "error",
			error: errorInfo("init-not-directory", `${candidate} exists but is not a directory.`),
		};
	try {
		return { type: "ok", value: await realpath(candidate) };
	} catch (error) {
		return {
			type: "error",
			error: errorInfo(
				"init-realpath-failed",
				`Could not resolve ${description} at ${candidate}: ${formatErrorMessage(error)}`,
			),
		};
	}
}

function resolveAllowedInitTarget(
	projectRoot: string,
	write: { relativePath: string },
): { type: "ok"; value: string } | { type: "error"; error: AregErrorInfo } {
	return resolveAllowedProjectTarget({
		projectRoot,
		relativePath: write.relativePath,
		isAllowedRelativePath: isAllowedInitRelativePath,
		errorCode: "init-write-target-refused",
		shouldCheckUnsupportedFirst: true,
		unsupportedMessage: (relativePath) =>
			`Refusing to write unsupported init target: ${relativePath}`,
		unsafeMessage: (relativePath) => `Refusing to write unsafe init target: ${relativePath}`,
		outsideMessage: (relativePath) => `Refusing to write outside project root: ${relativePath}`,
	});
}

function resolveAllowedSkillKindTarget(
	projectRoot: string,
	relativePath: string,
	description: string,
): { type: "ok"; value: string } | { type: "error"; error: AregErrorInfo } {
	return resolveAllowedProjectTarget({
		projectRoot,
		relativePath,
		isAllowedRelativePath: isAllowedSkillKindRelativePath,
		errorCode: "skill-kind-target-refused",
		shouldCheckUnsupportedFirst: false,
		unsupportedMessage: (candidate) =>
			`Refusing to manage unsupported ${description} target: ${candidate}`,
		unsafeMessage: (candidate) => `Refusing to manage unsafe ${description} target: ${candidate}`,
		outsideMessage: (candidate) =>
			`Refusing to manage ${description} outside project root: ${candidate}`,
	});
}

function resolveAllowedProjectTarget(
	options: ResolveAllowedTargetOptions,
): { type: "ok"; value: string } | { type: "error"; error: AregErrorInfo } {
	if (options.shouldCheckUnsupportedFirst && !options.isAllowedRelativePath(options.relativePath)) {
		return {
			type: "error",
			error: errorInfo(options.errorCode, options.unsupportedMessage(options.relativePath)),
		};
	}
	if (path.isAbsolute(options.relativePath) || options.relativePath.split("/").includes("..")) {
		return {
			type: "error",
			error: errorInfo(options.errorCode, options.unsafeMessage(options.relativePath)),
		};
	}
	if (
		!options.shouldCheckUnsupportedFirst &&
		!options.isAllowedRelativePath(options.relativePath)
	) {
		return {
			type: "error",
			error: errorInfo(options.errorCode, options.unsupportedMessage(options.relativePath)),
		};
	}
	const target = path.join(options.projectRoot, ...options.relativePath.split("/"));
	const relative = path.relative(options.projectRoot, target);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		return {
			type: "error",
			error: errorInfo(options.errorCode, options.outsideMessage(options.relativePath)),
		};
	}
	return { type: "ok", value: target };
}

function isAllowedInitRelativePath(relativePath: string): boolean {
	return ["sdl.toml", "AGENTS.md", "CLAUDE.md", ".claude/settings.local.json"].includes(
		relativePath,
	);
}

function isAllowedSkillKindRelativePath(relativePath: string): boolean {
	if (relativePath === ".pi/settings.json") return true;
	const parts = relativePath.split("/");
	return (
		isAllowedSkillKindRelativePathParts(parts, 1) || isAllowedSkillKindRelativePathParts(parts, 2)
	);
}

function isAllowedSkillKindRelativePathParts(parts: readonly string[], rootLength: 1 | 2): boolean {
	const isLocalRoot = rootLength === 1 && parts[0] === "skills";
	const isVendoredRoot = rootLength === 2 && parts[0] === ".agents" && parts[1] === "skills";
	if (!isLocalRoot && !isVendoredRoot) return false;
	return (
		(parts.length === rootLength + 2 && parts[rootLength + 1] === "SKILL.md") ||
		(parts.length === rootLength + 3 &&
			parts[rootLength + 1] === "agents" &&
			parts[rootLength + 2] === "openai.yaml") ||
		(parts.length === rootLength + 2 && parts[rootLength + 1] === "agents")
	);
}

async function validateInitWriteTarget(
	target: string,
	projectRoot: string,
	write: { description: string; createParent: boolean },
): Promise<WriteTargetValidationResult> {
	return await validateTextWriteTarget({
		target,
		projectRoot,
		description: write.description,
		shouldCreateParent: write.createParent,
		symlinkCode: "init-symlink",
		notFileCode: "init-not-file",
		parentSymlinkCode: "init-parent-symlink",
		parentNotDirectoryCode: "init-parent-not-directory",
		parentMissingCode: "init-parent-missing",
	});
}

async function validateSkillKindWriteTarget(
	options: SkillKindWriteTargetValidationOptions,
): Promise<WriteTargetValidationResult> {
	return await validateTextWriteTarget({
		...options,
		symlinkCode: "skill-kind-symlink",
		notFileCode: "skill-kind-not-file",
		parentSymlinkCode: "skill-kind-parent-symlink",
		parentNotDirectoryCode: "skill-kind-parent-not-directory",
		parentMissingCode: "skill-kind-parent-missing",
	});
}

async function validateTextWriteTarget(
	options: ValidateTextWriteTargetOptions,
): Promise<WriteTargetValidationResult> {
	const targetState = await inspectPath(options.target);
	if (targetState.type === "symlink")
		return {
			ok: false,
			error: errorInfo(
				options.symlinkCode,
				`${options.description} at ${options.target} is a symlink; refusing to manage it.`,
			),
		};
	if (targetState.type === "directory" || targetState.type === "other")
		return {
			ok: false,
			error: errorInfo(options.notFileCode, `${options.target} exists but is not a file.`),
		};
	if (targetState.type === "file")
		return await requirePathAtOrBelow(options.target, options.projectRoot, options.description);
	const parent = await nearestExistingParent(
		options.target,
		options.projectRoot,
		options.parentMissingCode,
	);
	if (parent.type === "error") return { ok: false, error: parent.error };
	const parentState = await inspectPath(parent.value);
	if (parentState.type === "symlink")
		return {
			ok: false,
			error: errorInfo(
				options.parentSymlinkCode,
				`Parent directory at ${parent.value} is a symlink; refusing to manage it.`,
			),
		};
	if (parentState.type !== "directory")
		return {
			ok: false,
			error: errorInfo(
				options.parentNotDirectoryCode,
				`${parent.value} exists but is not a directory.`,
			),
		};
	const parentCheck = await requirePathAtOrBelow(
		parent.value,
		options.projectRoot,
		"Parent directory",
	);
	if (!parentCheck.ok) return parentCheck;
	if (!options.shouldCreateParent && path.dirname(options.target) !== parent.value) {
		return {
			ok: false,
			error: errorInfo(
				options.parentMissingCode,
				`Parent directory at ${path.dirname(options.target)} does not exist.`,
			),
		};
	}
	return { ok: true };
}

async function validateSkillKindDeleteTarget(
	target: string,
	projectRoot: string,
	description: string,
): Promise<WriteTargetValidationResult> {
	const targetState = await inspectPath(target);
	if (targetState.type === "missing")
		return {
			ok: false,
			error: errorInfo("skill-kind-delete-missing", `${description} at ${target} does not exist.`),
		};
	if (targetState.type === "symlink")
		return {
			ok: false,
			error: errorInfo(
				"skill-kind-symlink",
				`${description} at ${target} is a symlink; refusing to delete it.`,
			),
		};
	if (targetState.type !== "file")
		return {
			ok: false,
			error: errorInfo("skill-kind-not-file", `${target} exists but is not a file.`),
		};
	return await requirePathAtOrBelow(target, projectRoot, description);
}

async function validateSkillKindRemoveDirTarget(
	target: string,
	projectRoot: string,
	description: string,
): Promise<{ ok: true; exists: boolean } | { ok: false; error: AregErrorInfo }> {
	const targetState = await inspectPath(target);
	if (targetState.type === "missing") return { ok: true, exists: false };
	if (targetState.type === "symlink")
		return {
			ok: false,
			error: errorInfo(
				"skill-kind-symlink",
				`${description} at ${target} is a symlink; refusing to remove it.`,
			),
		};
	if (targetState.type !== "directory")
		return {
			ok: false,
			error: errorInfo("skill-kind-not-directory", `${target} exists but is not a directory.`),
		};
	const pathCheck = await requirePathAtOrBelow(target, projectRoot, description);
	if (!pathCheck.ok) return pathCheck;
	return { ok: true, exists: true };
}

async function nearestExistingParent(
	target: string,
	projectRoot: string,
	parentMissingCode: string,
): Promise<{ type: "ok"; value: string } | { type: "error"; error: AregErrorInfo }> {
	let current = path.dirname(target);
	while (current !== projectRoot) {
		const state = await inspectPath(current);
		if (state.type !== "missing") return { type: "ok", value: current };
		const parent = path.dirname(current);
		if (parent === current)
			return {
				type: "error",
				error: errorInfo(parentMissingCode, `Parent directory at ${current} does not exist.`),
			};
		current = parent;
	}
	return { type: "ok", value: projectRoot };
}

async function requirePathAtOrBelow(
	candidate: string,
	projectRoot: string,
	description: string,
): Promise<WriteTargetValidationResult> {
	try {
		const resolved = await realpath(candidate);
		if (isPathAtOrBelow(resolved, projectRoot)) return { ok: true };
		return {
			ok: false,
			error: errorInfo(
				"init-outside-project",
				`${description} at ${candidate} resolves outside ${projectRoot}; refusing to manage it.`,
			),
		};
	} catch (error) {
		return {
			ok: false,
			error: errorInfo(
				"init-realpath-failed",
				`Could not resolve ${description} at ${candidate}: ${formatErrorMessage(error)}`,
			),
		};
	}
}

function errorInfo(
	code: string,
	message: string,
	displayCommand?: string | undefined,
): AregErrorInfo {
	return displayCommand === undefined ? { code, message } : { code, message, displayCommand };
}

function isPathAtOrBelow(candidate: string, root: string): boolean {
	const relative = path.relative(root, candidate);
	return (
		relative === "" ||
		(relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

function isNodeErrorCode(error: unknown, code: string): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === code
	);
}
