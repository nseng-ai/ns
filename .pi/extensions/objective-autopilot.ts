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
		setWidget?(
			key: string,
			lines: string[] | undefined,
			options?: { placement?: "aboveEditor" | "belowEditor" },
		): void;
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
	requestedModel?: string;
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
	recoveryNotes: string[];
}

interface RepoChangeFacts {
	rawStatus: string;
	changedFiles: string[];
	hasChanges: boolean;
}

interface StageChangedFilesResult {
	stagedFiles: string[];
	recoveryNotes: string[];
}

interface CommandFailureDetails {
	command: string;
	output: string;
}

interface PhaseErrorDetails {
	changedFiles?: string[];
	stagedFiles?: string[];
	recoveryNotes?: string[];
	command?: string;
}

interface SendSummaryOptions {
	pi: ExtensionAPI;
	ctx: CommandContext;
	text: string;
	level?: NotifyLevel;
}

class UsageError extends Error {}

class AutopilotPhaseError extends Error {
	readonly phase: string;
	readonly details: PhaseErrorDetails | undefined;

	constructor(phase: string, message: string, details?: PhaseErrorDetails) {
		super(message);
		this.phase = phase;
		this.details = details;
	}
}

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

function commandText(command: string, args: readonly string[]): string {
	return [command, ...args].join(" ");
}

function commandFailure(command: string, args: readonly string[], result: ExecResult): CommandFailureDetails {
	return {
		command: commandText(command, args),
		output: trimOutput(result),
	};
}

async function execCheckedRaw(options: ExecCheckedOptions): Promise<string> {
	const { pi, ctx, command, args } = options;
	const result = normalizeExecResult(await pi.exec(command, args, { cwd: ctx.cwd }));
	if (result.code !== 0 || result.killed) {
		const failure = commandFailure(command, args, result);
		throw new Error(`Command failed: ${failure.command}\n${failure.output}`);
	}
	return result.stdout;
}

async function execChecked(options: ExecCheckedOptions): Promise<string> {
	return (await execCheckedRaw(options)).trim();
}

async function execResult(options: ExecCheckedOptions): Promise<ExecResult> {
	const { pi, ctx, command, args } = options;
	return normalizeExecResult(await pi.exec(command, args, { cwd: ctx.cwd }));
}

async function git(pi: ExtensionAPI, ctx: CommandContext, args: string[]): Promise<string> {
	return execChecked({ pi, ctx, command: "git", args });
}

async function gitRaw(pi: ExtensionAPI, ctx: CommandContext, args: string[]): Promise<string> {
	return execCheckedRaw({ pi, ctx, command: "git", args });
}

function parseGitStatusPaths(rawStatus: string): string[] {
	const paths: string[] = [];
	const seen = new Set<string>();
	for (const line of rawStatus.split(/\r?\n/)) {
		if (line === "") continue;
		if (line.length < 4 || line[2] !== " ") {
			throw new Error(`Malformed git porcelain status line: ${JSON.stringify(line)}`);
		}
		const status = line.slice(0, 2);
		const payload = line.slice(3);
		if (payload === "") throw new Error(`Malformed git porcelain status line: ${JSON.stringify(line)}`);
		const isRenameOrCopy = status.includes("R") || status.includes("C");
		const pathspec = isRenameOrCopy && payload.includes(" -> ")
			? payload.slice(payload.lastIndexOf(" -> ") + " -> ".length)
			: payload;
		if (!seen.has(pathspec)) {
			seen.add(pathspec);
			paths.push(pathspec);
		}
	}
	return paths;
}

