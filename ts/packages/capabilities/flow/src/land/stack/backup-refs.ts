import { commandSucceeded, formatCommand } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS } from "@nseng-ai/foundation/git";
import { landFailure, landSuccess } from "../api.ts";
import type { LandingFailure, LandResult } from "../api.ts";
import { exec, formatCommandDetails } from "./command-exec.ts";
import { BACKUP_REF_NAMESPACE, BACKUP_REF_PREV_NAMESPACE, GIT_TIMEOUT_MS } from "./constants.ts";
import { loadLiveLocalBranchTips } from "./stack-facts.ts";
import type { LandStackExtensionAPI } from "./types.ts";

export const LAND_BACKUP_RECOVERY_HINT = `Pre-land branch SHAs are saved under ${BACKUP_REF_NAMESPACE}/<branch>; one previous generation is kept under ${BACKUP_REF_PREV_NAMESPACE}/<branch> (restore with git update-ref refs/heads/<branch> ${BACKUP_REF_NAMESPACE}/<branch>).`;

interface SnapshotBackupRefsOptions {
	readonly pi: LandStackExtensionAPI;
	readonly repoRoot: string;
	readonly branches: readonly string[];
}

export async function snapshotBackupRefs(
	options: SnapshotBackupRefsOptions,
): Promise<LandResult<ReadonlyMap<string, string>>> {
	const rotate = await rotateBackupRefsToPrevious(options);
	if (rotate !== undefined) return landFailure(rotate);

	const pruneCurrent = await pruneBackupNamespace({
		...options,
		namespace: BACKUP_REF_NAMESPACE,
		description: "current pre-land backup refs",
	});
	if (pruneCurrent !== undefined) return landFailure(pruneCurrent);

	const shas = await loadBackupSnapshotShas(options);
	if (shas.type === "failure") return shas;

	const written = await writeBackupSnapshotRefs({ ...options, shas: shas.value });
	if (written !== undefined) return landFailure(written);
	return shas;
}

async function loadBackupSnapshotShas(
	options: SnapshotBackupRefsOptions,
): Promise<LandResult<ReadonlyMap<string, string>>> {
	const tips = await loadLiveLocalBranchTips(options.pi, options.repoRoot);
	const commandDisplay = formatCommand("git", GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS);
	if (tips.type === "failure") {
		return landFailure(
			backupRefBoundaryFailure(
				"backup_ref_snapshot_list_failed",
				`Could not list local branch SHAs for pre-land backup refs; no PRs were landed.\n${tips.failure.message}`,
				commandDisplay,
			),
		);
	}

	const requestedBranches = new Set(options.branches);
	const shas = new Map<string, string>();
	for (const tip of tips.value) {
		if (!requestedBranches.has(tip.name)) continue;
		if (tip.headSha == null) {
			return landFailure(backupRefSnapshotBranchFailure(tip.name, commandDisplay));
		}
		shas.set(tip.name, tip.headSha);
	}

	for (const branch of options.branches) {
		if (!shas.has(branch))
			return landFailure(backupRefSnapshotBranchFailure(branch, commandDisplay));
	}
	return landSuccess(shas);
}

function backupRefSnapshotBranchFailure(branch: string, commandDisplay: string): LandingFailure {
	return backupRefBoundaryFailure(
		"backup_ref_snapshot_branch_failed",
		`Could not snapshot local branch ${branch} for pre-land backup refs; no PRs were landed.\n${commandDisplay} did not return an exact SHA for ${branch}.`,
		commandDisplay,
	);
}

function missingBackupSnapshotShaForWrite(branch: string): LandingFailure {
	return backupRefBoundaryFailure(
		"backup_ref_snapshot_sha_missing",
		`Could not write pre-land backup ref for ${branch}; no PRs were landed. Exact snapshot SHA was missing before backup ref write.`,
	);
}

function backupRefBoundaryFailure(
	code: string,
	message: string,
	displayCommand?: string,
): LandingFailure {
	return {
		type: "boundary",
		phase: "merge",
		source: "git",
		code,
		message,
		...optionalEntry("displayCommand", displayCommand),
	};
}

async function writeBackupSnapshotRefs(
	options: SnapshotBackupRefsOptions & { readonly shas: ReadonlyMap<string, string> },
): Promise<LandingFailure | undefined> {
	if (options.branches.length === 0) return undefined;
	const refspecs: string[] = [];
	for (const branch of options.branches) {
		const sha = options.shas.get(branch);
		if (sha === undefined) return missingBackupSnapshotShaForWrite(branch);
		refspecs.push(`+${sha}:${BACKUP_REF_NAMESPACE}/${branch}`);
	}
	const args = ["fetch", "--quiet", "--no-tags", ".", ...refspecs];
	const fetched = await exec({
		pi: options.pi,
		command: "git",
		args,
		cwd: options.repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (commandSucceeded(fetched)) return undefined;

	const firstBranch = options.branches[0] ?? "<none>";
	const commandDisplay = formatCommand("git", args);
	return backupRefBoundaryFailure(
		"backup_ref_write_failed",
		`Could not write pre-land backup refs starting at ${BACKUP_REF_NAMESPACE}/${firstBranch}; no PRs were landed.\n${formatCommandDetails(fetched, commandDisplay)}`,
		commandDisplay,
	);
}

async function rotateBackupRefsToPrevious(
	options: SnapshotBackupRefsOptions,
): Promise<LandingFailure | undefined> {
	const args = [
		"fetch",
		"--quiet",
		"--prune",
		"--no-tags",
		".",
		`+${BACKUP_REF_NAMESPACE}/*:${BACKUP_REF_PREV_NAMESPACE}/*`,
	];
	const rotated = await exec({
		pi: options.pi,
		command: "git",
		args,
		cwd: options.repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (commandSucceeded(rotated)) return undefined;

	const commandDisplay = formatCommand("git", args);
	return backupRefBoundaryFailure(
		"backup_ref_rotation_failed",
		`Could not rotate current pre-land backup refs to previous; no PRs were landed.\n${formatCommandDetails(rotated, commandDisplay)}`,
		commandDisplay,
	);
}

interface PruneBackupNamespaceOptions extends SnapshotBackupRefsOptions {
	readonly namespace: string;
	readonly description: string;
}

async function pruneBackupNamespace(
	options: PruneBackupNamespaceOptions,
): Promise<LandingFailure | undefined> {
	const listArgs = ["for-each-ref", "--format=%(refname)", options.namespace];
	const refs = await exec({
		pi: options.pi,
		command: "git",
		args: listArgs,
		cwd: options.repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (!commandSucceeded(refs)) {
		const commandDisplay = formatCommand("git", listArgs);
		return backupRefBoundaryFailure(
			"backup_ref_prune_list_failed",
			`Could not list ${options.description} for pruning; no PRs were landed.\n${formatCommandDetails(refs, commandDisplay)}`,
			commandDisplay,
		);
	}
	for (const ref of refs.stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)) {
		const deleteArgs = ["update-ref", "-d", ref];
		const deleted = await exec({
			pi: options.pi,
			command: "git",
			args: deleteArgs,
			cwd: options.repoRoot,
			timeoutMs: GIT_TIMEOUT_MS,
		});
		if (!commandSucceeded(deleted)) {
			const commandDisplay = formatCommand("git", deleteArgs);
			return backupRefBoundaryFailure(
				"backup_ref_delete_failed",
				`Could not delete ${options.description} ${ref}; no PRs were landed.\n${formatCommandDetails(deleted, commandDisplay)}`,
				commandDisplay,
			);
		}
	}
	return undefined;
}
