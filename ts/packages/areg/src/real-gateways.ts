import { constants } from "node:fs";
import { access, lstat, mkdir, mkdtemp, readdir, readFile, readlink, realpath, rm, rmdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";

import {
	formatCommand,
	formatCommandFailure,
	formatCommandStartupFailure,
	NodeCommandExecApi,
	runCommand,
	stripTerminalEscapes,
	type CommandRunner,
} from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";
import { formatErrorMessage, isRecord } from "@asdl/core/primitives";

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
	AregProjectFileDeleteRequest,
	AregProjectGateway,
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
	AregSkillxWorkspaceGateway,
	AregTextFileState,
	AregToolCheckResult,
} from "./gateways.ts";
import { sortStrings } from "./sort.ts";

const COMMAND_TIMEOUT_MS = 60_000;
const PI_GENERIC_REPLACEMENT_ADAPTER_RELATIVE_PATH = ".pi/extensions/backing-skill-commands.ts";
const PI_GENERIC_REPLACEMENT_PACKAGE_MODULE_RELATIVE_PATH = "ts/packages/pi-extensions/src/backing-skill-commands.ts";

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

export class RealAregHostGateway implements AregHostGateway {
	async checkTool(options: { tool: AregHostToolName; cwd: string; env: NodeJS.ProcessEnv }): Promise<AregToolCheckResult> {
		const pathValue = options.env.PATH ?? "";
		for (const directory of pathValue.split(path.delimiter)) {
			if (directory.length === 0) continue;
			const candidate = path.join(directory, options.tool);
			if (await isExecutable(candidate)) return { type: "found", tool: options.tool, path: candidate };
		}
		return { type: "missing", tool: options.tool, message: `Required host tool is missing: ${options.tool}` };
	}
}

export class RealAregGithubGateway implements AregGithubGateway {
	private readonly runner: CommandRunner;

	constructor(options: { runner?: CommandRunner | undefined } = {}) {
		this.runner = options.runner ?? runCommand;
	}

	async listSkillDirectoryNames(options: { repo: string; ref?: string | undefined; env: NodeJS.ProcessEnv }): Promise<AregGithubSkillListResult> {
		const resource = options.ref === undefined ? `repos/${options.repo}/contents/skills` : `repos/${options.repo}/contents/skills?ref=${encodeURIComponent(options.ref)}`;
		const args = ["api", resource, "--jq", ".[].name"];
		const displayCommand = formatCommand("gh", args);
		const result = await this.runner("gh", args, { env: options.env, timeout: COMMAND_TIMEOUT_MS });
		if (result.code === 0) {
			return { type: "ok", skillNames: result.stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0) };
		}
		const combined = stripTerminalEscapes(`${result.stdout}\n${result.stderr}`).toLowerCase();
		if (combined.includes("404")) return { type: "missing", message: `No skills directory found in ${options.repo}` };
		if (combined.includes("401") || combined.includes("403")) return { type: "auth-error", message: `Authentication error accessing ${options.repo}` };
		if (result.startupError !== undefined) {
			return { type: "error", error: errorInfo("gh-startup-failed", formatCommandStartupFailure("gh api failed", displayCommand, result.startupError), displayCommand) };
		}
		return { type: "error", error: errorInfo("gh-failed", formatCommandFailure("gh api failed", displayCommand, result), displayCommand) };
	}
}

export class RealAregNpxSkillsGateway implements AregNpxSkillsGateway {
	private readonly runner: CommandRunner;

	constructor(options: { runner?: CommandRunner | undefined } = {}) {
		this.runner = options.runner ?? runCommand;
	}

	async addSkills(request: AregNpxSkillsAddRequest): Promise<AregNpxSkillsAddResult> {
		const args = buildNpxSkillsAddArgs(request);
		const displayCommand = formatCommand("npx", args);
		const result = await this.runner("npx", args, { cwd: request.cwd, env: request.env, timeout: COMMAND_TIMEOUT_MS });
		if (result.code === 0) return { type: "ok" };
		if (result.startupError !== undefined) {
			return { type: "error", error: errorInfo("npx-startup-failed", formatCommandStartupFailure("npx skills add failed", displayCommand, result.startupError), displayCommand) };
		}
		return { type: "error", error: errorInfo("npx-failed", formatCommandFailure("npx skills add failed", displayCommand, result), displayCommand) };
	}
}

export class RealAregSkillxWorkspaceGateway implements AregSkillxWorkspaceGateway {
	private readonly npxSkills: AregNpxSkillsGateway;