async function collectRepoChangeFacts(pi: ExtensionAPI, ctx: CommandContext): Promise<RepoChangeFacts> {
	const rawStatus = await gitRaw(pi, ctx, ["status", "--porcelain=v1"]);
	const changedFiles = parseGitStatusPaths(rawStatus);
	return { rawStatus, changedFiles, hasChanges: changedFiles.length > 0 };
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function objectiveDirectory(objective: string): string {
	if (objective.startsWith(".sdl/objectives/")) return objective;
	return path.join(".sdl", "objectives", objective);
}

async function assertInitialGuards(pi: ExtensionAPI, ctx: CommandContext, objective: string): Promise<string> {
	await git(pi, ctx, ["rev-parse", "--show-toplevel"]);
	const dirty = await gitRaw(pi, ctx, ["status", "--porcelain=v1"]);
	if (parseGitStatusPaths(dirty).length > 0) throw new Error(`Worktree is dirty before autopilot starts:\n${dirty}`);

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
- List changed files as a best-effort summary only; the parent independently inspects git status and owns staging/commit.
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

async function verifyAfterChild(options: VerifyAfterChildOptions): Promise<RepoChangeFacts> {
	const { pi, ctx, report, startingBranch } = options;
	if (report.status !== "ready-for-parent-commit") {
		throw new AutopilotPhaseError("verification", `Child stopped: ${report.stopReason ?? report.status ?? "unknown"}`);
	}
	const facts = await collectRepoChangeFacts(pi, ctx);
	if (!facts.hasChanges) throw new AutopilotPhaseError("verification", "Child reported ready, but git status is clean.");
	const currentBranch = await git(pi, ctx, ["branch", "--show-current"]);
	if (currentBranch === "main" || currentBranch === "master") {
		throw new AutopilotPhaseError("verification", `Refusing to commit on ${currentBranch}.`, {
			changedFiles: facts.changedFiles,
		});
	}
	if (report.branch && report.branch !== "unknown" && report.branch !== currentBranch) {
		throw new AutopilotPhaseError("verification", `Report branch ${report.branch} does not match current branch ${currentBranch}.`, {
			changedFiles: facts.changedFiles,
		});
	}
	if (currentBranch === startingBranch) {
		throw new AutopilotPhaseError("verification", "Implementation did not move to a branch distinct from the starting branch.", {
			changedFiles: facts.changedFiles,
		});
	}
	try {
		await execChecked({ pi, ctx, command: "gt", args: ["branch", "info"] });
		await execChecked({ pi, ctx, command: "git", args: ["diff", "--check"] });
	} catch (error) {
		throw new AutopilotPhaseError("verification", error instanceof Error ? error.message : String(error), {
			changedFiles: facts.changedFiles,
		});
	}
	const nonObjectiveChanges = facts.changedFiles.some((file) => !file.startsWith(".sdl/objectives/"));
	if (nonObjectiveChanges && report.objectiveTracking.length === 0) {
		throw new AutopilotPhaseError("verification", "Material changes were made, but the report contains no Objective tracking evidence.", {
			changedFiles: facts.changedFiles,
		});
	}
	return facts;
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

async function runJustFormatterRecoveryIfNeeded(
	pi: ExtensionAPI,
	ctx: CommandContext,
	changedFiles: readonly string[],
): Promise<string[]> {
	if (!changedFiles.some((file) => file.endsWith(".ts") || file.endsWith(".tsx"))) return [];
	const checkArgs = ["ts-format-check"];
	const check = await execResult({ pi, ctx, command: "just", args: checkArgs });
	if (check.code === 0 && !check.killed) return [];

	const fixArgs = ["ts-format-fix"];
	const fix = await execResult({ pi, ctx, command: "just", args: fixArgs });
	if (fix.code !== 0 || fix.killed) {
		const failure = commandFailure("just", fixArgs, fix);
		throw new AutopilotPhaseError("formatter recovery", `Formatter autofix failed.\n${failure.output}`, {
			changedFiles: [...changedFiles],
			command: failure.command,
		});
	}
	const rerun = await execResult({ pi, ctx, command: "just", args: checkArgs });
	if (rerun.code !== 0 || rerun.killed) {
		const failure = commandFailure("just", checkArgs, rerun);
		throw new AutopilotPhaseError("formatter recovery", `Formatter check still fails after autofix.\n${failure.output}`, {
			changedFiles: [...changedFiles],
			command: failure.command,
			recoveryNotes: ["ran just ts-format-fix after just ts-format-check failed"],
		});
	}
	return ["ran just ts-format-fix after just ts-format-check failed"];
}

async function stageChangedFiles(pi: ExtensionAPI, ctx: CommandContext, changedFiles: readonly string[]): Promise<StageChangedFilesResult> {
	if (changedFiles.length === 0) throw new AutopilotPhaseError("staging", "No changed files to stage.");
	const first = await execResult({ pi, ctx, command: "git", args: ["add", "--", ...changedFiles] });
	if (first.code === 0 && !first.killed) return { stagedFiles: [...changedFiles], recoveryNotes: [] };

	const freshFacts = await collectRepoChangeFacts(pi, ctx);
	if (freshFacts.changedFiles.length === 0 || sameStringList(changedFiles, freshFacts.changedFiles)) {
		const failure = commandFailure("git", ["add", "--", ...changedFiles], first);
		throw new AutopilotPhaseError("staging", `Unable to stage changed files.\n${failure.output}`, {
			changedFiles: [...changedFiles],
			command: failure.command,
		});
	}

	const retry = await execResult({ pi, ctx, command: "git", args: ["add", "--", ...freshFacts.changedFiles] });
	if (retry.code === 0 && !retry.killed) {
		return {
			stagedFiles: [...freshFacts.changedFiles],
			recoveryNotes: ["refreshed changed-file list from git status after staging failed"],
		};
	}
	const failure = commandFailure("git", ["add", "--", ...freshFacts.changedFiles], retry);
	throw new AutopilotPhaseError("staging", `Unable to stage changed files after refreshing git status.\n${failure.output}`, {
		changedFiles: freshFacts.changedFiles,
		command: failure.command,
		recoveryNotes: ["refreshed changed-file list from git status after staging failed"],
	});
}

async function commitAndMaybeSubmit(options: CommitAndMaybeSubmitOptions): Promise<{ commitOutput: string; submitOutput?: string; recoveryNotes: string[] }> {
	const { pi, ctx, report, changedFiles, shouldSubmit } = options;
	const stage = await stageChangedFiles(pi, ctx, changedFiles);
	const recoveryNotes = [...options.recoveryNotes, ...stage.recoveryNotes];
	const message = usableReportText(report.commitMessage) ?? usableReportText(report.recommendedSlice) ?? "Objective autopilot update";
	let commitOutput: string;
	try {
		commitOutput = await execChecked({ pi, ctx, command: "gt", args: ["modify", "-m", message] });
	} catch {
		try {
			commitOutput = await execChecked({ pi, ctx, command: "git", args: ["commit", "-m", message] });
		} catch (error) {
			throw new AutopilotPhaseError("commit", error instanceof Error ? error.message : String(error), {
				changedFiles: [...changedFiles],
				stagedFiles: stage.stagedFiles,
				recoveryNotes,
			});
		}
	}
	if (!shouldSubmit) return { commitOutput, recoveryNotes };
	try {
		const submitOutput = await execChecked({ pi, ctx, command: "gt", args: ["submit", "--no-interactive"] });
		return { commitOutput, submitOutput, recoveryNotes };
	} catch (error) {
		throw new AutopilotPhaseError("submit", error instanceof Error ? error.message : String(error), {
			changedFiles: [...changedFiles],
			stagedFiles: stage.stagedFiles,
			recoveryNotes,
		});
	}
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
		"child process: subagent",
		`model: ${formatChildModel(update)}`,
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

function formatChildModel(update: ChildProgressUpdate): string {
	const launch = update.snapshot.progress.launch;
	if (launch?.model !== undefined) return `${launch.model.provider}/${launch.model.id}`;
	if (launch?.requestedModel !== undefined) return `requested ${launch.requestedModel}`;
	if (update.requestedModel !== undefined) return `requested ${update.requestedModel}`;
	return "pending";
}

function showChildProgress(ctx: CommandContext, update: ChildProgressUpdate): void {
	ctx.ui.setStatus(STATUS_KEY, formatChildProgressStatus(update));
	ctx.ui.setWidget?.(STATUS_KEY, formatChildProgressWidgetLines(update), { placement: "aboveEditor" });
}

function formatList(title: string, values: readonly string[]): string[] {
	if (values.length === 0) return [`- ${title}: none`];
	return [`- ${title}:`, ...values.map((value) => `  - ${value}`)];
}

async function currentBranchForFailure(pi: ExtensionAPI, ctx: CommandContext): Promise<string | undefined> {
	try {
		return await git(pi, ctx, ["branch", "--show-current"]);
	} catch {
		return undefined;
	}
}

async function stagedFilesForFailure(pi: ExtensionAPI, ctx: CommandContext): Promise<string[]> {
	try {
		const raw = await gitRaw(pi, ctx, ["diff", "--cached", "--name-only"]);
		return raw.split(/\r?\n/).filter((line) => line !== "");
	} catch {
		return [];
	}
}

async function changedFilesForFailure(pi: ExtensionAPI, ctx: CommandContext): Promise<string[]> {
	try {
		return (await collectRepoChangeFacts(pi, ctx)).changedFiles;
	} catch {
		return [];
	}
}

async function formatAutopilotFailure(pi: ExtensionAPI, ctx: CommandContext, error: unknown): Promise<string> {
	const message = error instanceof Error ? error.message : String(error);
	const phase = error instanceof AutopilotPhaseError ? error.phase : "unknown";
	const details = error instanceof AutopilotPhaseError ? error.details : undefined;
	const branch = await currentBranchForFailure(pi, ctx);
	const changedFiles = details?.changedFiles ?? (await changedFilesForFailure(pi, ctx));
	const stagedFiles = details?.stagedFiles ?? (await stagedFilesForFailure(pi, ctx));
	const recoveryNotes = details?.recoveryNotes ?? [];
	const lines = [
		`/objective:autopilot stopped.`,
		"",
		`phase: ${phase}`,
		...(branch === undefined ? [] : [`branch: ${branch}`]),
		...(details?.command === undefined ? [] : [`command: ${details.command}`]),
		"",
		message,
		"",
		...formatList("changed files", changedFiles),
		...formatList("staged files", stagedFiles),
		...formatList("recovery", recoveryNotes),
	];
	if (changedFiles.length > 0 || stagedFiles.length > 0) {
		lines.push("- rerun safety: not safe until uncommitted changes are committed, stashed, reset, or manually recovered.");
	} else {
		lines.push("- rerun safety: safe if the starting guards still pass.");
	}
	return lines.join("\n");
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
	ctx.ui.setWidget?.(STATUS_KEY, ["/objective:autopilot", "checking repository…"], { placement: "aboveEditor" });
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
			ctx.ui.setWidget?.(
				STATUS_KEY,
				[
					`/objective:autopilot ${iteration}/${args.iterations}`,
					`objective: ${args.objective}`,
					"child process: subagent",
					`model: ${args.model === undefined ? "pending" : `requested ${args.model}`}`,
					"child: starting…",
				],
				{ placement: "aboveEditor" },
			);
			const child = await runChild(ctx.cwd, buildChildPrompt(args, iteration, startingBranch), args.model, (snapshot, stderrTail) => {
				showChildProgress(ctx, {
					iteration,
					totalIterations: args.iterations,
					objective: args.objective,
					...(args.model === undefined ? {} : { requestedModel: args.model }),
					snapshot,
					...(stderrTail === undefined ? {} : { stderrTail }),
				});
			});
			if (child.exitCode !== 0) {
				throw new AutopilotPhaseError(
					"child",
					`Child Pi exited ${child.exitCode}.\n${tail(firstNonEmptyText(child.stderr, child.finalText) ?? "")}`,
				);
			}
			const report = parseReport(child.finalText);
			if (!report) {
				throw new AutopilotPhaseError(
					"child report parsing",
					`Child did not produce a parseable report. Tail:\n${tail(firstNonEmptyText(child.finalText, child.stderr) ?? "")}`,
				);
			}
			if (report.status === "stop") {
				summaries.push(`iteration ${iteration}: stopped (${usableReportText(report.stopReason) ?? "child requested stop"}).`);
				break;
			}
			const facts = await verifyAfterChild({ pi, ctx, report, startingBranch });
			let changedFiles = facts.changedFiles;
			if (args.isDryRun) {
				summaries.push(`iteration ${iteration}: verified dry-run on ${report.branch}; ${changedFiles.length} changed file(s).`);
				break;
			}
			let recoveryNotes = await runJustFormatterRecoveryIfNeeded(pi, ctx, changedFiles);
			if (recoveryNotes.length > 0) {
				changedFiles = (await collectRepoChangeFacts(pi, ctx)).changedFiles;
			}
			const commit = await commitAndMaybeSubmit({
				pi,
				ctx,
				report,
				changedFiles,
				shouldSubmit: args.shouldSubmit,
				recoveryNotes,
			});
			recoveryNotes = commit.recoveryNotes;
			summaries.push([
				`iteration ${iteration}: ${usableReportText(report.recommendedSlice) ?? "completed slice"}`,
				`- branch: ${report.branch}`,
				`- changed files: ${changedFiles.length}`,
				...recoveryNotes.map((note) => `- recovery: ${note}`),
				`- commit: ${firstNonEmptyText(commit.commitOutput.split("\n")[0], "created") ?? "created"}`,
				args.shouldSubmit
					? `- submit: ${submitSummary(commit.submitOutput)}`
					: "- submit: skipped (no --submit)",
			].join("\n"));
			const postStatus = await gitRaw(pi, ctx, ["status", "--porcelain=v1"]);
			if (parseGitStatusPaths(postStatus).length > 0) throw new Error(`Worktree is dirty after commit/submit:\n${postStatus}`);
			startingBranch = await git(pi, ctx, ["branch", "--show-current"]);
		}
		sendSummary({ pi, ctx, text: [`/objective:autopilot complete`, ...summaries].join("\n\n") });
	} catch (error) {
		sendSummary({ pi, ctx, text: await formatAutopilotFailure(pi, ctx, error), level: "error" });
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
