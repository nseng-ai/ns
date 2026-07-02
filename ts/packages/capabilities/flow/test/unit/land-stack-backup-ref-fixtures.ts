import type { ExecResult } from "@sdl/core/command";
import { BACKUP_REF_NAMESPACE, BACKUP_REF_PREV_NAMESPACE } from "../../src/land/stack/constants.ts";

const DEFAULT_BACKUP_REF_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const DEFAULT_BACKUP_REF_SHAS: Record<string, string> = {
	"feature-a": DEFAULT_BACKUP_REF_SHA,
	"feature-b": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	"feature-c": "cccccccccccccccccccccccccccccccccccccccc",
};

export interface BackupRefScriptedExec {
	command: string;
	args: string[];
	result: Partial<ExecResult> | undefined;
}

export const BACKUP_ROTATION_ARGS = [
	"fetch",
	"--quiet",
	"--prune",
	"--no-tags",
	".",
	`+${BACKUP_REF_NAMESPACE}/*:${BACKUP_REF_PREV_NAMESPACE}/*`,
];

export const BACKUP_ROTATION_STEP = step("git", BACKUP_ROTATION_ARGS);

export function backupRefSteps(
	branches: string[],
	options: { shas?: Record<string, string>; staleCurrentRefs?: string[] } = {},
): BackupRefScriptedExec[] {
	const { shas = DEFAULT_BACKUP_REF_SHAS, staleCurrentRefs = [] } = options;
	return [
		BACKUP_ROTATION_STEP,
		step("git", ["for-each-ref", "--format=%(refname)", BACKUP_REF_NAMESPACE], {
			stdout: staleCurrentRefs.join("\n"),
		}),
		...staleCurrentRefs.map((ref) => step("git", ["update-ref", "-d", ref])),
		...branches.flatMap((branch) => {
			const sha = shas[branch] ?? DEFAULT_BACKUP_REF_SHA;
			return [
				step("git", ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], {
					stdout: `${sha}\n`,
				}),
				step("git", ["update-ref", `${BACKUP_REF_NAMESPACE}/${branch}`, sha]),
			];
		}),
	];
}

function step(
	command: string,
	args: string[],
	result?: Partial<ExecResult>,
): BackupRefScriptedExec {
	return { command, args, result };
}