	constructor(options: { npxSkills: AregNpxSkillsGateway }) {
		this.npxSkills = options.npxSkills;
	}

	async installIntoWorkspace(request: AregSkillxInstallRequest): Promise<AregSkillxInstallResult> {
		const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "skillx."));
		const install = await this.npxSkills.addSkills({
			sourceRepo: request.sourceRepo,
			skillNames: request.skillName === undefined ? [] : [request.skillName],
			targetAgents: ["codex"],
			cwd: workspaceRoot,
			env: request.env,
		});
		if (install.type === "error") {
			await removeWorkspaceQuietly(workspaceRoot);
			return { type: "error", error: errorInfo("skillx-install-failed", `npx skills add failed: ${install.error.message}`, install.error.displayCommand) };
		}
		const inspected = await inspectInstalledSkills(workspaceRoot, request.skillName);
		if (inspected.type === "error") {
			await removeWorkspaceQuietly(workspaceRoot);
			return { type: "error", error: inspected.error };
		}
		return { type: "ok", workspace: { workspaceRoot, installedSkills: inspected.installedSkills } };
	}

	async cleanupWorkspace(request: { workspaceRoot: string; cwd: string; env: NodeJS.ProcessEnv }): Promise<AregOperationResult> {
		return await cleanupSkillxWorkspace(request.workspaceRoot);
	}
}

