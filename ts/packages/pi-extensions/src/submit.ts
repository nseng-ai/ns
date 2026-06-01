import { spawn } from "node:child_process";

import {
	commitPreparedCheckpointMessage,
	prepareCheckpointMessageForPi,
	type ExtensionAPI as CheckpointExtensionAPI,
	type ExtensionCommandContext as CheckpointExtensionCommandContext,
	type PreparedCheckpointMessage,
} from "./checkpoint-pi.ts";
import {
	formatPendingWorktreeCommandDetails,
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type PendingWorktreeSnapshot,
} from "./pending-worktree.ts";
import { truncateDisplayLine } from "./terminal-presentation.ts";

export type NotifyLevel = "info" | "success" | "warning" | "error";

type WidgetPlacement = "aboveEditor" | "belowEditor";

interface Theme {
	fg(color: string, text: string): string;
}

interface Component {
	render(width: number): string[];
	invalidate(): void;
}

type WidgetContent = string[] | ((tui: unknown, theme: Theme) => Component) | undefined;

export interface ExtensionCommandContext extends Omit<CheckpointExtensionCommandContext, "ui"> {
	hasUI: boolean;
	ui: Omit<CheckpointExtensionCommandContext["ui"], "notify" | "setWidget"> & {
		notify(message: string, level?: NotifyLevel): void;
		confirm(title: string, message: string): Promise<boolean>;
		setWidget(key: string, value: WidgetContent, options?: { placement?: WidgetPlacement }): void;
	};
}

export interface ExtensionAPI extends Pick<CheckpointExtensionAPI, "exec"> {
	registerCommand(
		name: string,
		command: {
			description: string;
			handler(args: string, ctx: ExtensionCommandContext): void | Promise<void>;
		},
	): void;
}

const COMMAND_NAME = "dev:submit";
const CHECKPOINT_COMMAND_NAME = "dev:cp";
const WIDGET_ID = "submit-output";
const SUBMIT_ARGS = ["submit", "-nps", "--ai"] as const;
const SUBMIT_DRY_RUN_ARGS = ["submit", "-nps", "--ai", "--dry-run"] as const;
const RESTACK_ARGS = ["restack", "--no-interactive"] as const;
const CURRENT_PR_ARGS = ["pr"] as const;
const GIT_WORKTREE_STATUS_ARGS = ["status", "--porcelain=v1"] as const;
const GIT_UNMERGED_ARGS = ["diff", "--name-only", "--diff-filter=U"] as const;
const GIT_STATUS_PORCELAIN_ARGS = ["status", "--porcelain"] as const;
const SUBMIT_TIMEOUT_MS = 600_000;
const RESTACK_TIMEOUT_MS = 600_000;
const CURRENT_PR_TIMEOUT_MS = 60_000;
const GIT_CHECK_TIMEOUT_MS = 30_000;
const PROGRESS_THROTTLE_MS = 100;
const SUCCESS_OUTPUT_TAIL_MAX_LINES = 20;
const SUCCESS_OUTPUT_TAIL_MAX_CHARS = 2_000;

export interface BufferedSubmitCommandResult {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
	startupError: string | undefined;
}

export interface StreamedSubmitCommandResult {
	code: number;
	killed: boolean;
	startupError: string | undefined;
}

interface SubmitCommandOptions {
	cwd: string;
	timeoutMs: number;
}

interface SubmitStreamingCommandOptions extends SubmitCommandOptions {
	onStdout(chunk: string): void;
	onStderr(chunk: string): void;
	onTimedOut?(): void;
}

export interface SubmitCommandRunner {
	runBuffered(
		command: string,
		args: readonly string[],
		options: SubmitCommandOptions,
	): Promise<BufferedSubmitCommandResult>;
	runStreaming(
		command: string,
		args: readonly string[],
		options: SubmitStreamingCommandOptions,
	): Promise<StreamedSubmitCommandResult>;
}

export type LoadedPendingWorktreeSnapshotResult = Awaited<ReturnType<typeof loadPendingWorktreeSnapshot>>;

export interface SubmitCheckpointOperations {
	loadSnapshot(ctx: ExtensionCommandContext): Promise<LoadedPendingWorktreeSnapshotResult>;
	prepareMessage(
		ctx: ExtensionCommandContext,
		snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
	): Promise<PreparedCheckpointMessage>;
	commit(ctx: ExtensionCommandContext, message: string): Promise<{ summary: string } | { error: string }>;
}

export interface SubmitDependencies {
	runner?: SubmitCommandRunner;
	checkpoint?: SubmitCheckpointOperations;
}

export default function submitExtension(pi: ExtensionAPI): void {
	submitExtensionWithDependencies(pi);
}

export function submitExtensionWithDependencies(pi: ExtensionAPI, dependencies: SubmitDependencies = {}): void {
	const runner = dependencies.runner ?? createNodeSubmitCommandRunner();
	const checkpointOperations = dependencies.checkpoint ?? createDefaultSubmitCheckpointOperations(pi);

	pi.registerCommand(COMMAND_NAME, {
		description: "Submit the current Graphite stack with gt submit -nps --ai after a clean-worktree check",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();
			ctx.ui.setWidget(WIDGET_ID, undefined);
			const progress = createSubmitProgress(ctx);

			const firstAttempt = await runSubmitAttempt({
				ctx,
				progress,
				runner,
				allowNoCurrentPrRecovery: true,
			});
			if (firstAttempt.kind !== "post_submit_no_current_pr") return;

			const recovery = await offerCheckpointRecovery({
				ctx,
				operations: checkpointOperations,
				originalFailure: firstAttempt,
			});
			if (recovery !== "retry") return;

			ctx.ui.setWidget(WIDGET_ID, undefined);
			await runSubmitAttempt({
				ctx,
				progress,
				runner,
				allowNoCurrentPrRecovery: false,
			});
		},
	});
}

