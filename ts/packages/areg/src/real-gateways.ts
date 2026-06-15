import { constants } from "node:fs";
import { access, lstat, mkdir, mkdtemp, readdir, readFile, readlink, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";

import {
	formatCommand,
	formatCommandFailure,
	formatCommandStartupFailure,
	runCommand,
	stripTerminalEscapes,
	type CommandRunner,
} from "@asdl/core/exec";
import { formatErrorMessage, isRecord } from "@asdl/core/primitives";

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
	AregInitProjectGateway,
	AregInitProjectInspectionRequest,
	AregInitProjectInspectionResult,
	AregInitTextWritePlan,
	AregInitTextWritePlanRequest,
	AregNpxSkillsAddRequest,
	AregNpxSkillsAddResult,
	AregNpxSkillsGateway,
	AregOperationResult,
	AregPromptGateway,
	AregSkillxInstallRequest,
	AregSkillxInstallResult,
	AregSkillxInstalledSkill,
	AregSkillxWorkspaceGateway,
	AregToolCheckResult,
	AregUpdateProjectGateway,
	AregUpdateProjectInspectionRequest,
	AregUpdateProjectInspectionResult,
} from "./gateways.ts";
import { sortStrings, uniqueSortedStrings } from "./sort.ts";

const COMMAND_TIMEOUT_MS = 60_000;

export class RealAregHostGateway implements AregHostGateway {
	private readonly runner: CommandRunner;

	constructor(options: { runner?: CommandRunner | undefined } = {}) {
		this.runner = options.runner ?? runCommand;
	}

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

export class RealAregInitProjectGateway implements AregInitProjectGateway {
	async inspectProjectForInit(request: AregInitProjectInspectionRequest): Promise<AregInitProjectInspectionResult> {
		const projectDir = path.resolve(request.cwd, request.target);
		return {
			projectDir,
			targetPathState: await inspectPath(projectDir),
			agentsMd: await inspectTextFile(path.join(projectDir, "AGENTS.md")),
			claudeMd: await inspectTextFile(path.join(projectDir, "CLAUDE.md")),
			asdlToml: await inspectTextFile(path.join(projectDir, "asdl.toml")),
			aregJson: await inspectTextFile(path.join(projectDir, "areg.json")),
			claudeDir: await inspectPath(path.join(projectDir, ".claude")),
			claudeSettings: await inspectTextFile(path.join(projectDir, ".claude", "settings.local.json")),
		};
	}

