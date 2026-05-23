import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { formatCommand, formatOutputSection, normalizeExecResult, type PiExecResultLike } from "./command-runtime.ts";

const LAND_STACK_COMMAND_NAME = "land-stack";
const LAND_STACK_STATUS_KEY = "land-stack";
const LAND_STACK_MESSAGE_TYPE = "land-stack-output";

const LAND_STACK_DESCRIPTION = "Land the current Graphite stack path bottom-to-current, one PR at a time";
const LAND_STACK_LONG_OPTIONS = ["--yes", "--dry-run", "--help"] as const;
const CURRENT_MARKER = "◉";
const BRANCH_MARKER = "◯";
const GIT_FACT_TIMEOUT_MS = 30_000;
const GT_READ_TIMEOUT_MS = 60_000;
const GH_READ_TIMEOUT_MS = 60_000;
const GT_MUTATION_TIMEOUT_MS = 600_000;
const GH_MUTATION_TIMEOUT_MS = 600_000;
const SLOT_MUTATION_TIMEOUT_MS = 600_000;
const COMMAND_DETAIL_TAIL = { maxLines: 80, maxChars: 8_000 } as const;
const PR_JSON_FIELDS = [
	"number",
	"title",
	"state",
	"isDraft",
	"headRefName",
	"headRefOid",
	"baseRefName",
	"mergedAt",
	"url",
] as const;

export const LAND_STACK_HELP = `Usage:
/land-stack [--yes] [--dry-run] [--help]

Lands the current Graphite stack path from bottom branch through the current branch, one PR at a time.
Requires a clean repo, non-draft open PRs, bottom PR based on gt trunk, and no manual worktree conflicts; can offer to run gt restack + submit/update for stale PR heads before merging.

Options:
  --yes, -y    Skip the main landing confirmation. PR submit/update and managed slot cleanup still require explicit UI confirmation.
  --dry-run    Show the plan and exit before mutating anything.
  --help, -h   Show this help.`;

export type NotifyLevel = "info" | "warning" | "error";

export type AutocompleteItem = {
	value: string;
	label?: string;
	description?: string;
};

type CustomMessageContent = string | Array<{ type: string; text?: string }>;

type CustomMessage = {
	customType: string;
	content: CustomMessageContent;
	display: boolean;
	details?: unknown;
};

export type CommandContext = {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		confirm(title: string, body: string): Promise<boolean>;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
};