interface PrLink {
	label: string;
	url: string;
}

type BufferedCommandResult = BufferedSubmitCommandResult;

type CurrentPrFailure =
	| { kind: "startup_error"; message: string }
	| { kind: "timeout"; message: string }
	| { kind: "no_current_pr"; message: string }
	| { kind: "failed"; message: string };

type SubmitAttemptOutcome =
	| { kind: "success" }
	| { kind: "preflight_handled" }
	| { kind: "failure_handled" }
	| {
			kind: "post_submit_no_current_pr";
			stdout: string;
			stderr: string;
			currentPrCheck: BufferedCommandResult;
			semanticFailure: string | undefined;
			currentPrFailure: CurrentPrFailure & { kind: "no_current_pr" };
		};

type PostSubmitNoCurrentPrOutcome = Extract<SubmitAttemptOutcome, { kind: "post_submit_no_current_pr" }>;

type CheckpointRecoveryDecision = "retry" | "handled";

interface SubmitCommandOutput {
	result: StreamedSubmitCommandResult;
	stdout: string;
	stderr: string;
}

type SubmitWorktreeReadinessResult =
	| { kind: "clean"; result: BufferedCommandResult }
	| { kind: "dirty"; result: BufferedCommandResult }
	| { kind: "failed"; result: BufferedCommandResult };

interface SubmitProgress {
	show(line: string): void;
	clear(): void;
}

function createSubmitProgress(ctx: ExtensionCommandContext): SubmitProgress {
	return {
		show(line: string): void {
			setProgressWidget(ctx, line);
		},
		clear(): void {
			ctx.ui.setWidget(WIDGET_ID, undefined);
		},
	};
}

function createDefaultSubmitCheckpointOperations(pi: ExtensionAPI): SubmitCheckpointOperations {
	return {
		loadSnapshot(ctx: ExtensionCommandContext): Promise<LoadedPendingWorktreeSnapshotResult> {
			return loadPendingWorktreeSnapshot({
				cwd: ctx.cwd,
				execGit: (args, timeout) => pi.exec("git", args, { cwd: ctx.cwd, timeout }),
			});
		},
		prepareMessage(
			ctx: ExtensionCommandContext,
			snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
		): Promise<PreparedCheckpointMessage> {
			return prepareCheckpointMessageForPi(pi, ctx, snapshot);
		},
		commit(ctx: ExtensionCommandContext, message: string): Promise<{ summary: string } | { error: string }> {
			return commitPreparedCheckpointMessage(pi, ctx.cwd, message);
		},
	};
}

async function runSubmitAttempt(input: {
	ctx: ExtensionCommandContext;
	progress: SubmitProgress;
	runner: SubmitCommandRunner;
	allowNoCurrentPrRecovery: boolean;
}): Promise<SubmitAttemptOutcome> {
	const { ctx, progress, runner } = input;
	const worktreeClean = await ensureWorkingTreeCleanForSubmit(ctx, progress, runner);
	if (!worktreeClean) return { kind: "failure_handled" };

	const ready = await ensureStackReadyForSubmit(ctx, progress, runner);
	if (!ready) return { kind: "preflight_handled" };

	const { result, stdout, stderr } = await runStreamingSubmitCommand(ctx, progress, runner);
	const submitOutput = `${stdout}\n${stderr}`;
	const semanticFailure = detectSubmitSemanticFailure(submitOutput);

	if (result.code === 0 && !result.killed) {
		progress.show("gt pr: verifying current branch…");
		const currentPrCheck = await runner
			.runBuffered("gt", [...CURRENT_PR_ARGS], { cwd: ctx.cwd, timeoutMs: CURRENT_PR_TIMEOUT_MS })
			.finally(() => progress.clear());
		const currentPrFailure = detectCurrentPrFailure(currentPrCheck);

		if (semanticFailure || currentPrFailure) {
			if (currentPrFailure?.kind === "no_current_pr" && input.allowNoCurrentPrRecovery) {
				return {
					kind: "post_submit_no_current_pr",
					stdout,
					stderr,
					currentPrCheck,
					semanticFailure,
					currentPrFailure,
				};
			}

			displayPostSubmitFailure(ctx, {
				stdout,
				stderr,
				currentPrCheck,
				semanticFailure,
				currentPrFailure,
			});
			return { kind: "failure_handled" };
		}

		const prLinks = extractPrLinks(`${submitOutput}\n${currentPrCheck.stdout}\n${currentPrCheck.stderr}`);
		const successOutput = prLinks.length > 0 ? formatSubmitSuccessText(prLinks) : formatSubmitSuccessFallbackText(stdout, stderr);

		progress.clear();
		if (!ctx.hasUI) {
			console.log(successOutput);
		}
		ctx.ui.notify(formatSubmitSuccessNotification(prLinks), "info");
		return { kind: "success" };
	}

	displayFailureOutput(
		ctx,
		formatFailureOutput({
			code: result.code,
			killed: result.killed,
			startupError: result.startupError,
			stdout,
			stderr,
		}),
	);
	return { kind: "failure_handled" };
}

