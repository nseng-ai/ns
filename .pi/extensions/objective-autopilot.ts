import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

// Project-local Pi adapters are imported directly by Node from .pi/extensions, where workspace
// package exports are not resolvable without the ts workspace's node_modules ancestry. Match the
// rest of .pi/extensions and reach into the ts workspace by relative path instead of bare specifier.
import {
	createRunnerSubagentJsonEventParser,
	runnerSubagentPrimaryActivityPreview,
	type RunnerSubagentJsonEventParserSnapshot,
} from "../../ts/packages/local-pi-tools/runner-subagents/src/index.ts";
import { resolvePiInvocation } from "../../ts/packages/local-pi-tools/runner-subagents/src/subagent-process.ts";
import { normalizeExecResult, type ExecResult, type PiExecResultLike } from "../../ts/packages/infra/exec/src/index.ts";
import {
	sendCommandProgressOrNotify,
	registerCommandWithImmediateAck,
} from "../../ts/packages/hosts/pi/src/commands/ack.ts";

const COMMAND_NAME = "objective:autopilot";
const STATUS_KEY = "objective-autopilot";
const REPORT_BEGIN = "OBJECTIVE_AUTOPILOT_REPORT_BEGIN";
const REPORT_END = "OBJECTIVE_AUTOPILOT_REPORT_END";
const MAX_FAILURE_TAIL_CHARS = 8_000;
const MAX_WIDGET_LINE_CHARS = 240;

type NotifyLevel = "info" | "warning" | "error";

interface CommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
		setWidget?(key: string, lines: string[] | undefined): void;
	};
	waitForIdle(): Promise<void>;
}

interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<PiExecResultLike>;
	sendUserMessage?(content: string): void;
}

interface ParsedArgs {
	objective: string;
	iterations: number;
	shouldSubmit: boolean;
	isDryRun: boolean;
	model?: string;
}

interface ChildResult {
	exitCode: number;
	finalText: string;
	stderr: string;
	stopReason?: string;
}

interface ChildProgressUpdate {
	iteration: number;
	totalIterations: number;
	objective: string;
	snapshot: RunnerSubagentJsonEventParserSnapshot;
	stderrTail?: string;
}

interface Report {
	status?: string;
	objective?: string;
	branch?: string;
	parentBranch?: string;
	planPath?: string;
	branchContext?: string;
	recommendedSlice?: string;
	commitMessage?: string;
	prTitle?: string;
	prBodySummary?: string;
	stopReason?: string;
	changedFiles: string[];
	validation: string[];
	objectiveTracking: string[];
}

interface ExecCheckedOptions {
	pi: ExtensionAPI;
	ctx: CommandContext;
	command: string;
	args: string[];
}

interface VerifyAfterChildOptions {
	pi: ExtensionAPI;
	ctx: CommandContext;
	report: Report;
	startingBranch: string;
}

interface CommitAndMaybeSubmitOptions {
	pi: ExtensionAPI;
	ctx: CommandContext;
	report: Report;
	changedFiles: string[];
	shouldSubmit: boolean;
}

interface SendSummaryOptions {
	pi: ExtensionAPI;
	ctx: CommandContext;
	text: string;
	level?: NotifyLevel;
}

class UsageError extends Error {}

function usage(): string {
	return [
		"Usage: /objective:autopilot <objective-slug-or-path> [--iterations N] [--submit] [--dry-run] [--model provider/model]",
		"",
		"Runs up to N fresh-child Objective iterations. The parent verifies live repo state and owns commit/submit.",
		"Default iterations: 1. Submission requires --submit. --dry-run never commits or submits.",
	].join("\n");
}

function parseArgs(raw: string): ParsedArgs {
	const tokens = raw.trim().split(/\s+/).filter(Boolean);
	let objective: string | undefined;
	let iterations = 1;
	let shouldSubmit = false;
	let isDryRun = false;
	let model: string | undefined;

	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index];
		if (token === "--iterations") {
			const value = tokens[++index];
			if (!value || !/^\d+$/.test(value)) throw new UsageError("--iterations requires a positive integer.");
			iterations = Number(value);
			if (iterations < 1) throw new UsageError("--iterations must be at least 1.");
		} else if (token === "--submit") {
			shouldSubmit = true;
		} else if (token === "--dry-run") {
			isDryRun = true;
		} else if (token === "--model") {
			model = tokens[++index];
			if (!model) throw new UsageError("--model requires a provider/model value.");
		} else if (token.startsWith("--")) {
			throw new UsageError(`Unknown flag: ${token}`);
		} else if (!objective) {
			objective = token;
		} else {
			throw new UsageError(`Unexpected extra argument: ${token}`);
		}
	}

	if (!objective) throw new UsageError("Missing objective slug or path.");
	return model === undefined
		? { objective, iterations, shouldSubmit, isDryRun }
		: { objective, iterations, shouldSubmit, isDryRun, model };
}

