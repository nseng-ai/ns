import { formatCommand } from "@asdl/core/exec";
import { BACKUP_REF_NAMESPACE, BACKUP_REF_PREV_NAMESPACE, GIT_TIMEOUT_MS } from "./constants.ts";
import { exec } from "./command-exec.ts";
import { failure, landStackFailure, success, type LandStackOutcome, type LandStackResult } from "./errors.ts";
import { loadLocalSha } from "./stack-facts.ts";
import type { LandStackExtensionAPI } from "./types.ts";

export const LAND_BACKUP_RECOVERY_HINT = `Pre-land branch SHAs are saved under ${BACKUP_REF_NAMESPACE}/<branch>; one previous generation is kept under ${BACKUP_REF_PREV_NAMESPACE}/<branch> (restore with git update-ref refs/heads/<branch> ${BACKUP_REF_NAMESPACE}/<branch>).`;

export async function writeLandBackupRefs(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	branches: string[],
): Promise<LandStackResult<Map<string, string>>> {
	const rotate = await rotateBackupRefsToPrevious(pi, repoRoot);
	if (rotate.type === "failure") return rotate;

	const pruneCurrent = await pruneBackupNamespace(pi, repoRoot, BACKUP_REF_NAMESPACE, "current pre-land backup refs");
	if (pruneCurrent.type === "failure") return pruneCurrent;

	const shas = new Map<string, string>();
	for (const branch of branches) {
		const sha = await loadLocalSha(pi, repoRoot, branch);
		if (sha.type === "failure") {
			return failure(
				landStackFailure(`Could not snapshot local branch ${branch} for pre-land backup refs; no PRs were landed.\n${sha.failure.message}`),
			);
		}
		const ref = `${BACKUP_REF_NAMESPACE}/${branch}`;
		const args = ["update-ref", ref, sha.value];
		const updated = await exec(pi, "git", args, repoRoot, GIT_TIMEOUT_MS);
		if (updated.code !== 0) {
			return failure(
				landStackFailure(`Could not write pre-land backup ref ${ref}; no PRs were landed.`, {
					commandDisplay: formatCommand("git", args),
					result: updated,
				}),
			);
		}
		shas.set(branch, sha.value);
	}
	return success(shas);
}

async function rotateBackupRefsToPrevious(pi: LandStackExtensionAPI, repoRoot: string): Promise<LandStackOutcome> {
	const args = ["fetch", "--quiet", "--prune", "--no-tags", ".", `+${BACKUP_REF_NAMESPACE}/*:${BACKUP_REF_PREV_NAMESPACE}/*`];
	const rotated = await exec(pi, "git", args, repoRoot, GIT_TIMEOUT_MS);
	if (rotated.code !== 0) {
		return failure(
			landStackFailure("Could not rotate current pre-land backup refs to previous; no PRs were landed.", {
				commandDisplay: formatCommand("git", args),
				result: rotated,
			}),
		);
	}
	return success(undefined);
}

async function pruneBackupNamespace(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	namespace: string,
	description: string,
): Promise<LandStackOutcome> {
	const listArgs = ["for-each-ref", "--format=%(refname)", namespace];
	const refs = await exec(pi, "git", listArgs, repoRoot, GIT_TIMEOUT_MS);
	if (refs.code !== 0) {
		return failure(
			landStackFailure(`Could not list ${description} for pruning; no PRs were landed.`, {
				commandDisplay: formatCommand("git", listArgs),
				result: refs,
			}),
		);
	}
	for (const ref of refs.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
		const deleteArgs = ["update-ref", "-d", ref];
		const deleted = await exec(pi, "git", deleteArgs, repoRoot, GIT_TIMEOUT_MS);
		if (deleted.code !== 0) {
			return failure(
				landStackFailure(`Could not delete ${description} ${ref}; no PRs were landed.`, {
					commandDisplay: formatCommand("git", deleteArgs),
					result: deleted,
				}),
			);
		}
	}
	return success(undefined);
}