export class RealAregPromptGateway implements AregPromptGateway {
	async confirm(request: { message: string; defaultValue: boolean }): Promise<boolean> {
		const suffix = request.defaultValue ? " [Y/n] " : " [y/N] ";
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
		try {
			while (true) {
				const answer = (await rl.question(`${request.message}${suffix}`)).trim().toLowerCase();
				if (answer.length === 0) return request.defaultValue;
				if (answer === "y" || answer === "yes") return true;
				if (answer === "n" || answer === "no") return false;
				process.stdout.write("Please answer yes or no.\n");
			}
		} finally {
			rl.close();
		}
	}
}

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
			asdlToml: await inspectTextFile(path.join(projectDir, "asdl.toml")),
			aregJson: await inspectTextFile(path.join(projectDir, "areg.json")),
		};
	}

	async inspectInstructionFiles(request: { projectDir: string; env: NodeJS.ProcessEnv }) {
		return {
			agentsMd: await inspectTextFile(path.join(request.projectDir, "AGENTS.md")),
			claudeMd: await inspectTextFile(path.join(request.projectDir, "CLAUDE.md")),
			claudeDir: await inspectPath(path.join(request.projectDir, ".claude")),
			claudeSettings: await inspectTextFile(path.join(request.projectDir, ".claude", "settings.local.json")),
		};
	}

	async inspectPiArtifacts(request: { projectDir: string; env: NodeJS.ProcessEnv }) {
		return {
			piDir: await inspectPath(path.join(request.projectDir, ".pi")),
			piSettings: await inspectTextFile(path.join(request.projectDir, ".pi", "settings.json")),
			genericReplacement: await inspectGenericReplacement(request.projectDir),
		};
	}

	async inspectSkillNameInventory(request: { projectDir: string; env: NodeJS.ProcessEnv }) {
		return {
			skillsDirectoryNames: await listChildNames(path.join(request.projectDir, "skills")),
			agentsSkillNames: await listChildNames(path.join(request.projectDir, ".agents", "skills")),
			claudeSkillNames: await listChildNames(path.join(request.projectDir, ".claude", "skills")),
			localSkillKindNames: await listLocalSkillKindNames(request.projectDir),
		};
	}

	async inspectCheckSkill(request: AregSkillInspectionRequest): Promise<AregCheckSkillInspection> {
		return inspectCheckSkill(request.projectDir, request.skillName);
	}

	async inspectLocalSkill(request: AregSkillInspectionRequest): Promise<AregSkillKindSkillInspection> {
		return inspectSkillKindSkill(request.projectDir, request.skillName);
	}

	async inspectPairingDirectories(request: { projectDir: string; env: NodeJS.ProcessEnv }): Promise<readonly AregCheckPairingDirectory[]> {
		return await inspectPairingDirectories(request.projectDir);
	}

	async readLocallyExcludedSkillNames(request: { projectDir: string; env: NodeJS.ProcessEnv }): Promise<readonly string[]> {
		return await readLocallyExcludedSkillNames({ projectDir: request.projectDir, git: this.git });
	}

	async resolveLocalSkillSpec(request: AregSkillKindResolveRequest): Promise<AregSkillKindResolveResult> {
		const resolved = await resolveSkillKindSpec(request);
		if (resolved.type === "error") return resolved;
		const skillDir = path.join(request.projectDir, "skills", resolved.skillName);
		const skillMd = path.join(skillDir, "SKILL.md");
		const dirState = await inspectPath(skillDir);
		if (dirState.type === "symlink") return { type: "error", error: errorInfo("skill-kind-symlink-skill-dir", `skills/${resolved.skillName} is a symlink but should be a real directory (canonical source)`) };
		if (dirState.type !== "directory") return { type: "error", error: errorInfo("skill-kind-missing-skill", `Local skill not found: ${request.spec}`) };
		const mdState = await inspectPath(skillMd);
		if (mdState.type === "symlink") return { type: "error", error: errorInfo("skill-kind-symlink-skill-md", `skills/${resolved.skillName}/SKILL.md is a symlink but should be a real file (canonical source)`) };
		if (mdState.type !== "file") return { type: "error", error: errorInfo("skill-kind-missing-skill-md", `skills/${resolved.skillName}/SKILL.md does not exist`) };
		return { type: "ok", skillName: resolved.skillName };
	}

	async writeTextFile(request: AregProjectTextWriteRequest): Promise<AregProjectMutationResult> {
		const projectRoot = await resolveExistingDirectory(request.projectDir, "project root");
		if (projectRoot.type === "error") return { ok: false, error: projectRoot.error };
		const target = request.policy === "init"
			? resolveAllowedInitTarget(projectRoot.value, request)
			: resolveAllowedSkillKindTarget(projectRoot.value, request.relativePath, request.description);
		if (target.type === "error") return { ok: false, error: target.error };
		const validation = request.policy === "init"
			? await validateInitWriteTarget(target.value, projectRoot.value, request)
			: await validateSkillKindWriteTarget({ target: target.value, projectRoot: projectRoot.value, shouldCreateParent: request.createParent, description: request.description });
		if (!validation.ok) return validation;
		if (request.createParent) {
			try {
				await mkdir(path.dirname(target.value), { recursive: true });
			} catch (error) {
				const code = request.policy === "init" ? "init-parent-create-failed" : "skill-kind-parent-create-failed";
				return { ok: false, error: errorInfo(code, `Failed to create ${path.dirname(target.value)}: ${formatErrorMessage(error)}`) };
			}
			const revalidation = request.policy === "init"
				? await validateInitWriteTarget(target.value, projectRoot.value, request)
				: await validateSkillKindWriteTarget({ target: target.value, projectRoot: projectRoot.value, shouldCreateParent: request.createParent, description: request.description });
			if (!revalidation.ok) return revalidation;
		}
		try {
			await writeFile(target.value, request.content, "utf8");
			return { ok: true };
		} catch (error) {
			const code = request.policy === "init" ? "init-write-failed" : "skill-kind-write-failed";
			return { ok: false, error: errorInfo(code, `Failed to write ${request.description} at ${target.value}: ${formatErrorMessage(error)}`) };
		}
	}

	async deleteFile(request: AregProjectFileDeleteRequest): Promise<AregProjectMutationResult> {
		const projectRoot = await resolveExistingDirectory(request.projectDir, "project root");
		if (projectRoot.type === "error") return { ok: false, error: projectRoot.error };
		const target = resolveAllowedSkillKindTarget(projectRoot.value, request.relativePath, request.description);
		if (target.type === "error") return { ok: false, error: target.error };
		const validation = await validateSkillKindDeleteTarget(target.value, projectRoot.value, request.description);
		if (!validation.ok) return validation;
		try {
			await rm(target.value);
			return { ok: true };
		} catch (error) {
			return { ok: false, error: errorInfo("skill-kind-delete-failed", `Failed to delete ${request.description} at ${target.value}: ${formatErrorMessage(error)}`) };
		}
	}

	async removeEmptyDir(request: AregProjectRemoveEmptyDirRequest): Promise<AregProjectRemoveEmptyDirResult> {
		const projectRoot = await resolveExistingDirectory(request.projectDir, "project root");
		if (projectRoot.type === "error") return { ok: false, error: projectRoot.error };
		const target = resolveAllowedSkillKindTarget(projectRoot.value, request.relativePath, request.description);
		if (target.type === "error") return { ok: false, error: target.error };
		const validation = await validateSkillKindRemoveDirTarget(target.value, projectRoot.value, request.description);
		if (!validation.ok) return validation;
		if (!validation.exists) return { ok: true, removed: false };
		try {
			await rmdir(target.value);
			return { ok: true, removed: true };
		} catch (error) {
			if (isNodeErrorCode(error, "ENOTEMPTY")) return { ok: true, removed: false };
			return { ok: false, error: errorInfo("skill-kind-remove-dir-failed", `Failed to remove ${request.description} at ${target.value}: ${formatErrorMessage(error)}`) };
		}
	}
}