export type ExtensionAPI = {
	registerCommand(
		name: string,
		options: {
			description?: string;
			getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<PiExecResultLike>;
	sendMessage?(message: CustomMessage, options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" }): void;
};

export type LandStackArgs = {
	yes: boolean;
	dryRun: boolean;
	help: boolean;
};

export type ParseArgsResult =
	| { ok: true; args: LandStackArgs }
	| { ok: false; unknownArg: string };

export type RanCommand = {
	command: string;
	args: string[];
	cwd: string;
	display: string;
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
};

export type CommandRunner = {
	run(command: string, args: string[], options: { cwd: string; timeoutMs: number }): Promise<RanCommand>;
};

export type StackWalkContext = {
	cwd: string;
	gitCurrentBranch: string;
	graphiteTrunkBranch: string;
};

export type StackWalkWarning =
	| { kind: "multiple-current-markers" }
	| { kind: "off-column-branches-ignored"; count: number }
	| { kind: "source-root-differs-from-trunk"; sourceRoot: string; trunk: string };

export type StackWalkFailure =
	| { kind: "no-current-marker" }
	| { kind: "backend-current-mismatch"; backendCurrentBranch: string; gitCurrentBranch: string }
	| { kind: "no-pr-path" }
	| { kind: "ambiguous-stack"; message: string }
	| { kind: "command-failed"; command: RanCommand };

export type StackWalkResolution = {
	backendCurrentBranch: string;
	sourceRootBranch: string | null;
	landingBranches: string[];
	descendantBranches: string[];
	warnings: StackWalkWarning[];
};

export type StackWalkResult =
	| { ok: true; value: StackWalkResolution }
	| { ok: false; failure: StackWalkFailure };

export type LandedPr = {
	number: number;
	branch: string;
	url: string | null;
};

export type CompletionWarning = {
	message: string;
	command?: RanCommand;
	suggestedNextAction?: string;
};

export type LandStackFailure = {
	severity: "info" | "error";
	message: string;
	landed?: LandedPr[];
	failedAt?: { prNumber?: number; branch: string };
	command?: RanCommand;
	suggestedNextAction?: string;
};

export type Result<T> =
	| { ok: true; value: T }
	| { ok: false; failure: LandStackFailure };

export type GitOperation = {
	kind: "merge" | "cherry-pick" | "revert" | "rebase";
	message: string;
};

export type GitWorktree = {
	path: string;
	head: string | null;
	branch: string | null;
	detached: boolean;
};

export type GitClient = {
	repoRoot(cwd: string): Promise<Result<string>>;
	currentBranch(cwd: string): Promise<Result<string>>;
	statusPorcelain(cwd: string): Promise<Result<string>>;
	inProgressOperation(root: string): Promise<Result<GitOperation | null>>;
	branchExists(cwd: string, branch: string): Promise<Result<boolean>>;
	branchSha(cwd: string, branch: string): Promise<Result<string>>;
	isAncestor(cwd: string, ancestor: string, descendant: string): Promise<Result<boolean>>;
	worktrees(cwd: string): Promise<Result<GitWorktree[]>>;
};

export type GraphiteClient = {
	trunk(cwd: string): Promise<Result<string>>;
	restackUpstack(cwd: string, branch: string): Promise<Result<RanCommand>>;
	submitUpdate(cwd: string, branch: string): Promise<Result<RanCommand>>;
	getDownstack(cwd: string, branch: string): Promise<Result<RanCommand>>;
	deleteBranch(cwd: string, branch: string): Promise<Result<RanCommand>>;
};

export type PullRequestInfo = {
	number: number;
	title: string;
	state: "OPEN" | "CLOSED" | "MERGED" | string;
	isDraft: boolean;
	headRefName: string;
	headRefOid: string;
	baseRefName: string;
	mergedAt: string | null;
	url: string | null;
};

export type GitHubClient = {
	prForBranch(cwd: string, branch: string): Promise<Result<PullRequestInfo>>;
	prByNumber(cwd: string, number: number): Promise<Result<PullRequestInfo>>;
	mergePr(cwd: string, number: number, headSha: string): Promise<Result<RanCommand>>;
};

export type SlotClient = {
	freeStack(cwd: string): Promise<Result<RanCommand>>;
};

export type LandingBranchSnapshot = {
	branch: string;
	localSha: string;
	shortSha: string;
	pr: PullRequestInfo;
};

export type DescendantBranchSnapshot = {
	branch: string;
};

export type StaleMetadataItem = {
	branch: string;
	prNumber: number;
	reasons: string[];
};

export type StaleMetadataSummary = {
	items: StaleMetadataItem[];
};

export type RestackRequirement = {
	branch: string;
	parent: string;
};

export type WorktreeConflict = {
	branch: string;
	path: string;
};

export type ManagedSlotWorktreeConflict = WorktreeConflict & {
	slotName: string;
};

export type WorktreeConflictSummary = {
	manual: WorktreeConflict[];
	managedSlots: ManagedSlotWorktreeConflict[];
};

export type PreflightSnapshot = {
	repoRoot: string;
	currentBranch: string;
	trunkBranch: string;
	stack: StackWalkResolution;
	landingBranches: LandingBranchSnapshot[];
	descendantBranches: DescendantBranchSnapshot[];
	worktreeConflicts: WorktreeConflictSummary;
	staleMetadata: StaleMetadataSummary;
	restackRequirement: RestackRequirement | null;
	warnings: StackWalkWarning[];
};

export type PreflightResult =
	| { ok: true; snapshot: PreflightSnapshot }
	| { ok: false; failure: LandStackFailure };

export type MergeLoopResult =
	| { ok: true; landed: LandedPr[]; warnings: CompletionWarning[] }
	| { ok: false; failure: LandStackFailure };

type GtLogMarker = typeof CURRENT_MARKER | typeof BRANCH_MARKER;

type ParsedGtLogEntry = {
	lineIndex: number;
	marker: GtLogMarker;
	markerColumn: number;
	branch: string;
};

type DeleteFailureClassification = "already-absent" | "checked-out" | "other";

export function tokenizeLandStackArgs(rawArgs: string): string[] {
	return rawArgs.trim().split(/\s+/).filter(Boolean);
}

export function parseLandStackArgs(rawArgs: string): ParseArgsResult {
	const parsed: LandStackArgs = {
		yes: false,
		dryRun: false,
		help: false,
	};

	for (const token of tokenizeLandStackArgs(rawArgs)) {
		if (token === "--yes" || token === "-y") {
			parsed.yes = true;
			continue;
		}
		if (token === "--dry-run") {
			parsed.dryRun = true;
			continue;
		}
		if (token === "--help" || token === "-h") {
			parsed.help = true;
			continue;
		}

		return { ok: false, unknownArg: token };
	}

	return { ok: true, args: parsed };
}

export function completeLandStackArgs(prefix: string): AutocompleteItem[] | null {
	const tokens = tokenizeLandStackArgs(prefix);
	const currentToken = /\s$/.test(prefix) ? "" : (tokens[tokens.length - 1] ?? "");
	const matches = LAND_STACK_LONG_OPTIONS.filter((option) => option.startsWith(currentToken));
	return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
}

export function createPiCommandRunner(pi: ExtensionAPI): CommandRunner {
	return {
		async run(command: string, args: string[], options: { cwd: string; timeoutMs: number }): Promise<RanCommand> {
			const display = formatCommand(command, args);
			try {
				const result = normalizeExecResult(await pi.exec(command, args, { cwd: options.cwd, timeout: options.timeoutMs }));
				return {
					command,
					args: [...args],
					cwd: options.cwd,
					display,
					stdout: result.stdout,
					stderr: result.stderr,
					code: result.code,
					killed: result.killed,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					command,
					args: [...args],
					cwd: options.cwd,
					display,
					stdout: "",
					stderr: message,
					code: 1,
					killed: false,
				};
			}
		},
	};
}

export function createGitClient(runner: CommandRunner): GitClient {
	return {
		async repoRoot(cwd: string): Promise<Result<string>> {
			const result = await runner.run("git", ["rev-parse", "--show-toplevel"], { cwd, timeoutMs: GIT_FACT_TIMEOUT_MS });
			if (result.code !== 0 || result.killed) {
				return err("Working directory is not inside a Git repository; refusing to start stack landing.", result);
			}
			return ok(result.stdout.trim());
		},

		async currentBranch(cwd: string): Promise<Result<string>> {
			const result = await runner.run("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
				cwd,
				timeoutMs: GIT_FACT_TIMEOUT_MS,
			});
			if (result.code !== 0 || result.killed) {
				return err("Current Git branch cannot be resolved; refusing to start stack landing.", result);
			}
			return ok(result.stdout.trim());
		},

		async statusPorcelain(cwd: string): Promise<Result<string>> {
			const result = await runner.run("git", ["status", "--porcelain=v1"], { cwd, timeoutMs: GIT_FACT_TIMEOUT_MS });
			if (result.code !== 0 || result.killed) {
				return err("Could not inspect working tree cleanliness; refusing to start stack landing.", result);
			}
			return ok(result.stdout);
		},

		async inProgressOperation(root: string): Promise<Result<GitOperation | null>> {
			const probes = [
				{ kind: "merge", path: "MERGE_HEAD", message: "A merge is in progress; refusing to start stack landing." },
				{ kind: "cherry-pick", path: "CHERRY_PICK_HEAD", message: "A cherry-pick is in progress; refusing to start stack landing." },
				{ kind: "revert", path: "REVERT_HEAD", message: "A revert is in progress; refusing to start stack landing." },
				{ kind: "rebase", path: "rebase-merge", message: "A rebase is in progress; refusing to start stack landing." },
				{ kind: "rebase", path: "rebase-apply", message: "A rebase is in progress; refusing to start stack landing." },
			] as const;

			for (const probe of probes) {
				const result = await runner.run("git", ["rev-parse", "--git-path", probe.path], {
					cwd: root,
					timeoutMs: GIT_FACT_TIMEOUT_MS,
				});
				if (result.code !== 0 || result.killed) {
					return err("Could not inspect in-progress Git operation state; refusing to start stack landing.", result);
				}
				const gitPath = result.stdout.trim();
				const absoluteGitPath = isAbsolute(gitPath) ? gitPath : resolve(root, gitPath);
				if (existsSync(absoluteGitPath)) {
					return ok({ kind: probe.kind, message: probe.message });
				}
			}

			return ok(null);
		},

		async branchExists(cwd: string, branch: string): Promise<Result<boolean>> {
			const result = await runner.run("git", ["show-ref", "--verify", "--quiet", localBranchRef(branch)], {
				cwd,
				timeoutMs: GIT_FACT_TIMEOUT_MS,
			});
			if (result.code === 0 && !result.killed) {
				return ok(true);
			}
			if (result.code === 1 && !result.killed) {
				return ok(false);
			}
			return err(`Could not inspect local branch ${branch}; refusing to start stack landing.`, result);
		},

		async branchSha(cwd: string, branch: string): Promise<Result<string>> {
			const result = await runner.run("git", ["rev-parse", localBranchRef(branch)], { cwd, timeoutMs: GIT_FACT_TIMEOUT_MS });
			if (result.code !== 0 || result.killed) {
				return err(`Could not resolve local SHA for ${branch}; refusing to start stack landing.`, result);
			}
			return ok(result.stdout.trim());
		},

		async isAncestor(cwd: string, ancestor: string, descendant: string): Promise<Result<boolean>> {
			const result = await runner.run("git", ["merge-base", "--is-ancestor", localBranchRef(ancestor), localBranchRef(descendant)], {
				cwd,
				timeoutMs: GIT_FACT_TIMEOUT_MS,
			});
			if (result.code === 0 && !result.killed) {
				return ok(true);
			}
			if (result.code === 1 && !result.killed) {
				return ok(false);
			}
			return err(`Could not inspect reachability from ${ancestor} to ${descendant}; refusing to start stack landing.`, result);
		},

		async worktrees(cwd: string): Promise<Result<GitWorktree[]>> {
			const result = await runner.run("git", ["worktree", "list", "--porcelain"], { cwd, timeoutMs: GIT_FACT_TIMEOUT_MS });
			if (result.code !== 0 || result.killed) {
				return err("Could not inspect Git worktrees; refusing to start stack landing.", result);
			}
			return ok(parseGitWorktrees(result.stdout));
		},
	};
}

export function createGraphiteClient(runner: CommandRunner): GraphiteClient {
	return {
		async trunk(cwd: string): Promise<Result<string>> {
			const result = await runner.run("gt", ["trunk", "--no-interactive"], { cwd, timeoutMs: GT_READ_TIMEOUT_MS });
			if (result.code !== 0 || result.killed) {
				return err("Graphite trunk cannot be resolved; refusing to start stack landing.", result);
			}
			return ok(result.stdout.trim());
		},

		async restackUpstack(cwd: string, branch: string): Promise<Result<RanCommand>> {
			const result = await runner.run("gt", ["restack", "--branch", branch, "--upstack", "--no-interactive"], {
				cwd,
				timeoutMs: GT_MUTATION_TIMEOUT_MS,
			});
			return commandResult(result, `gt restack failed for ${branch}.`);
		},

		async submitUpdate(cwd: string, branch: string): Promise<Result<RanCommand>> {
			const result = await runner.run(
				"gt",
				["submit", "--branch", branch, "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"],
				{ cwd, timeoutMs: GT_MUTATION_TIMEOUT_MS },
			);
			return commandResult(result, `gt submit/update failed for ${branch}.`);
		},

		async getDownstack(cwd: string, branch: string): Promise<Result<RanCommand>> {
			const result = await runner.run("gt", ["get", branch, "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"], {
				cwd,
				timeoutMs: GT_MUTATION_TIMEOUT_MS,
			});
			return commandResult(result, `gt get failed for ${branch}.`);
		},

		async deleteBranch(cwd: string, branch: string): Promise<Result<RanCommand>> {
			const result = await runner.run("gt", ["delete", branch, "-f", "-q"], { cwd, timeoutMs: GT_MUTATION_TIMEOUT_MS });
			return commandResult(result, `gt delete failed for ${branch}.`);
		},
	};
}

export function createGitHubClient(runner: CommandRunner): GitHubClient {
	return {
		async prForBranch(cwd: string, branch: string): Promise<Result<PullRequestInfo>> {
			return loadPullRequest(runner, cwd, branch, `No GitHub PR metadata could be loaded for ${branch}; refusing to start stack landing.`);
		},

		async prByNumber(cwd: string, number: number): Promise<Result<PullRequestInfo>> {
			return loadPullRequest(runner, cwd, String(number), `No GitHub PR metadata could be loaded for #${number}.`);
		},

		async mergePr(cwd: string, number: number, headSha: string): Promise<Result<RanCommand>> {
			const result = await runner.run("gh", ["pr", "merge", String(number), "--squash", "--match-head-commit", headSha], {
				cwd,
				timeoutMs: GH_MUTATION_TIMEOUT_MS,
			});
			return commandResult(result, `gh pr merge failed for #${number}.`);
		},
	};
}

export function createSlotClient(runner: CommandRunner): SlotClient {
	return {
		async freeStack(cwd: string): Promise<Result<RanCommand>> {
			const result = await runner.run("slot", ["gt", "free-stack"], { cwd, timeoutMs: SLOT_MUTATION_TIMEOUT_MS });
			return commandResult(result, "slot gt free-stack failed.");
		},
	};
}

export async function loadStackWalkFromGtLog(runner: CommandRunner, context: StackWalkContext): Promise<StackWalkResult> {
	const result = await runner.run("gt", ["log", "short", "--stack", "-r", "--no-interactive"], {
		cwd: context.cwd,
		timeoutMs: GT_READ_TIMEOUT_MS,
	});
	if (result.code !== 0 || result.killed) {
		return { ok: false, failure: { kind: "command-failed", command: result } };
	}
	return resolveStackWalkFromGtLogOutput(result.stdout, context);
}

export function resolveStackWalkFromGtLogOutput(stdout: string, context: StackWalkContext): StackWalkResult {
	const entries = parseGtLogEntries(stdout);
	if (!entries.ok) {
		return entries;
	}

	const currentEntries = entries.value.filter((entry) => entry.marker === CURRENT_MARKER);
	const firstCurrent = currentEntries[0];
	if (!firstCurrent) {
		return { ok: false, failure: { kind: "no-current-marker" } };
	}

	const alignedEntries = entries.value.filter((entry) => entry.markerColumn === firstCurrent.markerColumn);
	const currentAlignedIndex = alignedEntries.findIndex((entry) => entry.lineIndex === firstCurrent.lineIndex);
	if (currentAlignedIndex < 0) {
		return { ok: false, failure: { kind: "ambiguous-stack", message: "current marker was not in its own stack column" } };
	}

	const ancestors = alignedEntries.slice(0, currentAlignedIndex);
	const sourceRootBranch = ancestors[0]?.branch ?? null;
	const backendCurrentBranch = firstCurrent.branch;
	const landingBranches = [...ancestors.slice(sourceRootBranch === null ? 0 : 1).map((entry) => entry.branch), backendCurrentBranch].filter(
		(branch) => branch !== context.graphiteTrunkBranch && branch !== sourceRootBranch,
	);
	const descendantBranches = alignedEntries.slice(currentAlignedIndex + 1).map((entry) => entry.branch);
	const warnings: StackWalkWarning[] = [];

	if (currentEntries.length > 1) {
		warnings.push({ kind: "multiple-current-markers" });
	}

	const offColumnCount = entries.value.length - alignedEntries.length;
	if (offColumnCount > 0) {
		warnings.push({ kind: "off-column-branches-ignored", count: offColumnCount });
	}

	if (sourceRootBranch !== null && sourceRootBranch !== context.graphiteTrunkBranch) {
		warnings.push({
			kind: "source-root-differs-from-trunk",
			sourceRoot: sourceRootBranch,
			trunk: context.graphiteTrunkBranch,
		});
	}

	return {
		ok: true,
		value: {
			backendCurrentBranch,
			sourceRootBranch,
			landingBranches,
			descendantBranches,
			warnings,
		},
	};
}

export async function buildPreflightSnapshot(runner: CommandRunner, cwd: string): Promise<PreflightResult> {
	const git = createGitClient(runner);
	const graphite = createGraphiteClient(runner);
	const github = createGitHubClient(runner);

	const repoRootResult = await git.repoRoot(cwd);
	if (!repoRootResult.ok) return { ok: false, failure: repoRootResult.failure };
	const repoRoot = repoRootResult.value;

	const currentBranchResult = await git.currentBranch(repoRoot);
	if (!currentBranchResult.ok) return { ok: false, failure: currentBranchResult.failure };
	const currentBranch = currentBranchResult.value;

	const trunkBranchResult = await graphite.trunk(repoRoot);
	if (!trunkBranchResult.ok) return { ok: false, failure: trunkBranchResult.failure };
	const trunkBranch = trunkBranchResult.value;

	const stackResult = await loadStackWalkFromGtLog(runner, {
		cwd: repoRoot,
		gitCurrentBranch: currentBranch,
		graphiteTrunkBranch: trunkBranch,
	});
	if (!stackResult.ok) return { ok: false, failure: stackWalkFailureToLandStackFailure(stackResult.failure) };
	const stack = stackResult.value;

	if (stack.backendCurrentBranch !== currentBranch) {
		return {
			ok: false,
			failure: {
				severity: "error",
				message: `Graphite current marker is ${stack.backendCurrentBranch}, but Git current branch is ${currentBranch}; refusing to start stack landing.`,
			},
		};
	}

	if (currentBranch === trunkBranch || stack.landingBranches.length === 0) {
		return {
			ok: false,
			failure: {
				severity: "info",
				message: `Current branch is ${currentBranch}, which is trunk or has no PR path to land. Nothing to do.`,
			},
		};
	}

	const statusResult = await git.statusPorcelain(repoRoot);
	if (!statusResult.ok) return { ok: false, failure: statusResult.failure };
	if (statusResult.value.trim().length > 0) {
		return { ok: false, failure: { severity: "error", message: "Working tree is dirty; refusing to start stack landing." } };
	}

	const operationResult = await git.inProgressOperation(repoRoot);
	if (!operationResult.ok) return { ok: false, failure: operationResult.failure };
	if (operationResult.value !== null) {
		return { ok: false, failure: { severity: "error", message: operationResult.value.message } };
	}

	const relevantBranches = uniqueStrings([...stack.landingBranches, ...stack.descendantBranches]);
	for (const branch of relevantBranches) {
		const existsResult = await git.branchExists(repoRoot, branch);
		if (!existsResult.ok) return { ok: false, failure: existsResult.failure };
		if (!existsResult.value) {
			return { ok: false, failure: { severity: "error", message: `Local branch ${branch} does not exist; refusing to start stack landing.` } };
		}
	}

	const landingBranches: LandingBranchSnapshot[] = [];
	const staleItems: StaleMetadataItem[] = [];
	for (const [index, branch] of stack.landingBranches.entries()) {
		const shaResult = await git.branchSha(repoRoot, branch);
		if (!shaResult.ok) return { ok: false, failure: shaResult.failure };
		const localSha = shaResult.value;

		const prResult = await github.prForBranch(repoRoot, branch);
		if (!prResult.ok) return { ok: false, failure: prResult.failure };
		const pr = prResult.value;

		const prFailure = validatePreflightPr(branch, pr);
		if (prFailure) return { ok: false, failure: prFailure };

		const staleReasons: string[] = [];
		if (pr.headRefOid !== localSha) {
			staleReasons.push(`head ${shortSha(pr.headRefOid)} != local ${shortSha(localSha)}`);
		}
		if (index === 0 && pr.baseRefName !== trunkBranch) {
			staleReasons.push(`base ${pr.baseRefName} != ${trunkBranch}`);
		}
		if (staleReasons.length > 0) {
			staleItems.push({ branch, prNumber: pr.number, reasons: staleReasons });
		}

		landingBranches.push({
			branch,
			localSha,
			shortSha: shortSha(localSha),
			pr,
		});
	}

	const restackRequirementResult = await detectRestackRequirement(git, repoRoot, trunkBranch, stack);
	if (!restackRequirementResult.ok) return { ok: false, failure: restackRequirementResult.failure };

	const worktreesResult = await git.worktrees(repoRoot);
	if (!worktreesResult.ok) return { ok: false, failure: worktreesResult.failure };
	const worktreeConflicts = summarizeWorktreeConflicts(worktreesResult.value, repoRoot, currentBranch, relevantBranches);
	const manualConflictFailure = manualWorktreeConflictFailure(worktreeConflicts.manual);
	if (manualConflictFailure) return { ok: false, failure: manualConflictFailure };

	return {
		ok: true,
		snapshot: {
			repoRoot,
			currentBranch,
			trunkBranch,
			stack,
			landingBranches,
			descendantBranches: stack.descendantBranches.map((branch) => ({ branch })),
			worktreeConflicts,
			staleMetadata: { items: staleItems },
			restackRequirement: restackRequirementResult.value,
			warnings: stack.warnings,
		},
	};
}

export function formatLandingPlan(plan: PreflightSnapshot): string {
	const path = [plan.trunkBranch, ...plan.landingBranches.map((branch) => branch.branch)].join(" -> ");
	const sections = [
		`Land Graphite stack path: ${path}\n\nCurrent branch: ${plan.currentBranch}\nTrunk branch: ${plan.trunkBranch}`,
		formatMergeList(plan),
		formatDescendantSection(plan),
		formatWarningsSection(plan),
		formatSubmitUpdateSection(plan),
		formatManagedSlotSection(plan),
		formatFinalSafetySection(plan.trunkBranch),
	].filter((section) => section.length > 0);

	return sections.join("\n\n");
}

export function formatFailure(failure: LandStackFailure): string {
	const landed = failure.landed ?? [];
	const isContextual = landed.length > 0 || failure.failedAt !== undefined;
	const lines: string[] = [];

	if (isContextual) {
		lines.push("land-stack stopped.", "");
		if (landed.length > 0) {
			lines.push("Already landed:", ...landed.map((pr) => `  - #${pr.number} ${pr.branch}`), "");
		}
		if (failure.failedAt) {
			lines.push(`Failed at: ${formatFailedAt(failure.failedAt)}`, "");
		}
	}

	lines.push(failure.message);
	if (failure.command) {
		lines.push("", formatCommandDetails(failure.command));
	}
	if (failure.suggestedNextAction) {
		lines.push("", `Suggested next action: ${failure.suggestedNextAction}`);
	}
	return lines.join("\n");
}

export function formatSuccessSummary(landed: LandedPr[], descendants: DescendantBranchSnapshot[], warnings: CompletionWarning[]): string {
	const landedRefs = landed.map((pr) => `#${pr.number} ${pr.branch}`).join(", ");
	const lines = [`Landed ${landed.length} PR(s): ${landedRefs}.`];
	if (descendants.length > 0) {
		lines.push(`Left open/restacked: ${descendants.map((branch) => branch.branch).join(", ")}.`);
	}
	lines.push(
		"Remote branches were not deleted.",
		"Clean up any remaining local branches manually, for example by running `gt sync` or deleting branches directly.",
	);

	if (warnings.length > 0) {
		lines.push("", `Completed with ${warnings.length} warning(s):`);
		for (const warning of warnings) {
			lines.push(formatCompletionWarning(warning));
		}
	}

	return lines.join("\n");
}

export function classifyGtDeleteFailure(command: RanCommand): DeleteFailureClassification {
	const output = `${command.stdout}\n${command.stderr}`.toLowerCase();
	if (/already\s+(deleted|absent|gone)/.test(output) || /does not exist/.test(output) || /not found/.test(output) || /no branch named/.test(output) || /could not find/.test(output)) {
		return "already-absent";
	}
	if (/checked out/.test(output) || /currently on branch/.test(output) || /cannot delete.*current branch/.test(output)) {
		return "checked-out";
	}
	return "other";
}

export function sanitizeTerminalHyperlinkUrl(url: string): string | undefined {
	if (/\p{Cc}/u.test(url)) return undefined;
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
		return parsed.toString();
	} catch {
		return undefined;
	}
}

export function terminalHyperlink(text: string, url: string): string {
	return `\x1B]8;;${url}\x07${text}\x1B]8;;\x07`;
}

export function linkifyPrReferences(content: string, landed: LandedPr[]): string {
	const links = new Map<number, string>();
	for (const pr of landed) {
		if (!pr.url) continue;
		const sanitized = sanitizeTerminalHyperlinkUrl(pr.url);
		if (sanitized) {
			links.set(pr.number, sanitized);
		}
	}

	return content.replace(/#(\d+)\b/g, (match, numberText: string) => {
		const url = links.get(Number(numberText));
		return url ? terminalHyperlink(match, url) : match;
	});
}