function trimOutput(result: ExecResult): string {
	return [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
}

async function execChecked(options: ExecCheckedOptions): Promise<string> {
	const { pi, ctx, command, args } = options;
	const result = normalizeExecResult(await pi.exec(command, args, { cwd: ctx.cwd }));
	if (result.code !== 0 || result.killed) {
		throw new Error(`Command failed: ${command} ${args.join(" ")}\n${trimOutput(result)}`);
	}
	return result.stdout.trim();
}

async function git(pi: ExtensionAPI, ctx: CommandContext, args: string[]): Promise<string> {
	return execChecked({ pi, ctx, command: "git", args });
}

function objectiveDirectory(objective: string): string {
	if (objective.startsWith(".sdl/objectives/")) return objective;
	return path.join(".sdl", "objectives", objective);
}

async function assertInitialGuards(pi: ExtensionAPI, ctx: CommandContext, objective: string): Promise<string> {
	await git(pi, ctx, ["rev-parse", "--show-toplevel"]);
	const dirty = await git(pi, ctx, ["status", "--short"]);
	if (dirty) throw new Error(`Worktree is dirty before autopilot starts:\n${dirty}`);

	const objectivePath = path.resolve(ctx.cwd, objectiveDirectory(objective));
	const relativeObjectivePath = path.relative(ctx.cwd, objectivePath);
	if (relativeObjectivePath.startsWith("..") || path.isAbsolute(relativeObjectivePath)) {
		throw new Error(`Objective path is outside the repository: ${objective}`);
	}
	try {
		await fs.stat(objectivePath);
	} catch {
		throw new Error(`Objective not found: ${objectiveDirectory(objective)}`);
	}
	try {
		await fs.stat(path.join(objectivePath, "closed.md"));
		throw new Error(`Objective is closed: ${objective}`);
	} catch (error) {
		if (error instanceof Error && !error.message.includes("ENOENT")) throw error;
	}

	return git(pi, ctx, ["branch", "--show-current"]);
}

async function writePromptFile(prompt: string): Promise<{ dir: string; file: string }> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "objective-autopilot-"));
	const file = path.join(dir, "child-prompt.md");
	await fs.writeFile(file, prompt, { encoding: "utf8", mode: 0o600 });
	return { dir, file };
}

async function runChild(
	cwd: string,
	prompt: string,
	model: string | undefined,
	onProgress?: (snapshot: RunnerSubagentJsonEventParserSnapshot, stderrTail?: string) => void,
): Promise<ChildResult> {
	const tmp = await writePromptFile(prompt);
	// Keep custom spawn semantics for JSON streaming with --no-session and an appended system prompt.
	// Shared runner-subagents pieces cover Pi resolution and event parsing; the full dispatcher owns richer session/runtime behavior.
	const args = ["--mode", "json", "-p", "--no-session", "--append-system-prompt", tmp.file];
	if (model) args.push("--model", model);
	args.push("Run the objective-autopilot child task described in your appended system prompt.");

	let stderr = "";
	try {
		return await new Promise<ChildResult>((resolve) => {
			const parser = createRunnerSubagentJsonEventParser({ title: "objective-autopilot child" });
			const invocation = resolvePiInvocation(args);
			const child = spawn(invocation.command, invocation.args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
			let buffer = "";
			const emitProgress = (stderrTail?: string) => onProgress?.(parser.getSnapshot(), stderrTail);
			const processLine = (line: string) => {
				if (!line.trim()) return;
				try {
					JSON.parse(line);
				} catch {
					// Preserve the previous tolerance for malformed streaming lines while reusing the shared parser for valid Pi events.
					return;
				}
				parser.pushChunk(`${line}\n`);
				emitProgress();
			};
			child.stdout.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) processLine(line);
			});
			child.stderr.on("data", (data) => {
				stderr += data.toString();
				emitProgress(tail(stderr));
			});
			child.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				parser.finish();
				const snapshot = parser.getSnapshot();
				emitProgress();
				resolve({
					exitCode: code ?? 0,
					finalText: snapshot.finalAssistantText ?? "",
					stderr,
					...(snapshot.stopReason === undefined ? {} : { stopReason: snapshot.stopReason }),
				});
			});
			child.on("error", (error) => {
				stderr += error.message;
				parser.finish();
				const snapshot = parser.getSnapshot();
				emitProgress(tail(stderr));
				resolve({
					exitCode: 1,
					finalText: snapshot.finalAssistantText ?? "",
					stderr,
					...(snapshot.stopReason === undefined ? {} : { stopReason: snapshot.stopReason }),
				});
			});
		});
	} finally {
		await fs.rm(tmp.dir, { recursive: true, force: true });
	}
}

