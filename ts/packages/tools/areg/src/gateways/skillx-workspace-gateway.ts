import { lstat, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { resultErr, resultOk } from "@nseng-ai/foundation/result";

import type {
	AregErrorInfo,
	AregNpxSkillsGateway,
	AregOperationResult,
	AregSkillxInstallRequest,
	AregSkillxInstallResult,
	AregSkillxInstalledSkill,
	AregSkillxWorkspaceGateway,
} from "../gateways.ts";
import { sortStrings } from "../sort.ts";
import { errorInfo } from "./errors.ts";
import { inspectPath, isNodeErrorCode, isPathAtOrBelow } from "./fs-utils.ts";

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
			return {
				type: "error",
				error: errorInfo(
					"skillx-install-failed",
					`npx skills add failed: ${install.error.message}`,
					install.error.displayCommand,
				),
			};
		}
		const inspected = await inspectInstalledSkills(workspaceRoot, request.skillName);
		if (inspected.type === "error") {
			await removeWorkspaceQuietly(workspaceRoot);
			return { type: "error", error: inspected.error };
		}
		return { type: "ok", workspace: { workspaceRoot, installedSkills: inspected.installedSkills } };
	}

	async cleanupWorkspace(request: { workspaceRoot: string }): Promise<AregOperationResult> {
		return await cleanupSkillxWorkspace(request.workspaceRoot);
	}
}

async function inspectInstalledSkills(
	workspaceRoot: string,
	requestedSkillName: string | undefined,
): Promise<
	| { type: "ok"; installedSkills: AregSkillxInstalledSkill[] }
	| { type: "error"; error: AregErrorInfo }
> {
	const skillsRoot = path.join(workspaceRoot, ".agents", "skills");
	const skillsRootState = await inspectPath(skillsRoot);
	if (skillsRootState.type !== "directory")
		return { type: "error", error: errorInfo("skillx-no-skills", "No skills were installed") };
	if (requestedSkillName !== undefined) {
		const inspected = await inspectOneSkill(skillsRoot, requestedSkillName);
		if (inspected.type === "error") return inspected;
		return { type: "ok", installedSkills: [inspected.skill] };
	}
	const entries = await readdir(skillsRoot, { withFileTypes: true });
	const skillNames = sortStrings(
		entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
	);
	if (skillNames.length === 0)
		return { type: "error", error: errorInfo("skillx-no-skills", "No skills were installed") };
	const installedSkills: AregSkillxInstalledSkill[] = [];
	for (const skillName of skillNames) {
		const inspected = await inspectOneSkill(skillsRoot, skillName);
		if (inspected.type === "error") return inspected;
		installedSkills.push(inspected.skill);
	}
	return { type: "ok", installedSkills };
}

async function inspectOneSkill(
	skillsRoot: string,
	skillName: string,
): Promise<
	{ type: "ok"; skill: AregSkillxInstalledSkill } | { type: "error"; error: AregErrorInfo }
> {
	const directory = path.join(skillsRoot, skillName);
	const directoryKind = await inspectPath(directory);
	if (directoryKind.type !== "directory")
		return {
			type: "error",
			error: errorInfo(
				"skillx-skill-missing",
				`Skill '${skillName}' was not found in installed skills`,
			),
		};
	const skillFile = path.join(directory, "SKILL.md");
	const fileKind = await inspectPath(skillFile);
	if (fileKind.type !== "file")
		return {
			type: "error",
			error: errorInfo(
				"skillx-skill-malformed",
				`Installed skill '${skillName}' is missing SKILL.md`,
			),
		};
	return {
		type: "ok",
		skill: {
			name: skillName,
			directory,
			skillFile,
			relativeFiles: await listRelativeFiles(directory),
		},
	};
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
		return resultErr(
			errorInfo(
				"skillx-cleanup-refused",
				`Refusing to remove non-skillx workspace: ${workspaceRoot}`,
			),
		);
	}
	let info;
	try {
		info = await lstat(workspaceRoot);
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT"))
			return resultErr(
				errorInfo("skillx-cleanup-missing", `Workspace does not exist: ${workspaceRoot}`),
			);
		return resultErr(
			errorInfo(
				"skillx-cleanup-stat-failed",
				`Could not inspect workspace: ${formatErrorMessage(error)}`,
			),
		);
	}
	if (info.isSymbolicLink())
		return resultErr(
			errorInfo("skillx-cleanup-symlink", `Refusing to remove symlink workspace: ${workspaceRoot}`),
		);
	if (!info.isDirectory())
		return resultErr(
			errorInfo("skillx-cleanup-not-directory", `Workspace is not a directory: ${workspaceRoot}`),
		);
	let resolvedWorkspace: string;
	let resolvedTemp: string;
	try {
		resolvedWorkspace = await realpath(workspaceRoot);
		resolvedTemp = await realpath(os.tmpdir());
	} catch (error) {
		return resultErr(
			errorInfo(
				"skillx-cleanup-realpath-failed",
				`Could not resolve workspace path: ${formatErrorMessage(error)}`,
			),
		);
	}
	if (!isPathAtOrBelow(resolvedWorkspace, resolvedTemp)) {
		return resultErr(
			errorInfo(
				"skillx-cleanup-outside-temp",
				`Refusing to remove workspace outside temp directory: ${workspaceRoot}`,
			),
		);
	}
	try {
		await rm(resolvedWorkspace, { recursive: true });
		return resultOk(undefined);
	} catch (error) {
		return resultErr(
			errorInfo(
				"skillx-cleanup-remove-failed",
				`Could not remove workspace: ${formatErrorMessage(error)}`,
			),
		);
	}
}

async function removeWorkspaceQuietly(workspaceRoot: string): Promise<void> {
	try {
		await rm(workspaceRoot, { recursive: true, force: true });
	} catch {
		// Best-effort cleanup of a directory this gateway just created; the command result carries the original failure.
	}
}