export async function executeMergeLoop(runner: CommandRunner, snapshot: PreflightSnapshot, pi?: ExtensionAPI, ctx?: CommandContext): Promise<MergeLoopResult> {
	const git = createGitClient(runner);
	const graphite = createGraphiteClient(runner);
	const github = createGitHubClient(runner);
	const landed: LandedPr[] = [];
	const warnings: CompletionWarning[] = [];
	const landingBranches = snapshot.landingBranches;

	for (const [index, plannedBranch] of landingBranches.entries()) {
		const branch = plannedBranch.branch;
		setLandStackStatus(ctx, `checking #${plannedBranch.pr.number} ${branch} before merge…`);

		const localShaResult = await git.branchSha(snapshot.repoRoot, branch);
		if (!localShaResult.ok) {
			return { ok: false, failure: failureWithProgress(localShaResult.failure.message, landed, { branch, prNumber: plannedBranch.pr.number }, localShaResult.failure.command, localShaResult.failure.suggestedNextAction) };
		}
		const localSha = localShaResult.value;

		const prResult = await github.prForBranch(snapshot.repoRoot, branch);
		if (!prResult.ok) {
			return { ok: false, failure: failureWithProgress(prResult.failure.message, landed, { branch, prNumber: plannedBranch.pr.number }, prResult.failure.command, prResult.failure.suggestedNextAction) };
		}
		const pr = prResult.value;

		const gateFailure = validateStrictMergeGate(branch, localSha, pr, snapshot.trunkBranch);
		if (gateFailure) {
			return { ok: false, failure: { ...gateFailure, landed: [...landed], failedAt: { branch, prNumber: pr.number } } };
		}

		setLandStackStatus(ctx, `merging #${pr.number} ${branch}…`);
		streamLandStackMessage(pi, `→ $ ${formatCommand("gh", ["pr", "merge", String(pr.number), "--squash", "--match-head-commit", localSha])}`);
		const mergeResult = await github.mergePr(snapshot.repoRoot, pr.number, localSha);
		if (!mergeResult.ok) {
			return {
				ok: false,
				failure: failureWithProgress(
					"Merge rejected; stopping stack landing immediately.",
					landed,
					{ branch, prNumber: pr.number },
					mergeResult.failure.command,
					`Inspect PR #${pr.number}, resolve the merge rejection, then rerun /land-stack from the desired branch.`,
				),
			};
		}

		setLandStackStatus(ctx, `verifying #${pr.number} merged…`);
		const verifiedResult = await github.prByNumber(snapshot.repoRoot, pr.number);
		if (!verifiedResult.ok) {
			return {
				ok: false,
				failure: failureWithProgress(
					`gh pr merge exited 0, but verification could not load PR #${pr.number}; local Graphite cleanup skipped.`,
					landed,
					{ branch, prNumber: pr.number },
					verifiedResult.failure.command,
					`Inspect PR #${pr.number} on GitHub before deleting or restacking local Graphite branches.`,
				),
			};
		}
		const verified = verifiedResult.value;
		if (!isVerifiedMergedPr(verified, branch, snapshot.trunkBranch)) {
			return {
				ok: false,
				failure: failureWithProgress(
					"gh pr merge exited 0 but PR did not verify as MERGED; local Graphite cleanup skipped.",
					landed,
					{ branch, prNumber: pr.number },
					undefined,
					`Inspect PR #${pr.number} on GitHub before deleting or restacking local Graphite branches.`,
				),
			};
		}

		const landedPr = { number: pr.number, branch, url: verified.url ?? pr.url };
		landed.push(landedPr);
		streamLandStackMessage(pi, `✓ merged #${pr.number} ${branch}`, { prLinks: prLinkDetails([landedPr]) });

		const nextLandingBranch = landingBranches[index + 1];
		const nextBranch = nextLandingBranch?.branch ?? snapshot.descendantBranches[0]?.branch;
		if (nextBranch) {
			setLandStackStatus(ctx, `refreshing ${nextBranch} after #${pr.number}…`);
			streamLandStackMessage(pi, `→ $ ${formatCommand("gt", ["get", nextBranch, "--downstack", "--no-restack", "--no-checkout", "--force", "--no-interactive"])}`);
			const refreshResult = await graphite.getDownstack(snapshot.repoRoot, nextBranch);
			if (!refreshResult.ok) {
				return {
					ok: false,
					failure: failureWithProgress(
						`PR #${pr.number} merged, but targeted Graphite refresh failed.`,
						landed,
						{ branch, prNumber: pr.number },
						refreshResult.failure.command,
						`Run gt get ${nextBranch} --downstack --no-restack --no-checkout --force --no-interactive manually, inspect the stack, and rerun /land-stack if appropriate.`,
					),
				};
			}
		}

		setLandStackStatus(ctx, `deleting local Graphite branch ${branch}…`);
		const deleteResult = await graphite.deleteBranch(snapshot.repoRoot, branch);
		const finalTarget = index === landingBranches.length - 1;
		if (!deleteResult.ok) {
			const command = deleteResult.failure.command;
			const classification = command ? classifyGtDeleteFailure(command) : "other";
			if (classification === "already-absent") {
				streamLandStackMessage(pi, `✓ $ ${formatCommand("gt", ["delete", branch, "-f", "-q"])} — branch ${branch} already absent`);
			} else if (finalTarget && classification === "checked-out") {
				streamLandStackMessage(pi, `✓ $ ${formatCommand("gt", ["delete", branch, "-f", "-q"])} — branch ${branch} still checked out; clean up manually with gt sync or direct branch deletion`);
			} else if (finalTarget) {
				warnings.push({
					message: `All target PRs were merged, but deleting the local Graphite branch ${branch} failed.`,
					...(command ? { command } : {}),
					suggestedNextAction: `Delete or repair local Graphite branch ${branch} manually, then inspect the stack.`,
				});
			} else {
				return {
					ok: false,
					failure: failureWithProgress(
						`PR #${pr.number} merged, but deleting the local Graphite branch ${branch} failed.`,
						landed,
						{ branch, prNumber: pr.number },
						command,
						`Delete or repair local Graphite branch ${branch} manually, then inspect the stack before rerunning /land-stack.`,
					),
				};
			}
		} else {
			streamLandStackMessage(pi, `✓ $ ${deleteResult.value.display}`);
		}

		if (nextBranch) {
			const nextIsLandingTarget = nextLandingBranch !== undefined;
			setLandStackStatus(ctx, `restacking ${nextBranch}…`);
			streamLandStackMessage(pi, `→ $ ${formatCommand("gt", ["restack", "--branch", nextBranch, "--upstack", "--no-interactive"])}`);
			const restackResult = await graphite.restackUpstack(snapshot.repoRoot, nextBranch);
			if (!restackResult.ok) {
				if (nextIsLandingTarget) {
					return {
						ok: false,
						failure: failureWithProgress(
							`Restack failed after merging #${pr.number}; stopping before merging ${nextBranch}.`,
							landed,
							nextLandingFailureTarget(nextLandingBranch),
							restackResult.failure.command,
							`Resolve restack failures for ${nextBranch}, run gt submit/update, then rerun /land-stack if appropriate.`,
						),
					};
				}
				warnings.push({
					message: `Restack failed after merging #${pr.number}; descendant branch ${nextBranch} was left for manual restack/update.`,
					...(restackResult.failure.command ? { command: restackResult.failure.command } : {}),
					suggestedNextAction: `Resolve restack failures for ${nextBranch}, run gt submit/update, then rerun /land-stack if appropriate.`,
				});
				return { ok: true, landed, warnings };
			}

			setLandStackStatus(ctx, `submitting ${nextBranch} update…`);
			streamLandStackMessage(pi, `→ $ ${formatCommand("gt", ["submit", "--branch", nextBranch, "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"])}`);
			const submitResult = await graphite.submitUpdate(snapshot.repoRoot, nextBranch);
			if (!submitResult.ok) {
				if (nextIsLandingTarget) {
					return {
						ok: false,
						failure: failureWithProgress(
							`Submit/update failed after merging #${pr.number}; stopping before merging ${nextBranch}.`,
							landed,
							nextLandingFailureTarget(nextLandingBranch),
							submitResult.failure.command,
							`Update PR for ${nextBranch} manually, verify it targets ${snapshot.trunkBranch}, then rerun /land-stack if appropriate.`,
						),
					};
				}
				warnings.push({
					message: `Submit/update failed after merging #${pr.number}; descendant branch ${nextBranch} was left for manual PR update.`,
					...(submitResult.failure.command ? { command: submitResult.failure.command } : {}),
					suggestedNextAction: `Update PR for ${nextBranch} manually, verify it targets ${snapshot.trunkBranch}, then rerun /land-stack if appropriate.`,
				});
				return { ok: true, landed, warnings };
			}
		}
	}

	return { ok: true, landed, warnings };
}