export function buildNpxSkillsAddArgs(request: AregNpxSkillsAddRequest): string[] {
	const args = ["skills", "add", request.sourceRepo];
	for (const skillName of request.skillNames) {
		args.push("--skill", skillName);
	}
	for (const agent of request.targetAgents) {
		args.push("--agent", agent);
	}
	args.push("-y");
	return args;
}

async function inspectInstalledSkills(workspaceRoot: string, requestedSkillName: string | undefined): Promise<{ type: "ok"; installedSkills: AregSkillxInstalledSkill[] } | { type: "error"; error: AregErrorInfo }> {
	const skillsRoot = path.join(workspaceRoot, ".agents", "skills");
	const skillsRootState = await inspectPath(skillsRoot);
	if (skillsRootState.type !== "directory") return { type: "error", error: errorInfo("skillx-no-skills", "No skills were installed") };
	if (requestedSkillName !== undefined) {
		const inspected = await inspectOneSkill(skillsRoot, requestedSkillName);
		if (inspected.type === "error") return inspected;
		return { type: "ok", installedSkills: [inspected.skill] };
	}
	const entries = await readdir(skillsRoot, { withFileTypes: true });
	const skillNames = sortStrings(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
	if (skillNames.length === 0) return { type: "error", error: errorInfo("skillx-no-skills", "No skills were installed") };
	const installedSkills: AregSkillxInstalledSkill[] = [];
	for (const skillName of skillNames) {
		const inspected = await inspectOneSkill(skillsRoot, skillName);
		if (inspected.type === "error") return inspected;
		installedSkills.push(inspected.skill);
	}
	return { type: "ok", installedSkills };
}

async function inspectOneSkill(skillsRoot: string, skillName: string): Promise<{ type: "ok"; skill: AregSkillxInstalledSkill } | { type: "error"; error: AregErrorInfo }> {
	const directory = path.join(skillsRoot, skillName);
	const directoryKind = await inspectPath(directory);
	if (directoryKind.type !== "directory") return { type: "error", error: errorInfo("skillx-skill-missing", `Skill '${skillName}' was not found in installed skills`) };
	const skillFile = path.join(directory, "SKILL.md");
	const fileKind = await inspectPath(skillFile);
	if (fileKind.type !== "file") return { type: "error", error: errorInfo("skillx-skill-malformed", `Installed skill '${skillName}' is missing SKILL.md`) };
	return { type: "ok", skill: { name: skillName, directory, skillFile, relativeFiles: await listRelativeFiles(directory) } };
}

async function listRelativeFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	async function visit(directory: string, prefix: string): Promise<void> {
		const entries = await readdir(directory, { withFileTypes: true });
		entries.sort((left, right) => left.name.localeCompare(right.name));
		for (const entry of entries) {
			const relativePath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
			const fullPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(fullPath, relativePath);
				continue;
			}
			if (entry.isFile()) files.push(relativePath);
		}
	}
	await visit(root, "");
	return sortStrings(files);
}

async function cleanupSkillxWorkspace(workspaceRoot: string): Promise<AregOperationResult> {
	if (!path.basename(workspaceRoot).startsWith("skillx.")) {
		return { type: "error", error: errorInfo("skillx-cleanup-refused", `Refusing to remove non-skillx workspace: ${workspaceRoot}`) };
	}
	let info;
	try {
		info = await lstat(workspaceRoot);
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT")) return { type: "error", error: errorInfo("skillx-cleanup-missing", `Workspace does not exist: ${workspaceRoot}`) };
		return { type: "error", error: errorInfo("skillx-cleanup-stat-failed", `Could not inspect workspace: ${formatErrorMessage(error)}`) };
	}
	if (info.isSymbolicLink()) return { type: "error", error: errorInfo("skillx-cleanup-symlink", `Refusing to remove symlink workspace: ${workspaceRoot}`) };
	if (!info.isDirectory()) return { type: "error", error: errorInfo("skillx-cleanup-not-directory", `Workspace is not a directory: ${workspaceRoot}`) };
	let resolvedWorkspace: string;
	let resolvedTemp: string;
	try {
		resolvedWorkspace = await realpath(workspaceRoot);
		resolvedTemp = await realpath(os.tmpdir());
	} catch (error) {
		return { type: "error", error: errorInfo("skillx-cleanup-realpath-failed", `Could not resolve workspace path: ${formatErrorMessage(error)}`) };
	}
	if (!isPathAtOrBelow(resolvedWorkspace, resolvedTemp)) {
		return { type: "error", error: errorInfo("skillx-cleanup-outside-temp", `Refusing to remove workspace outside temp directory: ${workspaceRoot}`) };
	}
	try {
		await rm(resolvedWorkspace, { recursive: true });
		return { type: "ok" };
	} catch (error) {
		return { type: "error", error: errorInfo("skillx-cleanup-remove-failed", `Could not remove workspace: ${formatErrorMessage(error)}`) };
	}
}