function buildChildPrompt(args: ParsedArgs, iteration: number, parentBranch: string): string {
	return `You are a fresh child Pi process for /objective:autopilot iteration ${iteration}/${args.iterations}.

Objective: ${args.objective}
Parent branch at iteration start: ${parentBranch}

Rules:
- Operate only in the current repository/worktree.
- Do exactly one coherent Objective slice.
- First load and follow the objective-next workflow for the explicit Objective above. Run objective-next for this Objective; do not auto-select a different Objective.
- If objective-next stops, asks for a human, finds no substantive work, or says ready-to-close, stop and report status: stop.
- Before implementation, create a saved implementation plan and branch-context-backed implementation branch using the repo's branch-context workflows.
- Implement the attached plan on the implementation branch.
- Validate according to repo/churn policy, and run relevant checks for changed files.
- Update Objective tracking with a meaningful Semantic Update when material progress is kept.
- Leave changes uncommitted. Do not commit, submit PRs, push, merge, publish, deploy, or mutate external systems.
- Keep your final response concise and include exactly one report block in this format:

${REPORT_BEGIN}
status: ready-for-parent-commit | stop | failed
objective: ${args.objective}
branch: <current branch>
parentBranch: ${parentBranch}
planPath: <saved plan path or unknown>
branchContext: <attached branch-context key/slug or unknown>
recommendedSlice: <one-line summary>
changedFiles:
- <path>
validation:
- <command>: passed|failed|skipped <short reason>
objectiveTracking:
- <path/update summary>
commitMessage: <suggested commit subject>
prTitle: <suggested PR title>
prBodySummary: <short markdown-safe summary>
stopReason: <if status != ready-for-parent-commit>
${REPORT_END}`;
}

function parseReport(text: string): Report | undefined {
	const start = text.indexOf(REPORT_BEGIN);
	const end = text.indexOf(REPORT_END);
	if (start < 0 || end <= start) return undefined;
	const body = text.slice(start + REPORT_BEGIN.length, end).trim();
	const report: Report = { changedFiles: [], validation: [], objectiveTracking: [] };
	let list: "changedFiles" | "validation" | "objectiveTracking" | undefined;
	for (const line of body.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (trimmed === "changedFiles:") list = "changedFiles";
		else if (trimmed === "validation:") list = "validation";
		else if (trimmed === "objectiveTracking:") list = "objectiveTracking";
		else if (trimmed.startsWith("- ") && list) report[list].push(trimmed.slice(2));
		else {
			list = undefined;
			const colon = trimmed.indexOf(":");
			if (colon > 0) {
				const key = trimmed.slice(0, colon) as keyof Report;
				const value = trimmed.slice(colon + 1).trim();
				if (key !== "changedFiles" && key !== "validation" && key !== "objectiveTracking") {
					(report as Record<string, unknown>)[key] = value;
				}
			}
		}
	}
	return report;
}