async function prepareSnapshotForMerge(runner: CommandRunner, snapshot: PreflightSnapshot, ctx: CommandContext): Promise<PreflightResult> {
	let current = snapshot;

	if (current.staleMetadata.items.length > 0) {
		const staleResult = await runStaleMetadataFlow(runner, current, ctx);
		if (!staleResult.ok) return staleResult;
		current = staleResult.snapshot;
	}

	if (current.worktreeConflicts.managedSlots.length > 0) {
		const slotResult = await runManagedSlotCleanupFlow(runner, current, ctx);
		if (!slotResult.ok) return slotResult;
		current = slotResult.snapshot;
	}

	return { ok: true, snapshot: current };
}

async function runStaleMetadataFlow(runner: CommandRunner, snapshot: PreflightSnapshot, ctx: CommandContext): Promise<PreflightResult> {
	const needsRestack = snapshot.restackRequirement !== null;
	if (!ctx.hasUI) {
		const required = needsRestack ? "restack+submit/update" : "submit/update";
		return {
			ok: false,
			failure: {
				severity: "error",
				message: `GitHub PR metadata is behind local Graphite refs, but this context cannot ask for the required ${required} confirmation.`,
			},
		};
	}

	const confirmed = await ctx.ui.confirm(needsRestack ? "Run gt restack + submit/update?" : "Run gt submit/update?", formatStaleMetadataConfirmationBody(snapshot));
	if (!confirmed) {
		return { ok: false, failure: { severity: "info", message: "Cancelled before merge; no PRs were landed." } };
	}

	const graphite = createGraphiteClient(runner);
	if (snapshot.restackRequirement) {
		ctx.ui.setStatus(LAND_STACK_STATUS_KEY, `restacking ${snapshot.restackRequirement.branch}…`);
		const restackResult = await graphite.restackUpstack(snapshot.repoRoot, snapshot.restackRequirement.branch);
		if (!restackResult.ok) {
			return {
				ok: false,
				failure: {
					severity: "error",
					message: "gt restack failed before merge; no PRs were landed.",
					...(restackResult.failure.command ? { command: restackResult.failure.command } : {}),
				},
			};
		}
	}

	ctx.ui.setStatus(LAND_STACK_STATUS_KEY, `submitting ${snapshot.currentBranch} update…`);
	const submitResult = await graphite.submitUpdate(snapshot.repoRoot, snapshot.currentBranch);
	if (!submitResult.ok) {
		return {
			ok: false,
			failure: {
				severity: "error",
				message: "gt submit/update failed before merge; no PRs were landed.",
				...(submitResult.failure.command ? { command: submitResult.failure.command } : {}),
			},
		};
	}

	ctx.ui.setStatus(LAND_STACK_STATUS_KEY, "rechecking land-stack after submit/update…");
	const nextPreflight = await buildPreflightSnapshot(runner, snapshot.repoRoot);
	if (!nextPreflight.ok) return nextPreflight;
	if (nextPreflight.snapshot.staleMetadata.items.length > 0) {
		return {
			ok: false,
			failure: {
				severity: "error",
				message: "gt submit/update completed, but GitHub PR metadata still differs from local Graphite refs.\nNo PRs were landed.",
				suggestedNextAction:
					"Run gt submit --branch <current> --no-stack --update-only --no-edit --no-ai --no-interactive manually, inspect PR heads, and rerun /land-stack.",
			},
		};
	}

	return nextPreflight;
}