async function runStreamingSubmitCommand(
	ctx: ExtensionCommandContext,
	progress: SubmitProgress,
	runner: SubmitCommandRunner,
): Promise<SubmitCommandOutput> {
	const stdoutChunks: string[] = [];
	const stderrChunks: string[] = [];
	let stdoutRemainder = "";
	let stderrRemainder = "";
	let latestLine = "running…";
	let progressTimer: ReturnType<typeof setTimeout> | undefined;

	const renderProgress = () => {
		progress.show(`gt submit: ${latestLine}`);
	};

	const scheduleProgress = () => {
		if (progressTimer) return;
		progressTimer = setTimeout(() => {
			progressTimer = undefined;
			renderProgress();
		}, PROGRESS_THROTTLE_MS);
	};

	const noteLine = (_source: "stdout" | "stderr", line: string) => {
		const sanitized = sanitizeProgressText(line);
		if (!sanitized) return;
		latestLine = sanitized;
		scheduleProgress();
	};

	const appendOutput = (source: "stdout" | "stderr", chunk: string) => {
		if (source === "stdout") {
			stdoutChunks.push(chunk);
		} else {
			stderrChunks.push(chunk);
		}

		const normalized = chunk.replace(/\r/g, "\n");
		const text = (source === "stdout" ? stdoutRemainder : stderrRemainder) + normalized;
		const lines = text.split("\n");
		const remainder = lines.pop() ?? "";

		if (source === "stdout") {
			stdoutRemainder = remainder;
		} else {
			stderrRemainder = remainder;
		}

		for (const line of lines) {
			noteLine(source, line);
		}
		noteLine(source, remainder);
	};

	const flushRemainders = () => {
		noteLine("stdout", stdoutRemainder);
		noteLine("stderr", stderrRemainder);
		stdoutRemainder = "";
		stderrRemainder = "";
	};

	renderProgress();

	const result = await runner.runStreaming("gt", [...SUBMIT_ARGS], {
		cwd: ctx.cwd,
		timeoutMs: SUBMIT_TIMEOUT_MS,
		onStdout(chunk: string): void {
			appendOutput("stdout", chunk);
		},
		onStderr(chunk: string): void {
			appendOutput("stderr", chunk);
		},
		onTimedOut(): void {
			latestLine = `timed out after ${SUBMIT_TIMEOUT_MS / 1000}s; sent SIGTERM`;
			scheduleProgress();
		},
	});
	if (result.startupError) {
		noteLine("stderr", result.startupError);
	}

	if (progressTimer) {
		clearTimeout(progressTimer);
		progressTimer = undefined;
	}
	flushRemainders();
	if (progressTimer) {
		clearTimeout(progressTimer);
		progressTimer = undefined;
	}
	progress.clear();

	return {
		result,
		stdout: stdoutChunks.join(""),
		stderr: stderrChunks.join(""),
	};
}

async function offerCheckpointRecovery(input: {
	ctx: ExtensionCommandContext;
	operations: SubmitCheckpointOperations;
	originalFailure: PostSubmitNoCurrentPrOutcome;
}): Promise<CheckpointRecoveryDecision> {
	const { ctx, operations, originalFailure } = input;
	const originalOutput = formatOriginalPostSubmitFailure(originalFailure);

	if (!ctx.hasUI) {
		displayFailureOutput(ctx, formatCheckpointRecoveryNoUiOutput(originalOutput));
		return "handled";
	}

	const loaded = await loadSnapshotForCheckpointRecovery(ctx, operations, originalOutput);
	if (!loaded.ok) return "handled";

	const snapshot = loaded.snapshot;
	if (snapshot.clean) {
		displayFailureOutput(
			ctx,
			formatCheckpointRecoveryUnavailableOutput(
				originalOutput,
				"Working tree is clean; there are no outstanding changes to checkpoint.",
			),
		);
		return "handled";
	}
	if (snapshot.branch === "main" || snapshot.branch === "master") {
		displayFailureOutput(
			ctx,
			formatCheckpointRecoveryUnavailableOutput(originalOutput, `Refusing to create checkpoint commit on trunk branch: ${snapshot.branch}`),
		);
		return "handled";
	}

	ctx.ui.setWidget(WIDGET_ID, undefined);
	const prepared = await prepareMessageForCheckpointRecovery(
		ctx,
		operations,
		{ status: snapshot.status, diff: snapshot.diff },
		originalOutput,
	);
	if (!prepared.ok) return "handled";

	const confirmed = await ctx.ui.confirm("Checkpoint pending changes?", formatCheckpointRecoveryPrompt(prepared.message));
	if (!confirmed) {
		ctx.ui.setWidget(WIDGET_ID, formatCheckpointRecoveryDeclinedWidgetOutput(originalOutput, prepared.message).split("\n"));
		ctx.ui.notify(`Submission cancelled. Pending changes were not checkpointed; run /${CHECKPOINT_COMMAND_NAME} or /${COMMAND_NAME} again when ready.`, "warning");
		return "handled";
	}

	ctx.ui.setWidget(WIDGET_ID, undefined);
	const committed = await commitCheckpointForRecovery(ctx, operations, prepared.message, originalOutput);
	if (!committed.ok) return "handled";

	ctx.ui.notify(`Checkpoint created: ${committed.summary}; retrying submit…`, "info");
	return "retry";
}

