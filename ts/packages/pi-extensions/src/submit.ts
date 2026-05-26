import { spawn } from "node:child_process";

import { truncateDisplayLine } from "./terminal-presentation.ts";

export type NotifyLevel = "info" | "success" | "warning" | "error";

type WidgetPlacement = "aboveEditor" | "belowEditor";

type Theme = {
	fg(color: string, text: string): string;
};

type Component = {
	render(width: number): string[];
	invalidate(): void;
};

type WidgetContent = string[] | ((tui: unknown, theme: Theme) => Component) | undefined;

export type ExtensionCommandContext = {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		confirm(title: string, message: string): Promise<boolean>;
		setWidget(key: string, value: WidgetContent, options?: { placement?: WidgetPlacement }): void;
	};
	waitForIdle(): Promise<void>;
};

export type ExtensionAPI = {
	registerCommand(
		name: string,
		command: {
			description: string;
			handler(args: string, ctx: ExtensionCommandContext): void | Promise<void>;
		},
	): void;
};

const COMMAND_NAME = "submit";
const WIDGET_ID = "submit-output";
const SUBMIT_ARGS = ["submit", "-nps", "--ai"] as const;
const SUBMIT_DRY_RUN_ARGS = ["submit", "-nps", "--ai", "--dry-run"] as const;
const RESTACK_ARGS = ["restack", "--no-interactive"] as const;
const CURRENT_PR_ARGS = ["pr"] as const;
const GIT_UNMERGED_ARGS = ["diff", "--name-only", "--diff-filter=U"] as const;
const GIT_STATUS_PORCELAIN_ARGS = ["status", "--porcelain"] as const;
const SUBMIT_TIMEOUT_MS = 600_000;
const RESTACK_TIMEOUT_MS = 600_000;
const CURRENT_PR_TIMEOUT_MS = 60_000;
const GIT_CHECK_TIMEOUT_MS = 30_000;
const PROGRESS_THROTTLE_MS = 100;
const SUCCESS_OUTPUT_TAIL_MAX_LINES = 20;
const SUCCESS_OUTPUT_TAIL_MAX_CHARS = 2_000;

export type BufferedSubmitCommandResult = {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
	startupError: string | undefined;
};

export type StreamedSubmitCommandResult = {
	code: number;
	killed: boolean;
	startupError: string | undefined;
};

type SubmitCommandOptions = {
	cwd: string;
	timeoutMs: number;
};

type SubmitStreamingCommandOptions = SubmitCommandOptions & {
	onStdout(chunk: string): void;
	onStderr(chunk: string): void;
	onTimedOut?(): void;
};

export type SubmitCommandRunner = {
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
};

export type SubmitDependencies = {
	runner?: SubmitCommandRunner;
};

export default function submitExtension(pi: ExtensionAPI): void {
	submitExtensionWithDependencies(pi);
}

export function submitExtensionWithDependencies(pi: ExtensionAPI, dependencies: SubmitDependencies = {}): void {
	const runner = dependencies.runner ?? createNodeSubmitCommandRunner();

	pi.registerCommand(COMMAND_NAME, {
		description: "Submit the current Graphite stack with gt submit -nps --ai",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();
			ctx.ui.setWidget(WIDGET_ID, undefined);
			const progress = createSubmitProgress(ctx);

			const ready = await ensureStackReadyForSubmit(ctx, progress, runner);
			if (!ready) return;

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

			const stdout = stdoutChunks.join("");
			const stderr = stderrChunks.join("");

			const submitOutput = `${stdout}\n${stderr}`;
			const semanticFailure = detectSubmitSemanticFailure(submitOutput);

			if (result.code === 0 && !result.killed) {
				progress.show("gt pr: verifying current branch…");
				const currentPrCheck = await runner
					.runBuffered("gt", [...CURRENT_PR_ARGS], { cwd: ctx.cwd, timeoutMs: CURRENT_PR_TIMEOUT_MS })
					.finally(() => progress.clear());
				const currentPrFailure = detectCurrentPrFailure(currentPrCheck);

				if (semanticFailure || currentPrFailure) {
					const failureOutput = formatPostSubmitFailureOutput({
						reason: formatPostSubmitFailureReason(semanticFailure, currentPrFailure),
						stdout,
						stderr,
						currentPrCheck,
					});
					ctx.ui.setWidget(WIDGET_ID, failureOutput.split("\n"));
					if (!ctx.hasUI) {
						console.error(failureOutput);
					}
					ctx.ui.notify(failureOutput, "error");
					return;
				}

				const prLinks = extractPrLinks(`${submitOutput}\n${currentPrCheck.stdout}\n${currentPrCheck.stderr}`);
				const successOutput = prLinks.length > 0 ? formatSubmitSuccessText(prLinks) : formatSubmitSuccessFallbackText(stdout, stderr);

				progress.clear();
				if (!ctx.hasUI) {
					console.log(successOutput);
				}
				ctx.ui.notify(formatSubmitSuccessNotification(prLinks), "info");
				return;
			}

			const failureOutput = formatFailureOutput({
				code: result.code,
				killed: result.killed,
				startupError: result.startupError,
				stdout,
				stderr,
			});
			ctx.ui.setWidget(WIDGET_ID, failureOutput.split("\n"));
			if (!ctx.hasUI) {
				console.error(failureOutput);
			}
			ctx.ui.notify(failureOutput, "error");
		},
	});
}

type PrLink = {
	label: string;
	url: string;
};

type BufferedCommandResult = BufferedSubmitCommandResult;

type SubmitProgress = {
	show(line: string): void;
	clear(): void;
};

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
		ctx.ui.notify("Submission cancelled. Run `gt restack` when ready, then /submit again.", "warning");
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

function detectCurrentPrFailure(result: BufferedCommandResult): string | undefined {
	if (result.startupError) {
		return `gt submit exited 0, but current PR verification could not start: ${result.startupError}`;
	}
	if (result.killed) {
		return `gt submit exited 0, but current PR verification timed out after ${CURRENT_PR_TIMEOUT_MS / 1000}s.`;
	}
	if (result.code !== 0) {
		const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
		if (/No PR found/i.test(output)) {
			return "gt submit exited 0, but the current branch still has no PR.";
		}
		return `gt submit exited 0, but current PR verification failed with exit code ${result.code}.`;
	}
	return undefined;
}

function formatPostSubmitFailureReason(semanticFailure: string | undefined, currentPrFailure: string | undefined): string {
	return [semanticFailure, currentPrFailure].filter((line): line is string => Boolean(line)).join("\n");
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
		"Graphite requires a restack before submission. Run `gt restack`, resolve any conflicts, then run /submit again.",
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
		"Resolve the conflicts, continue or abort the rebase as appropriate, then run /submit again.",
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