async function inspectSkills(projectDir: string, skillNames: readonly string[]): Promise<AregCheckSkillInspection[]> {
	const inspected: AregCheckSkillInspection[] = [];
	for (const name of skillNames) inspected.push(await inspectCheckSkill(projectDir, name));
	return inspected;
}

async function inspectCheckSkill(projectDir: string, name: string): Promise<AregCheckSkillInspection> {
	return {
		name,
		skillsPath: await inspectPath(path.join(projectDir, "skills", name)),
		agentsPath: await inspectPath(path.join(projectDir, ".agents", "skills", name)),
		claudePath: await inspectPath(path.join(projectDir, ".claude", "skills", name)),
		localSkillMd: await inspectTextFile(path.join(projectDir, "skills", name, "SKILL.md")),
		remoteSkillMd: await inspectTextFile(path.join(projectDir, ".agents", "skills", name, "SKILL.md")),
		openaiPolicy: await inspectTextFile(path.join(projectDir, "skills", name, "agents", "openai.yaml")),
	};
}

async function listLocalSkillKindNames(projectDir: string): Promise<string[]> {
	const skillsRoot = path.join(projectDir, "skills");
	try {
		const rootInfo = await lstat(skillsRoot);
		if (!rootInfo.isDirectory()) return [];
		const entries = await readdir(skillsRoot, { withFileTypes: true });
		const names: string[] = [];
		for (const entry of entries) {
			if (entry.name === ".DS_Store") continue;
			const skillMd = await inspectPath(path.join(skillsRoot, entry.name, "SKILL.md"));
			if (entry.isDirectory() || entry.isSymbolicLink() || skillMd.type !== "missing") names.push(entry.name);
		}
		return sortStrings(names);
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT")) return [];
		return [];
	}
}

async function inspectSkillKindSkills(projectDir: string, skillNames: readonly string[]): Promise<readonly AregSkillKindSkillInspection[]> {
	const inspected: AregSkillKindSkillInspection[] = [];
	for (const name of skillNames) inspected.push(await inspectSkillKindSkill(projectDir, name));
	return inspected;
}

async function inspectSkillKindSkill(projectDir: string, name: string): Promise<AregSkillKindSkillInspection> {
	return {
		name,
		skillDir: await inspectPath(path.join(projectDir, "skills", name)),
		skillMd: await inspectTextFile(path.join(projectDir, "skills", name, "SKILL.md")),
		openaiPolicy: await inspectTextFile(path.join(projectDir, "skills", name, "agents", "openai.yaml")),
	};
}

async function resolveSkillKindSpec(request: AregSkillKindResolveRequest): Promise<AregSkillKindResolveResult> {
	if (!isPathLikeSkillSpec(request.spec)) return { type: "ok", skillName: request.spec };
	const candidate = path.resolve(request.cwd, request.spec);
	const projectDir = await realpath(request.projectDir);
	const canonical = await canonicalSkillKindPath(projectDir, candidate);
	if (canonical.type === "ok") return canonical;
	if (canonical.error.code === "skill-kind-outside-skills") {
		return { type: "error", error: errorInfo("skill-kind-non-local-skill", `Skill spec does not resolve to a local skill: ${request.spec}`) };
	}
	return canonical;
}

async function canonicalSkillKindPath(projectDir: string, candidate: string): Promise<AregSkillKindResolveResult> {
	const direct = classifyCanonicalSkillPath(projectDir, candidate);
	if (direct.type === "ok") return direct;
	if (direct.error.code === "skill-kind-nested-spec") return direct;
	try {
		const resolved = await realpath(candidate);
		return classifyCanonicalSkillPath(projectDir, resolved);
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT")) return { type: "error", error: errorInfo("skill-kind-missing-spec", `Skill path does not exist: ${candidate}`) };
		return { type: "error", error: errorInfo("skill-kind-resolve-failed", `Could not resolve skill path ${candidate}: ${formatErrorMessage(error)}`) };
	}
}