async function loadSnapshotForCheckpointRecovery(
	ctx: ExtensionCommandContext,
	operations: SubmitCheckpointOperations,
	originalOutput: string,
): Promise<LoadedPendingWorktreeSnapshotResult> {
	try {
		const loaded = await operations.loadSnapshot(ctx);
		if (!loaded.ok) {
			displayFailureOutput(ctx, formatCheckpointSnapshotFailureOutput(originalOutput, loaded.error));
		}
		return loaded;
	} catch (error) {
		displayFailureOutput(ctx, formatCheckpointRecoveryUnavailableOutput(originalOutput, `Could not inspect pending worktree: ${errorMessage(error)}`));
		return {
			ok: false,
			error: {
				kind: "status_failed",
				message: "Could not inspect pending worktree.",
				result: { code: 1, stdout: "", stderr: errorMessage(error) },
			},
		};
	}
}

async function prepareMessageForCheckpointRecovery(
	ctx: ExtensionCommandContext,
	operations: SubmitCheckpointOperations,
	snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
	originalOutput: string,
): Promise<PreparedCheckpointMessage> {
	try {
		const prepared = await operations.prepareMessage(ctx, snapshot);
		if (!prepared.ok) {
			displayFailureOutput(ctx, formatCheckpointPreparationFailureOutput(originalOutput, prepared.error));
		}
		return prepared;
	} catch (error) {
		const message = errorMessage(error);
		displayFailureOutput(ctx, formatCheckpointPreparationFailureOutput(originalOutput, message));
		return { ok: false, error: message };
	}
}

async function commitCheckpointForRecovery(
	ctx: ExtensionCommandContext,
	operations: SubmitCheckpointOperations,
	message: string,
	originalOutput: string,
): Promise<{ ok: true; summary: string } | { ok: false }> {
	try {
		const committed = await operations.commit(ctx, message);
		if ("error" in committed) {
			displayFailureOutput(ctx, formatCheckpointCommitFailureOutput(originalOutput, committed.error));
			return { ok: false };
		}
		return { ok: true, summary: committed.summary };
	} catch (error) {
		displayFailureOutput(ctx, formatCheckpointCommitFailureOutput(originalOutput, errorMessage(error)));
		return { ok: false };
	}
}

function setProgressWidget(ctx: ExtensionCommandContext, line: string): void {
	const progressLine = sanitizeProgressText(line);
	if (!progressLine) {
		ctx.ui.setWidget(WIDGET_ID, undefined);
		return;
	}

	ctx.ui.setWidget(
		WIDGET_ID,
		(_tui, theme): Component => ({
			render(width: number): string[] {
				if (width <= 0) return [""];

				const { label, details } = splitProgressLine(progressLine);
				const visible = truncateDisplayLine(`${label}${details}`, width);
				const visibleLabel = visible.slice(0, Math.min(label.length, visible.length));
				const visibleDetails = visible.slice(visibleLabel.length);
				const content = visibleDetails
					? theme.fg("accent", visibleLabel) + theme.fg("dim", visibleDetails)
					: theme.fg("accent", visibleLabel);
				return [content];
			},
			invalidate(): void {},
		}),
		{ placement: "aboveEditor" },
	);
}

function splitProgressLine(line: string): { label: string; details: string } {
	const separatorIndex = line.indexOf(":");
	if (separatorIndex === -1) return { label: line, details: "" };
	return { label: line.slice(0, separatorIndex), details: line.slice(separatorIndex) };
}

function sanitizeProgressText(text: string): string {
	return stripAnsi(text)
		.replace(/[\r\n\t]/g, " ")
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
		.replace(/ +/g, " ")
		.trim();
}

async function ensureWorkingTreeCleanForSubmit(
	ctx: ExtensionCommandContext,
	progress: SubmitProgress,
	runner: SubmitCommandRunner,
): Promise<boolean> {
	progress.show("git status: checking for uncommitted changes…");
	const readiness = await checkWorkingTreeClean(ctx.cwd, runner).finally(() => progress.clear());

	if (readiness.kind === "clean") return true;

	if (readiness.kind === "dirty") {
		displayFailureOutput(ctx, formatDirtyWorktreeOutput(readiness.result));
		return false;
	}

	displayFailureOutput(ctx, formatWorktreeCheckFailureOutput(readiness.result));
	return false;
}

async function checkWorkingTreeClean(cwd: string, runner: SubmitCommandRunner): Promise<SubmitWorktreeReadinessResult> {
	const result = await runner.runBuffered("git", [...GIT_WORKTREE_STATUS_ARGS], { cwd, timeoutMs: GIT_CHECK_TIMEOUT_MS });
	if (result.startupError || result.killed || result.code !== 0) return { kind: "failed", result };
	if (result.stdout.trim().length > 0) return { kind: "dirty", result };
	return { kind: "clean", result };
}

