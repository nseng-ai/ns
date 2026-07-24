import { GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS } from "@nseng-ai/foundation/git";
import type { PullRequestFacts } from "../../../src/land/api.ts";
import {
	createChildrenRecheckStep,
	createMergeFeatureASteps,
} from "../land-stack-script-fixtures.ts";
import {
	TOPOLOGY_COMMAND,
	formatLiveBranchTips,
	metadataDbJson,
	topologyArgs,
} from "../land-test-helpers.ts";

import { CURRENT_SLOT_ROOT, ROOT, TRUNK, sameArgs, step, type ScriptedExec } from "./support.ts";
export const CURRENT = "feature-b";

export const DESCENDANT = "feature-c";

export const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

export const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

export const SHA_C = "cccccccccccccccccccccccccccccccccccccccc";

export const SHA_D = "dddddddddddddddddddddddddddddddddddddddd";

export const GIT_COMMON_DIR = `${ROOT}/.git`;

export const DB_PATH = `${GIT_COMMON_DIR}/.graphite_metadata.db`;

export const TOPOLOGY_ARGS = topologyArgs(DB_PATH);

export const mergeFeatureA = createMergeFeatureASteps(TOPOLOGY_ARGS);
export const childrenRecheckStep = createChildrenRecheckStep(TOPOLOGY_ARGS);

export const DB_WITH_DESCENDANT = metadataDbJson([
	{ branch: TRUNK, children: ["feature-a"], trunk: true },
	{ branch: "feature-a", parent: TRUNK, children: ["feature-b"] },
	{ branch: "feature-b", parent: "feature-a", children: [DESCENDANT] },
	{ branch: DESCENDANT, parent: "feature-b", children: [] },
]);

export const DB_TO_CURRENT = metadataDbJson([
	{ branch: TRUNK, children: ["feature-a"], trunk: true },
	{ branch: "feature-a", parent: TRUNK, children: ["feature-b"] },
	{ branch: "feature-b", parent: "feature-a", children: [] },
]);

export const DB_FORKED_CURRENT = metadataDbJson([
	{ branch: TRUNK, children: ["feature-a"], trunk: true },
	{ branch: "feature-a", parent: TRUNK, children: ["feature-b"] },
	{ branch: "feature-b", parent: "feature-a", children: [DESCENDANT, "feature-d"] },
	{ branch: DESCENDANT, parent: "feature-b", children: [] },
	{ branch: "feature-d", parent: "feature-b", children: [] },
]);

export const DB_SINGLE_BRANCH = metadataDbJson([
	{ branch: TRUNK, children: ["feature-a"], trunk: true },
	{ branch: "feature-a", parent: TRUNK, children: [] },
]);

export const BRANCH_SHAS: Record<string, string> = {
	"feature-a": SHA_A,
	"feature-b": SHA_B,
	[DESCENDANT]: SHA_C,
	"feature-d": SHA_D,
};

export function batchedPrStdout(prs: readonly PullRequestFacts[]): string {
	return `${JSON.stringify({
		data: {
			repository: Object.fromEntries(
				prs.flatMap((pr, index) => [
					[`open${index}`, { nodes: pr.state === "OPEN" ? [pr] : [] }],
					[`history${index}`, { nodes: pr.state === "OPEN" ? [] : [pr] }],
				]),
			),
		},
	})}\n`;
}

export function numberedBranch(index: number): string {
	return `feature-${index}`;
}

export function numberedSha(index: number): string {
	return index.toString(16).padStart(2, "0").repeat(20);
}

export function metadataBranchNames(dbRows: string): string[] {
	const parsed = JSON.parse(dbRows) as Array<{ branch_name?: unknown }>;
	return parsed
		.map((row) => row.branch_name)
		.filter((name): name is string => typeof name === "string");
}

export interface RepoIntroOptions {
	current?: string;
	trunk?: string;
	dbRows?: string;
	liveBranches?: string[];
	branchShaOverrides?: Record<string, string>;
}

export function repoIntro(options: RepoIntroOptions = {}): ScriptedExec[] {
	return buildRepoIntro(options);
}

export function fromManagedCurrentSlot(script: readonly ScriptedExec[]): ScriptedExec[] {
	return script.map((scripted) => {
		if (scripted.command === "git" && sameArgs(scripted.args, ["rev-parse", "--show-toplevel"])) {
			return {
				...scripted,
				result: { ...(scripted.result ?? {}), stdout: `${CURRENT_SLOT_ROOT}\n` },
			};
		}
		if (
			scripted.command === "git" &&
			sameArgs(scripted.args, ["worktree", "list", "--porcelain"]) &&
			scripted.result?.stdout !== undefined
		) {
			return {
				...scripted,
				result: {
					...scripted.result,
					stdout: scripted.result.stdout.replace(
						`worktree ${ROOT}`,
						`worktree ${CURRENT_SLOT_ROOT}`,
					),
				},
			};
		}
		return scripted;
	});
}

export function domainRepoIntro(options: RepoIntroOptions = {}): ScriptedExec[] {
	return buildRepoIntro(options);
}

export function buildRepoIntro(options: RepoIntroOptions): ScriptedExec[] {
	const dbRows = options.dbRows ?? DB_WITH_DESCENDANT;
	const liveBranches = options.liveBranches ?? metadataBranchNames(dbRows);
	return [
		step("git", ["rev-parse", "--show-toplevel"], { stdout: `${ROOT}\n` }),
		step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${options.current ?? CURRENT}\n` }),
		step("gt", ["trunk", "--no-interactive"], { stdout: `${options.trunk ?? TRUNK}\n` }),
		step("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
			stdout: `${GIT_COMMON_DIR}\n`,
		}),
		step("git", [...GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS], {
			stdout: formatLiveBranchTips(liveBranches, {
				...(options.branchShaOverrides === undefined
					? {}
					: { shaOverrides: options.branchShaOverrides }),
				shaForBranch: testShaForBranch,
			}),
		}),
		step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, { stdout: `${dbRows}\n` }),
	];
}

export function testShaForBranch(branch: string): string {
	const fixedSha = BRANCH_SHAS[branch];
	if (fixedSha !== undefined) return fixedSha;
	const numbered = /^feature-(\d+)$/.exec(branch)?.[1];
	if (numbered !== undefined) return numberedSha(Number(numbered));
	return "0".repeat(40);
}

export function submitRestackRecheckStep(
	options: { branch?: string; parent?: string; stdout?: string } = {},
): ScriptedExec {
	const branch = options.branch ?? "feature-a";
	const parent = options.parent ?? TRUNK;
	return step("git", ["rev-list", "-1", `refs/heads/${parent}`, "--not", `refs/heads/${branch}`], {
		stdout: options.stdout ?? "",
	});
}

export function cleanRepoChecks(): ScriptedExec[] {
	return [step("git", ["status", "--porcelain=v1"])];
}