async function verifyAfterChild(options: VerifyAfterChildOptions): Promise<string[]> {
	const { pi, ctx, report, startingBranch } = options;
	if (report.status !== "ready-for-parent-commit") throw new Error(`Child stopped: ${report.stopReason ?? report.status ?? "unknown"}`);
	const status = await git(pi, ctx, ["status", "--short"]);
	if (!status) throw new Error("Child reported ready, but git status is clean.");
	const currentBranch = await git(pi, ctx, ["branch", "--show-current"]);
	if (currentBranch === "main" || currentBranch === "master") throw new Error(`Refusing to commit on ${currentBranch}.`);
	if (report.branch && report.branch !== "unknown" && report.branch !== currentBranch) {
		throw new Error(`Report branch ${report.branch} does not match current branch ${currentBranch}.`);
	}
	if (currentBranch === startingBranch) throw new Error("Implementation did not move to a branch distinct from the starting branch.");
	await execChecked({ pi, ctx, command: "gt", args: ["branch", "info"] });
	await execChecked({ pi, ctx, command: "git", args: ["diff", "--check"] });
	const changedFiles = status.split("\n").map((line) => line.slice(3).trim()).filter(Boolean);
	const nonObjectiveChanges = changedFiles.some((file) => !file.startsWith(".sdl/objectives/"));
	if (nonObjectiveChanges && report.objectiveTracking.length === 0) {
		throw new Error("Material changes were made, but the report contains no Objective tracking evidence.");
	}
	return changedFiles;
}

function usableReportText(value: string | undefined): string | undefined {
	if (value === undefined || value === "" || value === "unknown") return undefined;
	return value;
}

function firstNonEmptyText(...values: Array<string | undefined>): string | undefined {
	return values.find((value) => value !== undefined && value !== "");
}

function submitSummary(submitOutput: string | undefined): string {
	return firstNonEmptyText(submitOutput?.split("\n").find((line) => line.includes("http")), "submitted") ?? "submitted";
}

async function commitAndMaybeSubmit(options: CommitAndMaybeSubmitOptions): Promise<{ commitOutput: string; submitOutput?: string }> {
	const { pi, ctx, report, changedFiles, shouldSubmit } = options;
	await execChecked({ pi, ctx, command: "git", args: ["add", "--", ...changedFiles] });
	const message = usableReportText(report.commitMessage) ?? usableReportText(report.recommendedSlice) ?? "Objective autopilot update";
	let commitOutput: string;
	try {
		commitOutput = await execChecked({ pi, ctx, command: "gt", args: ["modify", "-m", message] });
	} catch {
		commitOutput = await execChecked({ pi, ctx, command: "git", args: ["commit", "-m", message] });
	}
	if (!shouldSubmit) return { commitOutput };
	const submitOutput = await execChecked({ pi, ctx, command: "gt", args: ["submit", "--no-interactive"] });
	return { commitOutput, submitOutput };
}

function sendSummary(options: SendSummaryOptions): void {
	const { pi, ctx, text, level = "info" } = options;
	if (pi.sendUserMessage) pi.sendUserMessage(text);
	else if (ctx.hasUI) ctx.ui.notify(text, level);
}

function tail(text: string): string {
	return text.length <= MAX_FAILURE_TAIL_CHARS ? text : text.slice(text.length - MAX_FAILURE_TAIL_CHARS);
}

function formatElapsed(elapsedMs: number): string {
	if (elapsedMs < 1_000) return `${elapsedMs}ms`;
	return `${(elapsedMs / 1_000).toFixed(1)}s`;
}

function compactWidgetText(text: string): string {
	const compacted = text.replace(/\s+/g, " ").trim();
	if (compacted.length <= MAX_WIDGET_LINE_CHARS) return compacted;
	return `${compacted.slice(0, MAX_WIDGET_LINE_CHARS - 1)}…`;
}

function formatChildProgressStatus(update: ChildProgressUpdate): string {
	const { progress } = update.snapshot;
	const tool = progress.currentTool === undefined ? "" : `, tool ${progress.currentTool}`;
	return `child iteration ${update.iteration}/${update.totalIterations}: turn ${progress.turnCount}, tools ${progress.toolCount}${tool}…`;
}

function formatChildProgressWidgetLines(update: ChildProgressUpdate): string[] {
	const { progress, activity } = update.snapshot;
	const lines = [
		`/objective:autopilot ${update.iteration}/${update.totalIterations}`,
		`objective: ${update.objective}`,
		`child: ${progress.state}; turns/tools: ${progress.turnCount}/${progress.toolCount}; elapsed: ${formatElapsed(progress.elapsedMs)}`,
	];
	if (progress.currentTool !== undefined) lines.push(`current tool: ${progress.currentTool}`);
	const preview = runnerSubagentPrimaryActivityPreview(activity);
	if (preview !== undefined) lines.push(`activity: ${preview}`);
	if (activity.lastToolName !== undefined) {
		const prefix = activity.lastToolResultIsError ? "last tool error" : "last tool";
		lines.push(`${prefix}: ${activity.lastToolName}`);
	}
	if (activity.lastToolResultPreview !== undefined) lines.push(`last result: ${activity.lastToolResultPreview}`);
	if (update.stderrTail !== undefined && update.stderrTail.trim() !== "") lines.push(`stderr: ${compactWidgetText(update.stderrTail)}`);
	return lines;
}