	async applyTextWritePlan(request: AregInitTextWritePlanRequest): Promise<AregInitApplyResult> {
		const projectRoot = await resolveExistingDirectory(request.projectDir, "project root");
		if (projectRoot.type === "error") return { ok: false, error: projectRoot.error };
		const writtenRelativePaths: string[] = [];
		for (const write of request.writes) {
			const target = resolveAllowedInitTarget(projectRoot.value, write);
			if (target.type === "error") return { ok: false, error: target.error };
			const validation = await validateInitWriteTarget(target.value, projectRoot.value, write);
			if (!validation.ok) return validation;
			if (write.createParent) {
				try {
					await mkdir(path.dirname(target.value), { recursive: true });
				} catch (error) {
					return { ok: false, error: errorInfo("init-parent-create-failed", `Failed to create ${path.dirname(target.value)}: ${formatErrorMessage(error)}`) };
				}
				const revalidation = await validateInitWriteTarget(target.value, projectRoot.value, write);
				if (!revalidation.ok) return revalidation;
			}
			try {
				await writeFile(target.value, write.content, "utf8");
				writtenRelativePaths.push(write.relativePath);
			} catch (error) {
				return { ok: false, error: errorInfo("init-write-failed", `Failed to write ${write.description} at ${target.value}: ${formatErrorMessage(error)}`) };
			}
		}
		return { ok: true, writtenRelativePaths };
	}
}

export class RealAregUpdateProjectGateway implements AregUpdateProjectGateway {
	async inspectProjectForUpdate(request: AregUpdateProjectInspectionRequest): Promise<AregUpdateProjectInspectionResult> {
		const projectDir = path.resolve(request.cwd, request.projectPath);
		return {
			projectDir,
			projectPathState: await inspectPath(projectDir),
			lockfile: await inspectTextFile(path.join(projectDir, "skills-lock.json")),
			asdlToml: await inspectTextFile(path.join(projectDir, "asdl.toml")),
			aregJson: await inspectTextFile(path.join(projectDir, "areg.json")),
		};
	}
}

export class RealAregCheckProjectInspectionGateway implements AregCheckProjectInspectionGateway {
	async inspectProjectForCheck(request: AregCheckProjectInspectionRequest): Promise<AregCheckProjectInspectionResult> {
		const projectDir = path.resolve(request.cwd, request.projectPath);
		const projectPathState = await inspectPath(projectDir);
		const lockfile = await inspectTextFile(path.join(projectDir, "skills-lock.json"));
		const skillNames = lockfile.type === "file" ? extractLockfileSkillNames(lockfile.text) : [];
		const skillsDirectoryNames = await listChildNames(path.join(projectDir, "skills"));
		const agentsSkillNames = await listChildNames(path.join(projectDir, ".agents", "skills"));
		const claudeSkillNames = await listChildNames(path.join(projectDir, ".claude", "skills"));
		const allSkillNames = uniqueSortedStrings([...skillNames, ...skillsDirectoryNames, ...agentsSkillNames, ...claudeSkillNames]);
		return {
			projectDir,
			projectPathState,
			lockfile,
			skillsDirectoryNames,
			agentsSkillNames,
			excludedSkillNames: await readLocallyExcludedSkillNames(projectDir),
			piSettings: await inspectTextFile(path.join(projectDir, ".pi", "settings.json")),
			genericReplacement: {
				hasAdapter: (await inspectTextFile(path.join(projectDir, ".pi", "extensions", "backing-skill-commands.ts"))).type === "file",
				hasPackageModule: (await inspectTextFile(path.join(projectDir, "ts", "packages", "pi-extensions", "src", "backing-skill-commands.ts"))).type === "file",
			},
			skills: await inspectSkills(projectDir, allSkillNames),
			pairingDirectories: await inspectPairingDirectories(projectDir),
		};
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
		return { ok: false, error: errorInfo("skillx-cleanup-refused", `Refusing to remove non-skillx workspace: ${workspaceRoot}`) };
	}
	let info;
	try {
		info = await lstat(workspaceRoot);
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT")) return { ok: false, error: errorInfo("skillx-cleanup-missing", `Workspace does not exist: ${workspaceRoot}`) };
		return { ok: false, error: errorInfo("skillx-cleanup-stat-failed", `Could not inspect workspace: ${formatErrorMessage(error)}`) };
	}
	if (info.isSymbolicLink()) return { ok: false, error: errorInfo("skillx-cleanup-symlink", `Refusing to remove symlink workspace: ${workspaceRoot}`) };
	if (!info.isDirectory()) return { ok: false, error: errorInfo("skillx-cleanup-not-directory", `Workspace is not a directory: ${workspaceRoot}`) };
	let resolvedWorkspace: string;
	let resolvedTemp: string;
	try {
		resolvedWorkspace = await realpath(workspaceRoot);
		resolvedTemp = await realpath(os.tmpdir());
	} catch (error) {
		return { ok: false, error: errorInfo("skillx-cleanup-realpath-failed", `Could not resolve workspace path: ${formatErrorMessage(error)}`) };
	}
	if (!isPathAtOrBelow(resolvedWorkspace, resolvedTemp)) {
		return { ok: false, error: errorInfo("skillx-cleanup-outside-temp", `Refusing to remove workspace outside temp directory: ${workspaceRoot}`) };
	}
	try {
		await rm(resolvedWorkspace, { recursive: true });
		return { ok: true };
	} catch (error) {
		return { ok: false, error: errorInfo("skillx-cleanup-remove-failed", `Could not remove workspace: ${formatErrorMessage(error)}`) };
	}
}

async function inspectSkills(projectDir: string, skillNames: readonly string[]): Promise<AregCheckSkillInspection[]> {
	const inspected: AregCheckSkillInspection[] = [];
	for (const name of skillNames) {
		inspected.push({
			name,
			skillsPath: await inspectPath(path.join(projectDir, "skills", name)),
			agentsPath: await inspectPath(path.join(projectDir, ".agents", "skills", name)),
			claudePath: await inspectPath(path.join(projectDir, ".claude", "skills", name)),
			localSkillMd: await inspectTextFile(path.join(projectDir, "skills", name, "SKILL.md")),
			remoteSkillMd: await inspectTextFile(path.join(projectDir, ".agents", "skills", name, "SKILL.md")),
			openaiPolicy: await inspectTextFile(path.join(projectDir, "skills", name, "agents", "openai.yaml")),
		});
	}
	return inspected;
}

async function inspectPath(candidate: string): Promise<AregCheckPathState> {
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

async function inspectTextFile(candidate: string): Promise<AregCheckTextFileState> {
	const pathState = await inspectPath(candidate);
	if (pathState.type === "missing" || pathState.type === "directory" || pathState.type === "symlink" || pathState.type === "other") return pathState;
	try {
		return { type: "file", text: await readFile(candidate, "utf8") };
	} catch (error) {
		return { type: "unreadable", message: formatErrorMessage(error) };
	}
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

async function readLocallyExcludedSkillNames(projectDir: string): Promise<string[]> {
	const exclude = await inspectTextFile(path.join(projectDir, ".git", "info", "exclude"));
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

function resolveAllowedInitTarget(projectRoot: string, write: AregInitTextWritePlan): { type: "ok"; value: string } | { type: "error"; error: AregErrorInfo } {
	if (!["asdl.toml", "AGENTS.md", "CLAUDE.md", ".claude/settings.local.json"].includes(write.relativePath)) {
		return { type: "error", error: errorInfo("init-write-target-refused", `Refusing to write unsupported init target: ${write.relativePath}`) };
	}
	if (path.isAbsolute(write.relativePath) || write.relativePath.split("/").includes("..")) {
		return { type: "error", error: errorInfo("init-write-target-refused", `Refusing to write unsafe init target: ${write.relativePath}`) };
	}
	const target = path.join(projectRoot, ...write.relativePath.split("/"));
	const relative = path.relative(projectRoot, target);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		return { type: "error", error: errorInfo("init-write-target-refused", `Refusing to write outside project root: ${write.relativePath}`) };
	}
	return { type: "ok", value: target };
}

async function validateInitWriteTarget(target: string, projectRoot: string, write: AregInitTextWritePlan): Promise<AregOperationResult> {
	const targetState = await inspectPath(target);
	if (targetState.type === "symlink") return { ok: false, error: errorInfo("init-symlink", `${write.description} at ${target} is a symlink; refusing to manage it.`) };
	if (targetState.type === "directory" || targetState.type === "other") return { ok: false, error: errorInfo("init-not-file", `${target} exists but is not a file.`) };
	if (targetState.type === "file") return await requirePathAtOrBelow(target, projectRoot, write.description);
	const parent = await nearestExistingParent(target, projectRoot);
	if (parent.type === "error") return { ok: false, error: parent.error };
	const parentState = await inspectPath(parent.value);
	if (parentState.type === "symlink") return { ok: false, error: errorInfo("init-parent-symlink", `Parent directory at ${parent.value} is a symlink; refusing to manage it.`) };
	if (parentState.type !== "directory") return { ok: false, error: errorInfo("init-parent-not-directory", `${parent.value} exists but is not a directory.`) };
	const parentCheck = await requirePathAtOrBelow(parent.value, projectRoot, "Parent directory");
	if (!parentCheck.ok) return parentCheck;
	if (!write.createParent && path.dirname(target) !== parent.value) {
		return { ok: false, error: errorInfo("init-parent-missing", `Parent directory at ${path.dirname(target)} does not exist.`) };
	}
	return { ok: true };
}

async function nearestExistingParent(target: string, projectRoot: string): Promise<{ type: "ok"; value: string } | { type: "error"; error: AregErrorInfo }> {
	let current = path.dirname(target);
	while (current !== projectRoot) {
		const state = await inspectPath(current);
		if (state.type !== "missing") return { type: "ok", value: current };
		const parent = path.dirname(current);
		if (parent === current) return { type: "error", error: errorInfo("init-parent-missing", `Parent directory at ${current} does not exist.`) };
		current = parent;
	}
	return { type: "ok", value: projectRoot };
}

async function requirePathAtOrBelow(candidate: string, projectRoot: string, description: string): Promise<AregOperationResult> {
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