function classifyCanonicalSkillPath(projectDir: string, candidate: string): AregSkillKindResolveResult {
	const skillsRoot = path.join(projectDir, "skills");
	const relative = path.relative(skillsRoot, candidate);
	if (relative.length === 0 || relative.startsWith("..") || path.isAbsolute(relative)) {
		return { type: "error", error: errorInfo("skill-kind-outside-skills", `Skill path is outside ${skillsRoot}: ${candidate}`) };
	}
	const parts = relative.split(path.sep).filter((part) => part.length > 0);
	const skillName = parts[0];
	if (skillName === undefined) return { type: "error", error: errorInfo("skill-kind-invalid-spec", `Invalid skill path: ${candidate}`) };
	if (parts.length === 1) return { type: "ok", skillName };
	if (parts.length === 2 && parts[1] === "SKILL.md") return { type: "ok", skillName };
	return { type: "error", error: errorInfo("skill-kind-nested-spec", `Skill path must be skills/<name> or skills/<name>/SKILL.md: ${candidate}`) };
}

function isPathLikeSkillSpec(spec: string): boolean {
	return path.isAbsolute(spec) || spec.includes("/") || spec.includes("\\") || spec.endsWith("SKILL.md");
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
	if (pathState.type === "missing" || pathState.type === "directory" || pathState.type === "symlink" || pathState.type === "other") return pathState;
	try {
		return { type: "file", text: await readFile(candidate, "utf8") };
	} catch (error) {
		return { type: "unreadable", message: formatErrorMessage(error) };
	}
}

async function inspectGenericReplacement(projectDir: string): Promise<{ hasAdapter: boolean; hasPackageModule: boolean }> {
	return {
		hasAdapter: (await inspectTextFile(path.join(projectDir, PI_GENERIC_REPLACEMENT_ADAPTER_RELATIVE_PATH))).type === "file",
		hasPackageModule: (await inspectTextFile(path.join(projectDir, PI_GENERIC_REPLACEMENT_PACKAGE_MODULE_RELATIVE_PATH))).type === "file",
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

function extractLockfileSkillNames(text: string): string[] {
	try {
		const data: unknown = JSON.parse(text);
		if (!isRecord(data)) return [];
		const skills = data.skills;
		if (!isRecord(skills)) return [];
		return sortStrings(Object.keys(skills));
	} catch {
		return [];
	}
}

async function readLocallyExcludedSkillNames(options: { projectDir: string; git: GitGateway }): Promise<string[]> {
	const gitPath = await options.git.gitPath({ cwd: options.projectDir, relativePath: "info/exclude" });
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
		const hasAgents = names.has("AGENTS.md") && (await inspectTextFile(path.join(directory, "AGENTS.md"))).type === "file";
		const claude = names.has("CLAUDE.md") ? await inspectTextFile(path.join(directory, "CLAUDE.md")) : { type: "missing" as const };
		const hasClaude = claude.type === "file";
		if (hasAgents || hasClaude) {
			results.push({ relativeDir, hasAgents, hasClaude, claudeText: claude.type === "file" ? claude.text : undefined });
		}
		const subdirs = sortStrings(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).filter((name) => ![".venv", ".git", "node_modules"].includes(name)));
		for (const name of subdirs) {
			const childRelative = relativeDir.length === 0 ? name : `${relativeDir}/${name}`;
			if (childRelative === ".agents/skills" || childRelative === ".claude/skills") continue;
			await visit(path.join(directory, name), childRelative);
		}
	}
	await visit(projectDir, "");
	return results;
}


