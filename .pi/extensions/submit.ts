import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const COMMAND_NAME = "submit";
const STATUS_KEY = "submit";
const WIDGET_ID = "submit-output";
const SUBMIT_ARGS = ["submit", "-nps", "--ai"] as const;
const SUBMIT_TIMEOUT_MS = 600_000;
const STATUS_THROTTLE_MS = 100;
const SUCCESS_OUTPUT_TAIL_MAX_LINES = 20;
const SUCCESS_OUTPUT_TAIL_MAX_CHARS = 2_000;
const CURRENT_PR_ARGS = ["pr"] as const;
const CURRENT_PR_TIMEOUT_MS = 60_000;

export default function submitExtension(pi: ExtensionAPI) {
	pi.registerCommand(COMMAND_NAME, {
		description: "Submit the current Graphite stack with gt submit -nps --ai",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();
			ctx.ui.setWidget(WIDGET_ID, undefined);

			const stdoutChunks: string[] = [];
			const stderrChunks: string[] = [];
			let stdoutRemainder = "";
			let stderrRemainder = "";
			let latestLine = "running…";
			let statusTimer: ReturnType<typeof setTimeout> | undefined;
			let startupError: string | undefined;

			const renderStatus = () => {
				ctx.ui.setStatus(STATUS_KEY, `gt submit: ${latestLine}`);
			};

			const scheduleStatus = () => {
				if (statusTimer) return;
				statusTimer = setTimeout(() => {
					statusTimer = undefined;
					renderStatus();
				}, STATUS_THROTTLE_MS);
			};

			const noteLine = (_source: "stdout" | "stderr", line: string) => {
				const trimmed = line.trim();
				if (!trimmed) return;
				latestLine = trimmed;
				scheduleStatus();
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

			renderStatus();

			const result = await new Promise<{ code: number; killed: boolean }>((resolve) => {
				const child = spawn("gt", [...SUBMIT_ARGS], {
					cwd: ctx.cwd,
					stdio: ["ignore", "pipe", "pipe"],
				});

				let killed = false;
				let settled = false;
				let timeoutId: ReturnType<typeof setTimeout> | undefined;
				let forceKillTimeoutId: ReturnType<typeof setTimeout> | undefined;

				const finish = (code: number | null) => {
					if (settled) return;
					settled = true;
					if (timeoutId) clearTimeout(timeoutId);
					if (forceKillTimeoutId) clearTimeout(forceKillTimeoutId);
					resolve({ code: code ?? (killed ? 1 : 0), killed });
				};

				const killProcess = () => {
					if (killed) return;
					killed = true;
					latestLine = `timed out after ${SUBMIT_TIMEOUT_MS / 1000}s; sent SIGTERM`;
					scheduleStatus();
					child.kill("SIGTERM");
					forceKillTimeoutId = setTimeout(() => {
						if (!settled) {
							child.kill("SIGKILL");
						}
					}, 5000);
				};

				timeoutId = setTimeout(killProcess, SUBMIT_TIMEOUT_MS);

				child.stdout.on("data", (chunk) => appendOutput("stdout", chunk.toString()));
				child.stderr.on("data", (chunk) => appendOutput("stderr", chunk.toString()));
				child.on("error", (error) => {
					startupError = error.message;
					noteLine("stderr", error.message);
					finish(1);
				});
				child.on("close", (code) => finish(code));
			});

			if (statusTimer) {
				clearTimeout(statusTimer);
				statusTimer = undefined;
			}
			flushRemainders();
			if (statusTimer) {
				clearTimeout(statusTimer);
				statusTimer = undefined;
			}
			ctx.ui.setStatus(STATUS_KEY, undefined);

			const stdout = stdoutChunks.join("");
			const stderr = stderrChunks.join("");

			const submitOutput = `${stdout}\n${stderr}`;
			const semanticFailure = detectSubmitSemanticFailure(submitOutput);

			if (result.code === 0 && !result.killed) {
				ctx.ui.setStatus(STATUS_KEY, "gt pr: verifying current branch…");
				const currentPrCheck = await runBufferedCommand("gt", [...CURRENT_PR_ARGS], ctx.cwd, CURRENT_PR_TIMEOUT_MS).finally(
					() => ctx.ui.setStatus(STATUS_KEY, undefined),
				);
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

				if (!ctx.hasUI) {
					console.log(successOutput);
				}
				ctx.ui.notify(formatSubmitSuccessNotification(prLinks), "info");
				return;
			}

			const failureOutput = formatFailureOutput({
				code: result.code,
				killed: result.killed,
				startupError,
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

type BufferedCommandResult = {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
	startupError: string | undefined;
};

function runBufferedCommand(command: string, args: readonly string[], cwd: string, timeoutMs: number): Promise<BufferedCommandResult> {
	return new Promise((resolve) => {
		const stdoutChunks: string[] = [];
		const stderrChunks: string[] = [];
		let killed = false;
		let settled = false;
		let startupError: string | undefined;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		let forceKillTimeoutId: ReturnType<typeof setTimeout> | undefined;

		const child = spawn(command, [...args], {
			cwd,
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
		}, timeoutMs);

		child.stdout.on("data", (chunk) => stdoutChunks.push(chunk.toString()));
		child.stderr.on("data", (chunk) => stderrChunks.push(chunk.toString()));
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
