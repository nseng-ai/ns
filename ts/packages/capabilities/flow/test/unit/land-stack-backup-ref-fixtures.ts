import { GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS } from "@nseng-ai/capability-kit/git";
import { BACKUP_REF_NAMESPACE, BACKUP_REF_PREV_NAMESPACE } from "../../src/land/stack/constants.ts";
import { formatLiveBranchTips } from "./land-test-helpers.ts";

const DEFAULT_BACKUP_REF_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const DEFAULT_BACKUP_REF_SHAS: Record<string, string> = {
	"feature-a": DEFAULT_BACKUP_REF_SHA,
	"feature-b": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	"feature-c": "cccccccccccccccccccccccccccccccccccccccc",
};

interface ExitedResultFields {
	stdout?: string;
	stderr?: string;
	code?: number | null;
	signal?: string | null;
}

export interface BackupRefScriptedExec {
	command: string;
	args: string[];
	result: ExitedResultFields | undefined;
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
		step("git", [...GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS], {
			stdout: formatLiveBranchTips(branches, {
				shaOverrides: shas,
				defaultSha: DEFAULT_BACKUP_REF_SHA,
			}),
		}),
		step("git", backupSnapshotFetchArgs(branches, shas)),
	];
}

export function backupSnapshotFetchArgs(
	branches: readonly string[],
	shas: Record<string, string> = DEFAULT_BACKUP_REF_SHAS,
): string[] {
	return [
		"fetch",
		"--quiet",
		"--no-tags",
		".",
		...branches.map(
			(branch) => `+${shas[branch] ?? DEFAULT_BACKUP_REF_SHA}:${BACKUP_REF_NAMESPACE}/${branch}`,
		),
	];
}

function step(command: string, args: string[], result?: ExitedResultFields): BackupRefScriptedExec {
	return { command, args, result };
}