async function isExecutable(candidate: string): Promise<boolean> {
	try {
		await access(candidate, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

async function removeWorkspaceQuietly(workspaceRoot: string): Promise<void> {
	try {
		await rm(workspaceRoot, { recursive: true, force: true });
	} catch {
		// Best-effort cleanup of a directory this gateway just created; the command result carries the original failure.
	}
}

async function resolveExistingDirectory(candidate: string, description: string): Promise<{ type: "ok"; value: string } | { type: "error"; error: AregErrorInfo }> {
	const state = await inspectPath(candidate);
	if (state.type === "symlink") return { type: "error", error: errorInfo("init-symlink", `${description} at ${candidate} is a symlink; refusing to manage it.`) };
	if (state.type !== "directory") return { type: "error", error: errorInfo("init-not-directory", `${candidate} exists but is not a directory.`) };
	try {
		return { type: "ok", value: await realpath(candidate) };
	} catch (error) {
		return { type: "error", error: errorInfo("init-realpath-failed", `Could not resolve ${description} at ${candidate}: ${formatErrorMessage(error)}`) };
	}
}

function resolveAllowedInitTarget(projectRoot: string, write: { relativePath: string }): { type: "ok"; value: string } | { type: "error"; error: AregErrorInfo } {
	return resolveAllowedProjectTarget({
		projectRoot,
		relativePath: write.relativePath,
		isAllowedRelativePath: isAllowedInitRelativePath,
		errorCode: "init-write-target-refused",
		shouldCheckUnsupportedFirst: true,
		unsupportedMessage: (relativePath) => `Refusing to write unsupported init target: ${relativePath}`,
		unsafeMessage: (relativePath) => `Refusing to write unsafe init target: ${relativePath}`,
		outsideMessage: (relativePath) => `Refusing to write outside project root: ${relativePath}`,
	});
}

function resolveAllowedSkillKindTarget(projectRoot: string, relativePath: string, description: string): { type: "ok"; value: string } | { type: "error"; error: AregErrorInfo } {
	return resolveAllowedProjectTarget({
		projectRoot,
		relativePath,
		isAllowedRelativePath: isAllowedSkillKindRelativePath,
		errorCode: "skill-kind-target-refused",
		shouldCheckUnsupportedFirst: false,
		unsupportedMessage: (candidate) => `Refusing to manage unsupported ${description} target: ${candidate}`,
		unsafeMessage: (candidate) => `Refusing to manage unsafe ${description} target: ${candidate}`,
		outsideMessage: (candidate) => `Refusing to manage ${description} outside project root: ${candidate}`,
	});
}

function resolveAllowedProjectTarget(options: ResolveAllowedTargetOptions): { type: "ok"; value: string } | { type: "error"; error: AregErrorInfo } {
	if (options.shouldCheckUnsupportedFirst && !options.isAllowedRelativePath(options.relativePath)) {
		return { type: "error", error: errorInfo(options.errorCode, options.unsupportedMessage(options.relativePath)) };
	}
	if (path.isAbsolute(options.relativePath) || options.relativePath.split("/").includes("..")) {
		return { type: "error", error: errorInfo(options.errorCode, options.unsafeMessage(options.relativePath)) };
	}
	if (!options.shouldCheckUnsupportedFirst && !options.isAllowedRelativePath(options.relativePath)) {
		return { type: "error", error: errorInfo(options.errorCode, options.unsupportedMessage(options.relativePath)) };
	}
	const target = path.join(options.projectRoot, ...options.relativePath.split("/"));
	const relative = path.relative(options.projectRoot, target);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		return { type: "error", error: errorInfo(options.errorCode, options.outsideMessage(options.relativePath)) };
	}
	return { type: "ok", value: target };
}

function isAllowedInitRelativePath(relativePath: string): boolean {
	return ["asdl.toml", "AGENTS.md", "CLAUDE.md", ".claude/settings.local.json"].includes(relativePath);
}

function isAllowedSkillKindRelativePath(relativePath: string): boolean {
	if (relativePath === ".pi/settings.json") return true;
	const parts = relativePath.split("/");
	return parts.length === 3 && parts[0] === "skills" && parts[2] === "SKILL.md"
		|| parts.length === 4 && parts[0] === "skills" && parts[2] === "agents" && parts[3] === "openai.yaml"
		|| parts.length === 3 && parts[0] === "skills" && parts[2] === "agents";
}

async function validateInitWriteTarget(target: string, projectRoot: string, write: { description: string; createParent: boolean }): Promise<WriteTargetValidationResult> {
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

async function validateSkillKindWriteTarget(options: SkillKindWriteTargetValidationOptions): Promise<WriteTargetValidationResult> {
	return await validateTextWriteTarget({
		...options,
		symlinkCode: "skill-kind-symlink",
		notFileCode: "skill-kind-not-file",
		parentSymlinkCode: "skill-kind-parent-symlink",
		parentNotDirectoryCode: "skill-kind-parent-not-directory",
		parentMissingCode: "skill-kind-parent-missing",
	});
}

async function validateTextWriteTarget(options: ValidateTextWriteTargetOptions): Promise<WriteTargetValidationResult> {
	const targetState = await inspectPath(options.target);
	if (targetState.type === "symlink") return { ok: false, error: errorInfo(options.symlinkCode, `${options.description} at ${options.target} is a symlink; refusing to manage it.`) };
	if (targetState.type === "directory" || targetState.type === "other") return { ok: false, error: errorInfo(options.notFileCode, `${options.target} exists but is not a file.`) };
	if (targetState.type === "file") return await requirePathAtOrBelow(options.target, options.projectRoot, options.description);
	const parent = await nearestExistingParent(options.target, options.projectRoot, options.parentMissingCode);
	if (parent.type === "error") return { ok: false, error: parent.error };
	const parentState = await inspectPath(parent.value);
	if (parentState.type === "symlink") return { ok: false, error: errorInfo(options.parentSymlinkCode, `Parent directory at ${parent.value} is a symlink; refusing to manage it.`) };
	if (parentState.type !== "directory") return { ok: false, error: errorInfo(options.parentNotDirectoryCode, `${parent.value} exists but is not a directory.`) };
	const parentCheck = await requirePathAtOrBelow(parent.value, options.projectRoot, "Parent directory");
	if (!parentCheck.ok) return parentCheck;
	if (!options.shouldCreateParent && path.dirname(options.target) !== parent.value) {
		return { ok: false, error: errorInfo(options.parentMissingCode, `Parent directory at ${path.dirname(options.target)} does not exist.`) };
	}
	return { ok: true };
}

async function validateSkillKindDeleteTarget(target: string, projectRoot: string, description: string): Promise<WriteTargetValidationResult> {
	const targetState = await inspectPath(target);
	if (targetState.type === "missing") return { ok: false, error: errorInfo("skill-kind-delete-missing", `${description} at ${target} does not exist.`) };
	if (targetState.type === "symlink") return { ok: false, error: errorInfo("skill-kind-symlink", `${description} at ${target} is a symlink; refusing to delete it.`) };
	if (targetState.type !== "file") return { ok: false, error: errorInfo("skill-kind-not-file", `${target} exists but is not a file.`) };
	return await requirePathAtOrBelow(target, projectRoot, description);
}

async function validateSkillKindRemoveDirTarget(target: string, projectRoot: string, description: string): Promise<{ ok: true; exists: boolean } | { ok: false; error: AregErrorInfo }> {
	const targetState = await inspectPath(target);
	if (targetState.type === "missing") return { ok: true, exists: false };
	if (targetState.type === "symlink") return { ok: false, error: errorInfo("skill-kind-symlink", `${description} at ${target} is a symlink; refusing to remove it.`) };
	if (targetState.type !== "directory") return { ok: false, error: errorInfo("skill-kind-not-directory", `${target} exists but is not a directory.`) };
	const pathCheck = await requirePathAtOrBelow(target, projectRoot, description);
	if (!pathCheck.ok) return pathCheck;
	return { ok: true, exists: true };
}

async function nearestExistingParent(target: string, projectRoot: string, parentMissingCode: string): Promise<{ type: "ok"; value: string } | { type: "error"; error: AregErrorInfo }> {
	let current = path.dirname(target);
	while (current !== projectRoot) {
		const state = await inspectPath(current);
		if (state.type !== "missing") return { type: "ok", value: current };
		const parent = path.dirname(current);
		if (parent === current) return { type: "error", error: errorInfo(parentMissingCode, `Parent directory at ${current} does not exist.`) };
		current = parent;
	}
	return { type: "ok", value: projectRoot };
}

async function requirePathAtOrBelow(candidate: string, projectRoot: string, description: string): Promise<WriteTargetValidationResult> {
	try {
		const resolved = await realpath(candidate);
		if (isPathAtOrBelow(resolved, projectRoot)) return { ok: true };
		return { ok: false, error: errorInfo("init-outside-project", `${description} at ${candidate} resolves outside ${projectRoot}; refusing to manage it.`) };
	} catch (error) {
		return { ok: false, error: errorInfo("init-realpath-failed", `Could not resolve ${description} at ${candidate}: ${formatErrorMessage(error)}`) };
	}
}

function errorInfo(code: string, message: string, displayCommand?: string | undefined): AregErrorInfo {
	return displayCommand === undefined ? { code, message } : { code, message, displayCommand };
}

function isPathAtOrBelow(candidate: string, root: string): boolean {
	const relative = path.relative(root, candidate);
	return relative === "" || (relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function isNodeErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}