async function runManagedSlotCleanupFlow(runner: CommandRunner, snapshot: PreflightSnapshot, ctx: CommandContext): Promise<PreflightResult> {
	if (!ctx.hasUI) {
		return {
			ok: false,
			failure: {
				severity: "error",
				message: "Managed slot worktrees block stack restack/ref updates, but this context cannot ask for the required slot cleanup confirmation.",
			},
		};
	}

	const confirmed = await ctx.ui.confirm("Run slot gt free-stack?", formatManagedSlotConfirmationBody(snapshot.worktreeConflicts.managedSlots));
	if (!confirmed) {
		return { ok: false, failure: { severity: "info", message: "Cancelled before merge; no PRs were landed." } };
	}

	ctx.ui.setStatus(LAND_STACK_STATUS_KEY, "freeing managed slot worktrees…");
	const slot = createSlotClient(runner);
	const freeResult = await slot.freeStack(snapshot.repoRoot);
	if (!freeResult.ok) {
		return {
			ok: false,
			failure: {
				severity: "error",
				message: "slot gt free-stack failed; no PRs were landed.",
				...(freeResult.failure.command ? { command: freeResult.failure.command } : {}),
			},
		};
	}

	ctx.ui.setStatus(LAND_STACK_STATUS_KEY, "rechecking worktrees after slot cleanup…");
	const cleanupCheck = await recheckAfterSlotCleanup(runner, snapshot);
	if (!cleanupCheck.ok) return cleanupCheck;
	return buildPreflightSnapshot(runner, snapshot.repoRoot);
}