async function ensureStackReadyForSubmit(
	ctx: ExtensionCommandContext,
	progress: SubmitProgress,
	runner: SubmitCommandRunner,
): Promise<boolean> {
	progress.show("gt submit --dry-run: checking…");
	const dryRun = await runner
		.runBuffered("gt", [...SUBMIT_DRY_RUN_ARGS], { cwd: ctx.cwd, timeoutMs: CURRENT_PR_TIMEOUT_MS })
		.finally(() => progress.clear());

	if (dryRun.code === 0 && !dryRun.killed && !dryRun.startupError) {
		return true;
	}

	if (dryRun.startupError || dryRun.killed) {
		displayFailureOutput(ctx, formatPreflightFailureOutput(dryRun));
		return false;
	}

	const dryRunOutput = `${dryRun.stdout}\n${dryRun.stderr}`;
	if (!detectRestackNeeded(dryRunOutput)) {
		displayFailureOutput(ctx, formatPreflightFailureOutput(dryRun));
		return false;
	}

	if (!ctx.hasUI) {
		displayFailureOutput(ctx, formatRestackRequiredNoUiOutput(dryRun));
		return false;
	}

	const confirmed = await ctx.ui.confirm(
		"Restack required",
		"Graphite says this stack must be restacked before submission. Run `gt restack` now?",
	);
	if (!confirmed) {
		progress.clear();
		ctx.ui.notify(`Submission cancelled. Run \`gt restack\` when ready, then /${COMMAND_NAME} again.`, "warning");
		return false;
	}

	progress.show("gt restack: running…");
	const restack = await runner
		.runBuffered("gt", [...RESTACK_ARGS], { cwd: ctx.cwd, timeoutMs: RESTACK_TIMEOUT_MS })
		.finally(() => progress.clear());

	if (restack.code === 0 && !restack.killed && !restack.startupError) {
		ctx.ui.notify("Restack succeeded; continuing submit…", "info");
		return true;
	}

	progress.show("git: checking for merge conflicts…");
	const conflictedFiles = await getConflictedFiles(ctx.cwd, runner).finally(() => progress.clear());
	if (detectRestackMergeConflict(`${restack.stdout}\n${restack.stderr}`, conflictedFiles)) {
		displayFailureOutput(ctx, formatRestackConflictOutput(restack, conflictedFiles));
		return false;
	}

	displayFailureOutput(ctx, formatRestackFailureOutput(restack));
	return false;
}

function displayFailureOutput(ctx: ExtensionCommandContext, output: string): void {
	ctx.ui.setWidget(WIDGET_ID, output.split("\n"));
	if (!ctx.hasUI) {
		console.error(output);
	}
	ctx.ui.notify(output, "error");
}

async function getConflictedFiles(cwd: string, runner: SubmitCommandRunner): Promise<string[]> {
	const unmerged = await runner.runBuffered("git", [...GIT_UNMERGED_ARGS], { cwd, timeoutMs: GIT_CHECK_TIMEOUT_MS });
	const status = await runner.runBuffered("git", [...GIT_STATUS_PORCELAIN_ARGS], { cwd, timeoutMs: GIT_CHECK_TIMEOUT_MS });

	return uniqueNonEmpty([...parseConflictedFiles(unmerged.stdout), ...parsePorcelainConflictedFiles(status.stdout)]);
}

function createNodeSubmitCommandRunner(): SubmitCommandRunner {
	return {
		runBuffered(command: string, args: readonly string[], options: SubmitCommandOptions): Promise<BufferedSubmitCommandResult> {
			return runNodeBufferedCommand(command, args, options);
		},
		runStreaming(command: string, args: readonly string[], options: SubmitStreamingCommandOptions): Promise<StreamedSubmitCommandResult> {
			return runNodeStreamingCommand(command, args, options);
		},
	};
}

function runNodeBufferedCommand(
	command: string,
	args: readonly string[],
	options: SubmitCommandOptions,
): Promise<BufferedSubmitCommandResult> {
	return new Promise((resolve) => {
		const stdoutChunks: string[] = [];
		const stderrChunks: string[] = [];
		let killed = false;
		let settled = false;
		let startupError: string | undefined;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		let forceKillTimeoutId: ReturnType<typeof setTimeout> | undefined;

		const child = spawn(command, [...args], {
			cwd: options.cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});

		const finish = (code: number | null) => {
			if (settled) return;
			settled = true;
			if (timeoutId) clearTimeout(timeoutId);
			if (forceKillTimeoutId) clearTimeout(forceKillTimeoutId);
			resolve({
				stdout: stdoutChunks.join(""),
				stderr: stderrChunks.join(""),
				code: code ?? (killed ? 1 : 0),
				killed,
				startupError,
			});
		};

		timeoutId = setTimeout(() => {
			if (killed) return;
			killed = true;
			child.kill("SIGTERM");
			forceKillTimeoutId = setTimeout(() => {
				if (!settled) {
					child.kill("SIGKILL");
				}
			}, 5000);
		}, options.timeoutMs);

		child.stdout.on("data", (chunk) => stdoutChunks.push(chunk.toString()));
		child.stderr.on("data", (chunk) => stderrChunks.push(chunk.toString()));
		child.on("error", (error) => {
			startupError = error.message;
			finish(1);
		});
		child.on("close", (code) => finish(code));
	});
}

function runNodeStreamingCommand(
	command: string,
	args: readonly string[],
	options: SubmitStreamingCommandOptions,
): Promise<StreamedSubmitCommandResult> {
	return new Promise((resolve) => {
		let killed = false;
		let settled = false;
		let startupError: string | undefined;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		let forceKillTimeoutId: ReturnType<typeof setTimeout> | undefined;

		const child = spawn(command, [...args], {
			cwd: options.cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});

		const finish = (code: number | null) => {
			if (settled) return;
			settled = true;
			if (timeoutId) clearTimeout(timeoutId);
			if (forceKillTimeoutId) clearTimeout(forceKillTimeoutId);
			resolve({ code: code ?? (killed ? 1 : 0), killed, startupError });
		};

		timeoutId = setTimeout(() => {
			if (killed) return;
			killed = true;
			options.onTimedOut?.();
			child.kill("SIGTERM");
			forceKillTimeoutId = setTimeout(() => {
				if (!settled) {
					child.kill("SIGKILL");
				}
			}, 5000);
		}, options.timeoutMs);

		child.stdout.on("data", (chunk) => options.onStdout(chunk.toString()));
		child.stderr.on("data", (chunk) => options.onStderr(chunk.toString()));
		child.on("error", (error) => {
			startupError = error.message;
			finish(1);
		});
		child.on("close", (code) => finish(code));
	});
}