function showChildProgress(ctx: CommandContext, update: ChildProgressUpdate): void {
	ctx.ui.setStatus(STATUS_KEY, formatChildProgressStatus(update));
	ctx.ui.setWidget?.(STATUS_KEY, formatChildProgressWidgetLines(update));
}

async function runAutopilot(pi: ExtensionAPI, rawArgs: string, ctx: CommandContext): Promise<void> {
	let args: ParsedArgs;
	try {
		args = parseArgs(rawArgs);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		sendSummary({ pi, ctx, text: `${message}\n\n${usage()}`, level: "error" });
		return;
	}

	sendCommandProgressOrNotify({ host: pi, ctx, message: "Checking repository for /objective:autopilot…" });
	await ctx.waitForIdle();
	ctx.ui.setStatus(STATUS_KEY, "checking repository…");
	try {
		let startingBranch = await assertInitialGuards(pi, ctx, args.objective);
		const summaries: string[] = [];
		for (let iteration = 1; iteration <= args.iterations; iteration++) {
			sendCommandProgressOrNotify({
				host: pi,
				ctx,
				message: `Starting objective-autopilot child iteration ${iteration}/${args.iterations}…`,
			});
			ctx.ui.setStatus(STATUS_KEY, `child iteration ${iteration}/${args.iterations}…`);
			ctx.ui.setWidget?.(STATUS_KEY, [`/objective:autopilot ${iteration}/${args.iterations}`, `objective: ${args.objective}`, "child: starting…"]);
			const child = await runChild(ctx.cwd, buildChildPrompt(args, iteration, startingBranch), args.model, (snapshot, stderrTail) => {
				showChildProgress(ctx, {
					iteration,
					totalIterations: args.iterations,
					objective: args.objective,
					snapshot,
					...(stderrTail === undefined ? {} : { stderrTail }),
				});
			});
			if (child.exitCode !== 0) throw new Error(`Child Pi exited ${child.exitCode}.\n${tail(firstNonEmptyText(child.stderr, child.finalText) ?? "")}`);
			const report = parseReport(child.finalText);
			if (!report) throw new Error(`Child did not produce a parseable report. Tail:\n${tail(firstNonEmptyText(child.finalText, child.stderr) ?? "")}`);
			if (report.status === "stop") {
				summaries.push(`iteration ${iteration}: stopped (${usableReportText(report.stopReason) ?? "child requested stop"}).`);
				break;
			}
			const changedFiles = await verifyAfterChild({ pi, ctx, report, startingBranch });
			if (args.isDryRun) {
				summaries.push(`iteration ${iteration}: verified dry-run on ${report.branch}; ${changedFiles.length} changed file(s).`);
				break;
			}
			const commit = await commitAndMaybeSubmit({ pi, ctx, report, changedFiles, shouldSubmit: args.shouldSubmit });
			summaries.push([
				`iteration ${iteration}: ${usableReportText(report.recommendedSlice) ?? "completed slice"}`,
				`- branch: ${report.branch}`,
				`- changed files: ${changedFiles.length}`,
				`- commit: ${firstNonEmptyText(commit.commitOutput.split("\n")[0], "created") ?? "created"}`,
				args.shouldSubmit
					? `- submit: ${submitSummary(commit.submitOutput)}`
					: "- submit: skipped (no --submit)",
			].join("\n"));
			const postStatus = await git(pi, ctx, ["status", "--short"]);
			if (postStatus) throw new Error(`Worktree is dirty after commit/submit:\n${postStatus}`);
			startingBranch = await git(pi, ctx, ["branch", "--show-current"]);
		}
		sendSummary({ pi, ctx, text: [`/objective:autopilot complete`, ...summaries].join("\n\n") });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		sendSummary({ pi, ctx, text: `/objective:autopilot stopped.\n\n${message}`, level: "error" });
	} finally {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		ctx.ui.setWidget?.(STATUS_KEY, undefined);
	}
}

export default function objectiveAutopilotExtension(pi: ExtensionAPI): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description: "Run bounded fresh-child Objective autopilot iterations with parent verification and Graphite submit.",
			handler: async (args, ctx) => runAutopilot(pi, args, ctx),
		},
	});
}