async function recheckAfterSlotCleanup(runner: CommandRunner, snapshot: PreflightSnapshot): Promise<Result<null>> {
	const git = createGitClient(runner);
	const statusResult = await git.statusPorcelain(snapshot.repoRoot);
	if (!statusResult.ok) return statusResult;
	if (statusResult.value.trim().length > 0) {
		return { ok: false, failure: { severity: "error", message: "Working tree is dirty; refusing to start stack landing." } };
	}

	const worktreesResult = await git.worktrees(snapshot.repoRoot);
	if (!worktreesResult.ok) return worktreesResult;
	const relevantBranches = uniqueStrings([...snapshot.stack.landingBranches, ...snapshot.stack.descendantBranches]);
	const conflicts = summarizeWorktreeConflicts(worktreesResult.value, snapshot.repoRoot, snapshot.currentBranch, relevantBranches);
	if (conflicts.manual.length > 0 || conflicts.managedSlots.length > 0) {
		return { ok: false, failure: { severity: "error", message: formatRemainingWorktreeConflictsAfterSlotCleanup(conflicts) } };
	}

	return ok(null);
}

function parseGtLogEntries(stdout: string): { ok: true; value: ParsedGtLogEntry[] } | { ok: false; failure: StackWalkFailure } {
	const entries: ParsedGtLogEntry[] = [];
	const lines = stdout.replace(/\r/g, "\n").split("\n");

	for (const [lineIndex, line] of lines.entries()) {
		const marker = findGtLogMarker(line);
		if (!marker) {
			continue;
		}

		const branch = parseGtLogBranchName(line, marker.column);
		if (!branch) {
			return {
				ok: false,
				failure: { kind: "ambiguous-stack", message: `could not parse branch name from gt log line ${lineIndex + 1}` },
			};
		}

		entries.push({
			lineIndex,
			marker: marker.marker,
			markerColumn: marker.column,
			branch,
		});
	}

	return { ok: true, value: entries };
}

function findGtLogMarker(line: string): { marker: GtLogMarker; column: number } | undefined {
	const currentColumn = line.indexOf(CURRENT_MARKER);
	const branchColumn = line.indexOf(BRANCH_MARKER);
	if (currentColumn < 0 && branchColumn < 0) {
		return undefined;
	}
	if (currentColumn >= 0 && (branchColumn < 0 || currentColumn <= branchColumn)) {
		return { marker: CURRENT_MARKER, column: currentColumn };
	}
	return { marker: BRANCH_MARKER, column: branchColumn };
}