function extractPrLinks(output: string): PrLink[] {
	const strippedOutput = stripAnsi(output);
	const links: PrLink[] = [];
	const seenUrls = new Set<string>();

	for (const match of strippedOutput.matchAll(/https?:\/\/[^\s<>"'\u0060]+/g)) {
		const rawUrl = match[0];
		const url = trimTerminalPunctuation(rawUrl);
		if (seenUrls.has(url)) continue;

		const link = toPrLink(url);
		if (!link) continue;

		seenUrls.add(url);
		links.push(link);
	}

	return links;
}

function toPrLink(url: string): PrLink | undefined {
	const prNumber = prNumberFromUrl(url);
	if (prNumber) return { label: `#${prNumber}`, url };
	if (isPotentialPrUrl(url)) return { label: url, url };
	return undefined;
}

function prNumberFromUrl(url: string): string | undefined {
	const graphiteMatch = url.match(/^https:\/\/app\.graphite\.com\/github\/pr\/[^\/\s?#]+\/[^\/\s?#]+\/(\d+)(?:[\/?#].*)?$/);
	if (graphiteMatch?.[1]) return graphiteMatch[1];

	const githubMatch = url.match(/^https:\/\/github\.com\/[^\/\s?#]+\/[^\/\s?#]+\/pull\/(\d+)(?:[\/?#].*)?$/);
	return githubMatch?.[1];
}

function isPotentialPrUrl(url: string): boolean {
	return (
		/^https:\/\/app\.graphite\.com\/github\/pr\//.test(url) || /^https:\/\/github\.com\/[^\/\s?#]+\/[^\/\s?#]+\/pull\//.test(url)
	);
}

function stripAnsi(text: string): string {
	return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g, "");
}

function trimTerminalPunctuation(url: string): string {
	let trimmed = url;
	while (/[),.;:!?}\]]$/.test(trimmed)) {
		trimmed = trimmed.slice(0, -1);
	}
	return trimmed;
}

function formatSubmitSuccessText(prLinks: PrLink[]): string {
	return ["gt submit succeeded", "", "PRs:", ...prLinks.map(formatPrLinkTextRow)].join("\n");
}

function formatPrLinkTextRow(link: PrLink): string {
	if (link.label === link.url) return `• ${link.url}`;
	return `• ${link.label} ${link.url}`;
}

function formatSubmitSuccessFallbackText(stdout: string, stderr: string): string {
	const lines = ["gt submit succeeded, but no PR URLs were detected in output."];
	const outputTail = formatSubmitOutputTail(stdout, stderr);
	if (outputTail) {
		lines.push("", "Recent output:", outputTail);
	}
	return lines.join("\n");
}

function formatSubmitOutputTail(stdout: string, stderr: string): string {
	const output = stripAnsi(`${stdout}\n${stderr}`).replace(/\r/g, "\n").trimEnd();
	if (!output) return "";

	const lines = output.split("\n");
	const tailLines = lines.slice(-SUCCESS_OUTPUT_TAIL_MAX_LINES);
	let tail = tailLines.join("\n");
	if (tail.length > SUCCESS_OUTPUT_TAIL_MAX_CHARS) {
		tail = `…${tail.slice(-SUCCESS_OUTPUT_TAIL_MAX_CHARS)}`;
	}
	if (lines.length > tailLines.length) {
		return `… ${lines.length - tailLines.length} earlier line(s) omitted\n${tail}`;
	}
	return tail;
}

function detectRestackNeeded(output: string): boolean {
	const strippedOutput = stripAnsi(output).replace(/\r/g, "\n");
	const mentionsRestack = /\brestack(?:ed|ing)?\b/i.test(strippedOutput);
	const requiresRestackBeforeSubmit =
		/before submit(?:ting|sion)?/i.test(strippedOutput) ||
		/need(?:s|ed)? to be restacked/i.test(strippedOutput) ||
		/must be restacked/i.test(strippedOutput) ||
		/requires? (?:a )?restack/i.test(strippedOutput) ||
		/restack (?:is )?required/i.test(strippedOutput);

	return mentionsRestack && requiresRestackBeforeSubmit;
}

function detectRestackMergeConflict(output: string, conflictedFiles: string[]): boolean {
	const strippedOutput = stripAnsi(output);
	return (
		conflictedFiles.length > 0 ||
		/CONFLICT \(/i.test(strippedOutput) ||
		/merge conflict/i.test(strippedOutput) ||
		/fix conflicts/i.test(strippedOutput) ||
		/resolve conflicts/i.test(strippedOutput)
	);
}

function parseConflictedFiles(output: string): string[] {
	return uniqueNonEmpty(stripAnsi(output).replace(/\r/g, "\n").split("\n"));
}

function parsePorcelainConflictedFiles(output: string): string[] {
	const conflictStatuses = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
	const files: string[] = [];

	for (const line of stripAnsi(output).replace(/\r/g, "\n").split("\n")) {
		if (line.length < 4) continue;

		const status = line.slice(0, 2);
		if (!conflictStatuses.has(status)) continue;

		files.push(line.slice(3));
	}

	return uniqueNonEmpty(files);
}

function uniqueNonEmpty(values: string[]): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];

	for (const value of values) {
		const trimmed = value.trim();
		if (!trimmed || seen.has(trimmed)) continue;

		seen.add(trimmed);
		unique.push(trimmed);
	}

	return unique;
}

function detectSubmitSemanticFailure(output: string): string | undefined {
	const strippedOutput = stripAnsi(output).replace(/\r/g, "\n");
	const emptyBranchWarning = /This branch does not introduce any changes:/i.test(strippedOutput);
	const skippedSubmissionWarning =
		/will not be submitted/i.test(strippedOutput) || /GitHub does not allow empty PRs/i.test(strippedOutput);

	if (emptyBranchWarning && skippedSubmissionWarning) {
		return "gt submit exited 0, but Graphite skipped submitting part of the stack because a branch is empty.";
	}

	return undefined;
}

function detectCurrentPrFailure(result: BufferedCommandResult): CurrentPrFailure | undefined {
	if (result.startupError) {
		return {
			kind: "startup_error",
			message: `gt submit exited 0, but current PR verification could not start: ${result.startupError}`,
		};
	}
	if (result.killed) {
		return {
			kind: "timeout",
			message: `gt submit exited 0, but current PR verification timed out after ${CURRENT_PR_TIMEOUT_MS / 1000}s.`,
		};
	}
	if (result.code !== 0) {
		const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
		if (/No PR found/i.test(output)) {
			return { kind: "no_current_pr", message: "gt submit exited 0, but the current branch still has no PR." };
		}
		return { kind: "failed", message: `gt submit exited 0, but current PR verification failed with exit code ${result.code}.` };
	}
	return undefined;
}

function displayPostSubmitFailure(
	ctx: ExtensionCommandContext,
	failure: {
		stdout: string;
		stderr: string;
		currentPrCheck: BufferedCommandResult;
		semanticFailure: string | undefined;
		currentPrFailure: CurrentPrFailure | undefined;
	},
): void {
	displayFailureOutput(ctx, formatOriginalPostSubmitFailure(failure));
}

function formatOriginalPostSubmitFailure({
	stdout,
	stderr,
	currentPrCheck,
	semanticFailure,
	currentPrFailure,
}: {
	stdout: string;
	stderr: string;
	currentPrCheck: BufferedCommandResult;
	semanticFailure: string | undefined;
	currentPrFailure: CurrentPrFailure | undefined;
}): string {
	return formatPostSubmitFailureOutput({
		reason: formatPostSubmitFailureReason(semanticFailure, currentPrFailure),
		stdout,
		stderr,
		currentPrCheck,
	});
}

function formatPostSubmitFailureReason(semanticFailure: string | undefined, currentPrFailure: CurrentPrFailure | undefined): string {
	return [semanticFailure, currentPrFailure?.message].filter((line): line is string => Boolean(line)).join("\n");
}

function formatCheckpointRecoveryPrompt(message: string): string {
	return [
		"gt submit completed, but Graphite still reports no PR for this branch.",
		`The working tree has outstanding changes. /${COMMAND_NAME} can checkpoint them and retry.`,
		"",
		`This will stage and commit all outstanding changes, the same as /${CHECKPOINT_COMMAND_NAME}.`,
		"",
		"Proposed checkpoint commit message:",
		"",
		message,
		"",
		`Checkpoint these changes and retry /${COMMAND_NAME}?`,
	].join("\n");
}

function formatCheckpointRecoveryNoUiOutput(originalFailure: string): string {
	return [
		originalFailure,
		"",
		`No checkpoint commit was created because /${COMMAND_NAME} is running without an interactive confirmation prompt.`,
		`Run /${CHECKPOINT_COMMAND_NAME} to checkpoint outstanding changes, then run /${COMMAND_NAME} again.`,
	].join("\n");
}

function formatCheckpointSnapshotFailureOutput(originalFailure: string, error: PendingWorktreeError): string {
	return [
		originalFailure,
		"",
		"Could not inspect pending worktree for checkpoint recovery.",
		error.message,
		formatPendingWorktreeCommandDetails(error.result),
	]
		.filter(Boolean)
		.join("\n");
}

function formatCheckpointRecoveryUnavailableOutput(originalFailure: string, reason: string): string {
	return [
		originalFailure,
		"",
		reason,
		`No checkpoint commit was created. Run /${CHECKPOINT_COMMAND_NAME} or /${COMMAND_NAME} again after resolving this state.`,
	].join("\n");
}

function formatCheckpointPreparationFailureOutput(originalFailure: string, error: string): string {
	return [
		originalFailure,
		"",
		`Checkpoint recovery could not prepare a /${CHECKPOINT_COMMAND_NAME}-style commit message. Submission was not retried.`,
		error,
	].join("\n");
}

function formatCheckpointCommitFailureOutput(originalFailure: string, error: string): string {
	return [
		originalFailure,
		"",
		"Checkpoint recovery prepared a commit message, but creating the checkpoint commit failed. Submission was not retried.",
		error,
	].join("\n");
}

function formatCheckpointRecoveryDeclinedWidgetOutput(originalFailure: string, message: string): string {
	return [
		originalFailure,
		"",
		"Checkpoint recovery was cancelled. Pending changes were not checkpointed.",
		"",
		"Proposed checkpoint commit message:",
		"",
		message,
	].join("\n");
}

function formatPostSubmitFailureOutput({
	reason,
	stdout,
	stderr,
	currentPrCheck,
}: {
	reason: string;
	stdout: string;
	stderr: string;
	currentPrCheck: BufferedCommandResult;
}): string {
	return [
		reason,
		"",
		"$ gt submit -nps --ai",
		"",
		formatOutputSection("stdout", stdout),
		formatOutputSection("stderr", stderr),
		formatBufferedCommandSection("$ gt pr", currentPrCheck),
	]
		.filter(Boolean)
		.join("\n");
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function formatBufferedCommandSection(commandDisplay: string, result: BufferedCommandResult): string {
	const status = result.startupError
		? `startup error: ${result.startupError}`
		: result.killed
			? `timed out after ${CURRENT_PR_TIMEOUT_MS / 1000}s`
			: `exit code ${result.code}`;
	return [
		`${commandDisplay} (${status})`,
		"",
		formatOutputSection("stdout", result.stdout),
		formatOutputSection("stderr", result.stderr),
	].join("\n");
}

function formatSubmitSuccessNotification(prLinks: PrLink[]): string {
	if (prLinks.length === 0) return "gt submit succeeded, but no PR URLs were detected.";
	const labels = prLinks.map(formatClickablePrLabel);
	if (labels.length === 1) return `gt submit succeeded: ${labels[0] ?? "PR link"}`;
	return `gt submit succeeded: ${labels.join(", ")}`;
}

function formatClickablePrLabel(link: PrLink): string {
	// Notifications render as plain Text rather than Markdown, so use OSC 8
	// directly to make the compact #123 label clickable.
	return `\x1b]8;;${sanitizeOsc8Url(link.url)}\x1b\\${link.label}\x1b]8;;\x1b\\`;
}

function sanitizeOsc8Url(url: string): string {
	return url.replace(/[\x00-\x1f\x7f]/g, "");
}

function formatDirtyWorktreeOutput(result: BufferedCommandResult): string {
	return [
		`Working tree has uncommitted changes. /${COMMAND_NAME} only submits committed Graphite branches.`,
		`Run /${CHECKPOINT_COMMAND_NAME} to checkpoint outstanding changes, then run /${COMMAND_NAME} again.`,
		"Submission was not attempted.",
		"",
		"$ git status --porcelain=v1",
		"",
		formatOutputSection("stdout", result.stdout),
		formatOutputSection("stderr", result.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

function formatWorktreeCheckFailureOutput(result: BufferedCommandResult): string {
	const reason = result.startupError
		? `git status could not start: ${result.startupError}. Submission was not attempted.`
		: result.killed
			? `git status --porcelain=v1 timed out after ${GIT_CHECK_TIMEOUT_MS / 1000}s. Submission was not attempted.`
			: `git status --porcelain=v1 failed with exit code ${result.code}. Submission was not attempted.`;

	return [
		reason,
		"",
		"$ git status --porcelain=v1",
		"",
		formatOutputSection("stdout", result.stdout),
		formatOutputSection("stderr", result.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

function formatPreflightFailureOutput(result: BufferedCommandResult): string {
	const reason = result.startupError
		? `gt submit --dry-run could not start: ${result.startupError}. Submission was not attempted.`
		: result.killed
			? `gt submit --dry-run timed out after ${CURRENT_PR_TIMEOUT_MS / 1000}s. Submission was not attempted.`
			: `gt submit -nps --ai --dry-run failed with exit code ${result.code}. Submission was not attempted.`;

	return [
		reason,
		"",
		"$ gt submit -nps --ai --dry-run",
		"",
		formatOutputSection("stdout", result.stdout),
		formatOutputSection("stderr", result.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

function formatRestackRequiredNoUiOutput(result: BufferedCommandResult): string {
	return [
		`Graphite requires a restack before submission. Run \`gt restack\`, resolve any conflicts, then run /${COMMAND_NAME} again.`,
		"Submission was not attempted.",
		"",
		"$ gt submit -nps --ai --dry-run",
		"",
		formatOutputSection("stdout", result.stdout),
		formatOutputSection("stderr", result.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

function formatRestackConflictOutput(result: BufferedCommandResult, conflictedFiles: string[]): string {
	const fileLines = conflictedFiles.length > 0 ? ["Conflicted files:", ...conflictedFiles.map((file) => `- ${file}`), ""] : [];

	return [
		"`gt restack` hit merge conflicts. Submission was not attempted.",
		"",
		...fileLines,
		`Resolve the conflicts, continue or abort the rebase as appropriate, then run /${COMMAND_NAME} again.`,
		"",
		"$ gt restack --no-interactive",
		"",
		formatOutputSection("stdout", result.stdout),
		formatOutputSection("stderr", result.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

function formatRestackFailureOutput(result: BufferedCommandResult): string {
	const reason = result.startupError
		? `gt restack could not start: ${result.startupError}. Submission was not attempted.`
		: result.killed
			? `gt restack timed out after ${RESTACK_TIMEOUT_MS / 1000}s. Submission was not attempted.`
			: `gt restack --no-interactive failed with exit code ${result.code}. Submission was not attempted.`;

	return [
		reason,
		"",
		"$ gt restack --no-interactive",
		"",
		formatOutputSection("stdout", result.stdout),
		formatOutputSection("stderr", result.stderr),
	]
		.filter(Boolean)
		.join("\n");
}

function formatFailureOutput({
	code,
	killed,
	startupError,
	stdout,
	stderr,
}: {
	code: number;
	killed: boolean;
	startupError: string | undefined;
	stdout: string;
	stderr: string;
}): string {
	const reason =
		startupError ?? (killed ? "gt submit timed out and was killed." : `gt submit -nps --ai failed with exit code ${code}.`);
	return [
		reason,
		"",
		"$ gt submit -nps --ai",
		"",
		formatOutputSection("stdout", stdout),
		formatOutputSection("stderr", stderr),
	]
		.filter(Boolean)
		.join("\n");
}

function formatOutputSection(name: "stdout" | "stderr", output: string): string {
	const body = output.length > 0 ? output.replace(/\r/g, "\n") : "(empty)\n";
	return `----- ${name} -----\n${body}${body.endsWith("\n") ? "" : "\n"}`;
}