function parseGtLogBranchName(line: string, markerColumn: number): string {
	const rawBranch = line.slice(markerColumn + CURRENT_MARKER.length).trim();
	const annotationIndex = rawBranch.search(/\s+\(/);
	const branch = annotationIndex >= 0 ? rawBranch.slice(0, annotationIndex) : rawBranch;
	return branch.trimEnd();
}

function parseGitWorktrees(stdout: string): GitWorktree[] {
	const worktrees: GitWorktree[] = [];
	const records = stdout.replace(/\r/g, "\n").split(/\n\s*\n/).filter((record) => record.trim().length > 0);

	for (const record of records) {
		let path: string | undefined;
		let head: string | null = null;
		let branch: string | null = null;
		let detached = false;

		for (const line of record.split("\n")) {
			if (line.startsWith("worktree ")) {
				path = line.slice("worktree ".length);
			} else if (line.startsWith("HEAD ")) {
				head = line.slice("HEAD ".length);
			} else if (line.startsWith("branch refs/heads/")) {
				branch = line.slice("branch refs/heads/".length);
			} else if (line === "detached") {
				detached = true;
			}
		}

		if (path) {
			worktrees.push({ path, head, branch, detached });
		}
	}

	return worktrees;
}

function parsePullRequestInfo(stdout: string): PullRequestInfo {
	const parsed: unknown = JSON.parse(stdout);
	if (!isRecord(parsed)) {
		throw new Error("expected an object");
	}

	const number = parsed.number;
	const title = parsed.title;
	const state = parsed.state;
	const isDraft = parsed.isDraft;
	const headRefName = parsed.headRefName;
	const headRefOid = parsed.headRefOid;
	const baseRefName = parsed.baseRefName;
	const mergedAt = parsed.mergedAt;
	const url = parsed.url;

	if (
		typeof number !== "number" ||
		!Number.isInteger(number) ||
		typeof title !== "string" ||
		typeof state !== "string" ||
		typeof isDraft !== "boolean" ||
		typeof headRefName !== "string" ||
		typeof headRefOid !== "string" ||
		typeof baseRefName !== "string" ||
		(mergedAt !== null && typeof mergedAt !== "string") ||
		(url !== null && typeof url !== "string")
	) {
		throw new Error("expected number, title, state, isDraft, headRefName, headRefOid, baseRefName, mergedAt, and url");
	}

	return { number, title, state, isDraft, headRefName, headRefOid, baseRefName, mergedAt, url };
}

function summarizeWorktreeConflicts(
	worktrees: GitWorktree[],
	repoRoot: string,
	currentBranch: string,
	relevantBranches: string[],
): WorktreeConflictSummary {
	const relevant = new Set(relevantBranches);
	const manual: WorktreeConflict[] = [];
	const managedSlots: ManagedSlotWorktreeConflict[] = [];

	for (const worktree of worktrees) {
		if (!worktree.branch || !relevant.has(worktree.branch)) {
			continue;
		}
		if (worktree.branch === currentBranch && normalizePathForCompare(worktree.path) === normalizePathForCompare(repoRoot)) {
			continue;
		}

		const slotName = managedSlotName(worktree.path);
		if (slotName) {
			managedSlots.push({ branch: worktree.branch, path: worktree.path, slotName });
			continue;
		}

		manual.push({ branch: worktree.branch, path: worktree.path });
	}

	return { manual, managedSlots };
}

function managedSlotName(path: string): string | undefined {
	if (!path.includes("/.slots/repos/")) {
		return undefined;
	}
	return path.match(/\/worktrees\/(slot-[^/]+)/)?.[1];
}

function manualWorktreeConflictFailure(conflicts: WorktreeConflict[]): LandStackFailure | undefined {
	if (conflicts.length === 0) {
		return undefined;
	}
	if (conflicts.length === 1) {
		const conflict = conflicts[0];
		if (conflict) {
			return {
				severity: "error",
				message: `Branch ${conflict.branch} is checked out in non-slot worktree ${conflict.path}; detach it manually and rerun.`,
			};
		}
	}

	return {
		severity: "error",
		message: [
			"Relevant branches are checked out in non-slot worktrees; detach them manually and rerun:",
			...conflicts.map((conflict) => `- ${conflict.branch} ${conflict.path}`),
		].join("\n"),
	};
}

async function detectRestackRequirement(
	git: GitClient,
	repoRoot: string,
	trunkBranch: string,
	stack: StackWalkResolution,
): Promise<Result<RestackRequirement | null>> {
	const pairs: Array<{ parent: string; branch: string }> = [];
	const firstLandingBranch = stack.landingBranches[0];
	if (firstLandingBranch) {
		pairs.push({ parent: trunkBranch, branch: firstLandingBranch });
	}
	for (let index = 1; index < stack.landingBranches.length; index += 1) {
		const parent = stack.landingBranches[index - 1];
		const branch = stack.landingBranches[index];
		if (parent && branch) {
			pairs.push({ parent, branch });
		}
	}
	const firstDescendant = stack.descendantBranches[0];
	if (firstDescendant) {
		pairs.push({ parent: stack.backendCurrentBranch, branch: firstDescendant });
	}

	for (const pair of pairs) {
		const isAncestorResult = await git.isAncestor(repoRoot, pair.parent, pair.branch);
		if (!isAncestorResult.ok) return isAncestorResult;
		if (!isAncestorResult.value) {
			return ok({ branch: pair.branch, parent: pair.parent });
		}
	}

	return ok(null);
}

function validatePreflightPr(branch: string, pr: PullRequestInfo): LandStackFailure | undefined {
	if (pr.state !== "OPEN") {
		return { severity: "error", message: `PR #${pr.number} for ${branch} is ${pr.state}, expected OPEN.` };
	}
	if (pr.isDraft) {
		return { severity: "error", message: `PR #${pr.number} for ${branch} is a draft; mark it ready before landing.` };
	}
	if (pr.headRefName !== branch) {
		return { severity: "error", message: `PR #${pr.number} head branch is ${pr.headRefName}, expected ${branch}.` };
	}
	return undefined;
}

function validateStrictMergeGate(branch: string, localSha: string, pr: PullRequestInfo, trunkBranch: string): LandStackFailure | undefined {
	const preflightFailure = validatePreflightPr(branch, pr);
	if (preflightFailure) {
		return preflightFailure;
	}
	if (pr.headRefOid !== localSha) {
		return { severity: "error", message: `PR #${pr.number} head SHA does not match local branch SHA; run gt submit/update first.` };
	}
	if (pr.baseRefName !== trunkBranch) {
		return {
			severity: "error",
			message: `PR #${pr.number} targets ${pr.baseRefName}, expected ${trunkBranch}; restack/submit it first.`,
			suggestedNextAction: `Run gt restack/submit for ${branch}, then rerun /land-stack.`,
		};
	}
	return undefined;
}

function stackWalkFailureToLandStackFailure(failure: StackWalkFailure): LandStackFailure {
	switch (failure.kind) {
		case "no-current-marker":
			return { severity: "error", message: "Graphite stack cannot be resolved because gt log output has no current marker." };
		case "backend-current-mismatch":
			return {
				severity: "error",
				message: `Graphite current marker is ${failure.backendCurrentBranch}, but Git current branch is ${failure.gitCurrentBranch}; refusing to start stack landing.`,
			};
		case "no-pr-path":
			return { severity: "info", message: "Current branch is trunk or has no PR path to land. Nothing to do." };
		case "ambiguous-stack":
			return { severity: "error", message: `Graphite stack cannot be resolved: ${failure.message}.` };
		case "command-failed":
			return { severity: "error", message: "Graphite stack cannot be loaded; refusing to start stack landing.", command: failure.command };
	}
}

function formatMergeList(plan: PreflightSnapshot): string {
	return ["Will merge, in order:", ...plan.landingBranches.map((branch, index) => formatMergeListLine(branch, index + 1, plan.currentBranch))].join("\n");
}

function formatMergeListLine(branch: LandingBranchSnapshot, number: number, currentBranch: string): string {
	const currentLabel = branch.branch === currentBranch ? " Current branch" : "";
	return `  ${number}. #${branch.pr.number} ${branch.branch} ${branch.shortSha} ${branch.pr.title}${currentLabel}`;
}

function formatDescendantSection(plan: PreflightSnapshot): string {
	if (plan.descendantBranches.length === 0) {
		return "No descendant PRs above the current branch will be merged.";
	}

	return ["Will leave open/restack but not merge:", ...plan.descendantBranches.map((branch) => `  - ${branch.branch}`)].join("\n");
}

function formatWarningsSection(plan: PreflightSnapshot): string {
	if (plan.warnings.length === 0) {
		return "";
	}

	return ["Warnings:", ...plan.warnings.map((warning) => `  - ${formatStackWalkWarning(warning)}`)].join("\n");
}

function formatStackWalkWarning(warning: StackWalkWarning): string {
	switch (warning.kind) {
		case "multiple-current-markers":
			return "multiple current markers found in gt log output";
		case "off-column-branches-ignored":
			return `${warning.count} branch(es) in gt log output sit outside the current branch's column and were not included in the stack walk`;
		case "source-root-differs-from-trunk":
			return `gt log stack root is ${warning.sourceRoot}, but gt trunk is ${warning.trunk}; ${warning.trunk} remains the required merge target`;
	}
}

function formatSubmitUpdateSection(plan: PreflightSnapshot): string {
	if (plan.staleMetadata.items.length === 0) {
		return "No pre-merge PR submit/update is required.";
	}

	const submitCommand = formatSubmitUpdateCommand(plan.currentBranch);
	const staleLines = plan.staleMetadata.items.map((item) => `  - #${item.prNumber} ${item.branch}: ${item.reasons.join("; ")}`);

	if (plan.restackRequirement) {
		const restackCommand = formatRestackCommand(plan.restackRequirement.branch);
		return [
			"Before merging, this command will ask before running gt restack + submit/update because local branch reachability shows restack is required and GitHub PR metadata is behind local refs:",
			`  Restack: ${plan.restackRequirement.branch} on ${plan.restackRequirement.parent}`,
			...staleLines,
			`  Command: ${restackCommand}`,
			`  Command: ${submitCommand}`,
		].join("\n");
	}

	return [
		"Before merging, this command will ask before running gt submit/update because GitHub PR metadata is behind local refs:",
		...staleLines,
		`  Command: ${submitCommand}`,
	].join("\n");
}

function formatManagedSlotSection(plan: PreflightSnapshot): string {
	if (plan.worktreeConflicts.managedSlots.length === 0) {
		return "No managed slot cleanup is required before merging.";
	}

	return [
		"Before merging, this command will ask before running slot gt free-stack because these stack branches are checked out in managed slots:",
		...plan.worktreeConflicts.managedSlots.map((slot) => `  - ${slot.slotName} ${slot.branch} ${slot.path}`),
	].join("\n");
}

function formatFinalSafetySection(trunkBranch: string): string {
	return `For each merged PR:
  - gh pr merge <number> --squash --match-head-commit <sha>
  - verify PR is MERGED on ${trunkBranch}
  - if another branch remains, gt get <next-branch> --downstack --no-restack --no-checkout --force --no-interactive
  - gt delete <landed-branch> -f -q
  - restack/submit the next branch only, if one remains

Will not merge descendants above current, will not delete remote branches, will not run global gt sync --delete-all, will not wait for checks or enable auto-merge, and will stop on first failure.`;
}

function formatStaleMetadataConfirmationBody(snapshot: PreflightSnapshot): string {
	const lines: string[] = [];
	if (snapshot.restackRequirement) {
		lines.push(
			"Local branch reachability shows this stack needs restack before submit/update, and GitHub PR metadata is behind local refs. Run restack then submit/update before merging?",
			"",
			`Restack: ${snapshot.restackRequirement.branch} on ${snapshot.restackRequirement.parent}`,
		);
	} else {
		lines.push("GitHub PR metadata is behind local Graphite refs. Run Graphite submit/update before merging?", "");
	}

	for (const item of snapshot.staleMetadata.items) {
		lines.push(`- #${item.prNumber} ${item.branch}: ${item.reasons.join("; ")}`);
	}
	lines.push("");
	if (snapshot.restackRequirement) {
		lines.push(`Command: ${formatRestackCommand(snapshot.restackRequirement.branch)}`);
	}
	lines.push(`Command: ${formatSubmitUpdateCommand(snapshot.currentBranch)}`);
	return lines.join("\n");
}

function formatManagedSlotConfirmationBody(conflicts: ManagedSlotWorktreeConflict[]): string {
	return [
		"Run slot gt free-stack? This detaches/frees managed slots for stack branches.",
		"",
		...conflicts.map((slot) => `- ${slot.slotName} ${slot.branch} ${slot.path}`),
	].join("\n");
}

function formatRemainingWorktreeConflictsAfterSlotCleanup(conflicts: WorktreeConflictSummary): string {
	return [
		"slot gt free-stack completed, but relevant branches are still checked out in other worktrees.",
		...conflicts.manual.map((conflict) => `- ${conflict.branch} ${conflict.path} (non-slot)`),
		...conflicts.managedSlots.map((conflict) => `- ${conflict.branch} ${conflict.path} (managed slot)`),
		"No PRs were landed.",
	].join("\n");
}

function formatRestackCommand(branch: string): string {
	return formatCommand("gt", ["restack", "--branch", branch, "--upstack", "--no-interactive"]);
}

function formatSubmitUpdateCommand(branch: string): string {
	return formatCommand("gt", ["submit", "--branch", branch, "--no-stack", "--update-only", "--no-edit", "--no-ai", "--no-interactive"]);
}

function formatCommandDetails(command: RanCommand): string {
	return [
		`$ ${command.display}`,
		commandExitLine(command),
		formatOutputSection("stdout", command.stdout, COMMAND_DETAIL_TAIL),
		formatOutputSection("stderr", command.stderr, COMMAND_DETAIL_TAIL),
	].join("\n");
}

function formatCompletionWarning(warning: CompletionWarning): string {
	const lines = [`- ${warning.message}`];
	if (warning.command) {
		lines.push(indentLines(formatCommandDetails(warning.command), "  "));
	}
	if (warning.suggestedNextAction) {
		lines.push(`  Suggested next action: ${warning.suggestedNextAction}`);
	}
	return lines.join("\n");
}

function formatFailedAt(failedAt: { prNumber?: number; branch: string }): string {
	return failedAt.prNumber === undefined ? failedAt.branch : `#${failedAt.prNumber} ${failedAt.branch}`;
}

function formatFailureNotification(failure: LandStackFailure): string {
	const firstLine = failure.message.split("\n")[0] ?? failure.message;
	if (failure.severity === "info") {
		return firstLine;
	}
	if (failure.failedAt) {
		return `land-stack stopped at ${formatFailedAt(failure.failedAt)}: ${firstLine}`;
	}
	if ((failure.landed ?? []).length > 0) {
		return `land-stack stopped: ${firstLine}`;
	}
	return firstLine;
}

function presentLandStackMessage(ctx: CommandContext, message: string, level: NotifyLevel): void {
	if (ctx.hasUI) {
		ctx.ui.notify(message, level);
		return;
	}

	if (level === "error") {
		console.error(message);
		return;
	}

	console.log(message);
}

function reportLandStackFailure(pi: ExtensionAPI, ctx: CommandContext, failure: LandStackFailure): void {
	const full = formatFailure(failure);
	streamLandStackMessage(pi, full, { prLinks: prLinkDetails(failure.landed ?? []) });
	presentLandStackMessage(ctx, ctx.hasUI ? formatFailureNotification(failure) : full, failure.severity === "info" ? "info" : "error");
}

function reportLandStackSuccess(pi: ExtensionAPI, ctx: CommandContext, summary: string, landed: LandedPr[], warnings: CompletionWarning[]): void {
	streamLandStackMessage(pi, summary, { prLinks: prLinkDetails(landed) });
	presentLandStackMessage(ctx, summary, warnings.length > 0 ? "warning" : "info");
}

function streamLandStackMessage(pi: ExtensionAPI | undefined, content: string, details?: { prLinks?: Array<{ number: number; url: string }> }): void {
	if (!pi?.sendMessage) {
		return;
	}
	const message: CustomMessage = details === undefined ? { customType: LAND_STACK_MESSAGE_TYPE, content, display: true } : { customType: LAND_STACK_MESSAGE_TYPE, content, display: true, details };
	pi.sendMessage(message);
}

function prLinkDetails(landed: LandedPr[]): Array<{ number: number; url: string }> {
	const links: Array<{ number: number; url: string }> = [];
	for (const pr of landed) {
		if (!pr.url) continue;
		const sanitized = sanitizeTerminalHyperlinkUrl(pr.url);
		if (sanitized) {
			links.push({ number: pr.number, url: sanitized });
		}
	}
	return links;
}

function setLandStackStatus(ctx: CommandContext | undefined, value: string): void {
	ctx?.ui.setStatus(LAND_STACK_STATUS_KEY, value);
}

export async function handleLandStackCommand(pi: ExtensionAPI, rawArgs: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();

	try {
		const parsed = parseLandStackArgs(rawArgs);
		if (!parsed.ok) {
			presentLandStackMessage(ctx, `Unknown /land-stack argument: ${parsed.unknownArg}`, "error");
			return;
		}

		if (parsed.args.help) {
			presentLandStackMessage(ctx, LAND_STACK_HELP, "info");
			return;
		}

		ctx.ui.setStatus(LAND_STACK_STATUS_KEY, "preflighting land-stack…");
		const runner = createPiCommandRunner(pi);
		const preflight = await buildPreflightSnapshot(runner, ctx.cwd);
		if (!preflight.ok) {
			reportLandStackFailure(pi, ctx, preflight.failure);
			return;
		}

		const plan = formatLandingPlan(preflight.snapshot);
		if (parsed.args.dryRun) {
			presentLandStackMessage(ctx, `Dry run only; no PRs or local refs were changed.\n\n${plan}`, "info");
			return;
		}

		if (!parsed.args.yes) {
			if (!ctx.hasUI) {
				presentLandStackMessage(
					ctx,
					`Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.\n\n${plan}`,
					"error",
				);
				return;
			}

			const confirmed = await ctx.ui.confirm("Land this stack path?", plan);
			if (!confirmed) {
				presentLandStackMessage(ctx, "Cancelled before merge; no PRs were landed.", "info");
				return;
			}
		}

		const prepared = await prepareSnapshotForMerge(runner, preflight.snapshot, ctx);
		if (!prepared.ok) {
			reportLandStackFailure(pi, ctx, prepared.failure);
			return;
		}

		const mergeResult = await executeMergeLoop(runner, prepared.snapshot, pi, ctx);
		if (!mergeResult.ok) {
			reportLandStackFailure(pi, ctx, mergeResult.failure);
			return;
		}

		const summary = formatSuccessSummary(mergeResult.landed, prepared.snapshot.descendantBranches, mergeResult.warnings);
		reportLandStackSuccess(pi, ctx, summary, mergeResult.landed, mergeResult.warnings);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		presentLandStackMessage(ctx, `land-stack failed unexpectedly: ${message}`, "error");
	} finally {
		ctx.ui.setStatus(LAND_STACK_STATUS_KEY, undefined);
	}
}

export default function landStackExtension(pi: ExtensionAPI): void {
	pi.registerCommand(LAND_STACK_COMMAND_NAME, {
		description: LAND_STACK_DESCRIPTION,
		getArgumentCompletions: completeLandStackArgs,
		handler: async (args, ctx) => handleLandStackCommand(pi, args, ctx),
	});
}

function loadPullRequest(runner: CommandRunner, cwd: string, identifier: string, failureMessage: string): Promise<Result<PullRequestInfo>> {
	return runner.run("gh", ["pr", "view", identifier, "--json", PR_JSON_FIELDS.join(",")], { cwd, timeoutMs: GH_READ_TIMEOUT_MS }).then((result) => {
		if (result.code !== 0 || result.killed) {
			return err(failureMessage, result);
		}

		try {
			return ok(parsePullRequestInfo(result.stdout));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return err(`Invalid GitHub PR metadata for ${identifier}: ${message}`, result);
		}
	});
}

function commandResult(result: RanCommand, message: string): Result<RanCommand> {
	if (result.code !== 0 || result.killed) {
		return err(message, result);
	}
	return ok(result);
}

function ok<T>(value: T): Result<T> {
	return { ok: true, value };
}

function err(message: string, command?: RanCommand): Result<never> {
	return { ok: false, failure: command ? { severity: "error", message, command } : { severity: "error", message } };
}

function localBranchRef(branch: string): string {
	return `refs/heads/${branch}`;
}

function shortSha(sha: string): string {
	return sha.slice(0, 7);
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function commandExitLine(command: RanCommand): string {
	return command.killed ? `exit ${command.code} (killed or timed out)` : `exit ${command.code}`;
}

function indentLines(text: string, prefix: string): string {
	return text.split("\n").map((line) => `${prefix}${line}`).join("\n");
}

function normalizePathForCompare(path: string): string {
	return path.replace(/\/+$/, "");
}

function failureWithProgress(
	message: string,
	landed: LandedPr[],
	failedAt: { branch: string; prNumber?: number },
	command?: RanCommand,
	suggestedNextAction?: string,
): LandStackFailure {
	return {
		severity: "error",
		message,
		landed: [...landed],
		failedAt,
		...(command ? { command } : {}),
		...(suggestedNextAction ? { suggestedNextAction } : {}),
	};
}

function isVerifiedMergedPr(pr: PullRequestInfo, branch: string, trunkBranch: string): boolean {
	return pr.state === "MERGED" && pr.mergedAt !== null && pr.baseRefName === trunkBranch && pr.headRefName === branch;
}

function nextLandingFailureTarget(branch: LandingBranchSnapshot | undefined): { branch: string; prNumber?: number } {
	if (!branch) {
		return { branch: "unknown" };
	}
	return { branch: branch.branch, prNumber: branch.pr.number };
}
