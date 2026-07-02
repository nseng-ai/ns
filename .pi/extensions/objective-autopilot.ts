import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

// Project-local Pi adapters are imported directly by Node from .pi/extensions, where workspace
// package exports are not resolvable without the ts workspace's node_modules ancestry. Match the
// rest of .pi/extensions and reach into the ts workspace by relative path instead of bare specifier.
import { compactPreviewText } from "../../ts/packages/local/pi-tools/src/runner-subagents/activity.ts";
import {
	createRunnerSubagentJsonEventParser,
	formatElapsed,
	runnerSubagentPrimaryActivityPreview,
	type RunnerSubagentJsonEventParserSnapshot,
} from "../../ts/packages/local/pi-tools/src/runner-subagents/index.ts";
import { resolvePiInvocation } from "../../ts/packages/local/pi-tools/src/runner-subagents/subagent-process.ts";
import { optionalEntry } from "../../ts/packages/infra/core/src/primitives/primitives.ts";
import { describeBranchContextGraphiteCreationSteps } from "../../ts/packages/capabilities/branch-context/src/core/api.ts";
import {
	formatCommand,
	formatCommandFailure,
	normalizeExecResult,
	type ExecResult,
	type PiExecResultLike,
} from "../../ts/packages/infra/core/src/exec/index.ts";
import {
	sendCommandProgressOrNotify,
	registerCommandWithImmediateAck,
} from "../../ts/packages/hosts/pi/src/commands/ack.ts";

const COMMAND_NAME = "objective:autopilot";
const STATUS_KEY = "objective-autopilot";
const REPORT_BEGIN = "OBJECTIVE_AUTOPILOT_REPORT_BEGIN";
const REPORT_END = "OBJECTIVE_AUTOPILOT_REPORT_END";
const RECOVERY_REPORT_BEGIN = "OBJECTIVE_AUTOPILOT_RECOVERY_BEGIN";
const RECOVERY_REPORT_END = "OBJECTIVE_AUTOPILOT_RECOVERY_END";
const MAX_FAILURE_TAIL_CHARS = 8_000;
const AUTOPILOT_GRAPHITE_STACK_NAVIGATION_RULE =
	"Do not run `gt create`, `gt checkout`, `gt restack`, or any command whose purpose is to rebase/reorder or navigate the Graphite stack; after Graphite tracking succeeds, use plain `git switch` instead of `gt checkout` because Graphite checkout may demand a restack when a downstack branch is behind trunk";

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

interface AutopilotEnv {
	pi: ExtensionAPI;
	ctx: CommandContext;
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

interface RunPiJsonPromptOptions {
	cwd: string;
	prompt: string;
	tmpPrefix: string;
	tmpFileName: string;
	title: string;
	finalInstruction: string;
	model?: string;
	onProgress?: (snapshot: RunnerSubagentJsonEventParserSnapshot, stderrTail?: string) => void;
}

interface ChildProgressUpdate {
	iteration: number;
	totalIterations: number;
	objective: string;
	requestedModel?: string;
	snapshot: RunnerSubagentJsonEventParserSnapshot;
	stderrTail?: string;
}

interface RecoveryProgressUpdate {
	iteration: number;
	totalIterations: number;
	objective: string;
	phase: string;
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

interface RecoverySupervisorReport {
	status?: "recovered" | "not-recovered" | "needs-human" | "failed";
	summary?: string;
	currentBranch?: string;
	stopReason?: string;
	recoveryActions: string[];
	changedFiles: string[];
	stagedFiles: string[];
	validation: string[];
}

interface AutopilotRecoveryContext {
	objective: string;
	iteration: number;
	totalIterations: number;
	startingBranch: string;
	phase: string;
	failureMessage: string;
	changedFiles: string[];
	stagedFiles: string[];
	command?: string;
	currentBranch?: string;
	report?: Report;
}

interface ExecCheckedOptions {
	env: AutopilotEnv;
	command: string;
	args: string[];
}

interface RunChildOptions {
	cwd: string;
	prompt: string;
	model?: string;
	onProgress?: (snapshot: RunnerSubagentJsonEventParserSnapshot, stderrTail?: string) => void;
}

interface VerifyAfterChildOptions {
	env: AutopilotEnv;
	report: Report;
	startingBranch: string;
}

interface VerifyAfterChildWithRecoveryOptions extends VerifyAfterChildOptions {
	args: ParsedArgs;
	iteration: number;
}

interface BuildRecoveryContextOptions {
	env: AutopilotEnv;
	args: ParsedArgs;
	iteration: number;
	startingBranch: string;
	error: AutopilotPhaseError;
	report: Report;
}

interface RunRecoverySupervisorOptions {
	cwd: string;
	prompt: string;
	model?: string;
	onProgress?: (snapshot: RunnerSubagentJsonEventParserSnapshot, stderrTail?: string) => void;
}

interface CommitAndMaybeSubmitOptions {
	env: AutopilotEnv;
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

interface PhaseErrorDetails {
	changedFiles?: string[];
	stagedFiles?: string[];
	recoveryNotes?: string[];
	command?: string;
}

interface SendSummaryOptions {
	env: AutopilotEnv;
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
		"Default iterations: 1. Submission requires --submit. Submit uses sdl flow submit --no-restack; --dry-run never commits or submits.",
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

function commandFailureMessage(command: string, args: readonly string[], result: ExecResult): string {
	return formatCommandFailure("Command failed", formatCommand(command, args), result);
}

async function execCheckedRaw(options: ExecCheckedOptions): Promise<string> {
	const { env, command, args } = options;
	const result = normalizeExecResult(await env.pi.exec(command, args, { cwd: env.ctx.cwd }));
	if (result.code !== 0 || result.killed) {
		throw new Error(commandFailureMessage(command, args, result));
	}
	return result.stdout;
}

async function execChecked(options: ExecCheckedOptions): Promise<string> {
	return (await execCheckedRaw(options)).trim();
}

async function execResult(options: ExecCheckedOptions): Promise<ExecResult> {
	const { env, command, args } = options;
	return normalizeExecResult(await env.pi.exec(command, args, { cwd: env.ctx.cwd }));
}

async function git(env: AutopilotEnv, args: string[]): Promise<string> {
	return execChecked({ env, command: "git", args });
}

async function gitRaw(env: AutopilotEnv, args: string[]): Promise<string> {
	return execCheckedRaw({ env, command: "git", args });
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

async function collectRepoChangeFacts(env: AutopilotEnv): Promise<RepoChangeFacts> {
	const rawStatus = await gitRaw(env, ["status", "--porcelain=v1"]);
	const changedFiles = parseGitStatusPaths(rawStatus);
	return { rawStatus, changedFiles, hasChanges: changedFiles.length > 0 };
}

function objectiveDirectory(objective: string): string {
	if (objective.startsWith(".sdl/objectives/")) return objective;
	return path.join(".sdl", "objectives", objective);
}

async function assertInitialGuards(env: AutopilotEnv, objective: string): Promise<string> {
	const { ctx } = env;
	await git(env, ["rev-parse", "--show-toplevel"]);
	const dirty = await gitRaw(env, ["status", "--porcelain=v1"]);
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

	return git(env, ["branch", "--show-current"]);
}

async function writePromptFile(prompt: string, tmpPrefix: string, tmpFileName: string): Promise<{ dir: string; file: string }> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), tmpPrefix));
	const file = path.join(dir, tmpFileName);
	await fs.writeFile(file, prompt, { encoding: "utf8", mode: 0o600 });
	return { dir, file };
}

async function runPiJsonPrompt(options: RunPiJsonPromptOptions): Promise<ChildResult> {
	const { cwd, prompt, tmpPrefix, tmpFileName, title, finalInstruction, model, onProgress } = options;
	const tmp = await writePromptFile(prompt, tmpPrefix, tmpFileName);
	// Keep custom spawn semantics for JSON streaming with --no-session and an appended system prompt.
	// Shared runner-subagents pieces cover Pi resolution and event parsing; the full dispatcher owns richer session/runtime behavior.
	const args = ["--mode", "json", "-p", "--no-session", "--append-system-prompt", tmp.file];
	if (model) args.push("--model", model);
	args.push(finalInstruction);

	let stderr = "";
	try {
		return await new Promise<ChildResult>((resolve) => {
			const parser = createRunnerSubagentJsonEventParser({ title });
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
					...optionalEntry("stopReason", snapshot.stopReason),
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
					...optionalEntry("stopReason", snapshot.stopReason),
				});
			});
		});
	} finally {
		await fs.rm(tmp.dir, { recursive: true, force: true });
	}
}

async function runChild(options: RunChildOptions): Promise<ChildResult> {
	return runPiJsonPrompt({
		...options,
		tmpPrefix: "objective-autopilot-",
		tmpFileName: "child-prompt.md",
		title: "objective-autopilot child",
		finalInstruction: "Run the objective-autopilot child task described in your appended system prompt.",
	});
}

async function runRecoverySupervisor(options: RunRecoverySupervisorOptions): Promise<ChildResult> {
	return runPiJsonPrompt({
		...options,
		tmpPrefix: "objective-autopilot-recovery-",
		tmpFileName: "recovery-supervisor-prompt.md",
		title: "objective-autopilot recovery supervisor",
		finalInstruction: "Run the objective-autopilot recovery supervisor task described in your appended system prompt.",
	});
}

function buildChildPrompt(args: ParsedArgs, iteration: number, parentBranch: string): string {
	return `You are a fresh child Pi process for /objective:autopilot autoobjective iteration ${iteration}/${args.iterations}.

Objective: ${args.objective}
Parent branch at iteration start: ${parentBranch}

Rules:
- Operate only in the current repository/worktree.
- Do exactly one coherent Objective slice.
- First load and follow the objective-next workflow for the explicit Objective above. Run objective-next for this Objective; do not auto-select a different Objective.
- If objective-next stops, asks for a human, finds no substantive work, or says ready-to-close, stop and report status: stop.
- Before implementation, create and save an implementation plan as usual.
- Create the implementation branch with the repo's branch-context Graphite creation path: use \`sdl branch-context exec from-plan --branch-creation graphite ...\` or \`/sdl:branch-context:from-plan --graphite ...\`.
- ${describeBranchContextGraphiteCreationSteps(parentBranch)}
- Attach branch context only through the branch-context workflow after Graphite tracking succeeds. If branch-context Graphite creation or \`gt track\` fails, stop and report the failed command plus recovery guidance; do not continue on an untracked implementation branch.
- Implement the attached plan on the implementation branch.
- Validate according to repo/churn policy, and run relevant checks for changed files.
- Update Objective tracking with a meaningful Semantic Update when material progress is kept.
- Leave changes uncommitted. Do not commit, submit PRs, push, merge, publish, deploy, or mutate external systems.
- ${AUTOPILOT_GRAPHITE_STACK_NAVIGATION_RULE} during this autoobjective iteration; if a branch appears to need restacking, report it and stop.
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

interface MarkerBlockParserOptions<TReport> {
	begin: string;
	end: string;
	initialReport: TReport;
	listFields: Record<string, (report: TReport, value: string) => TReport>;
	assignTextField(report: TReport, key: string, value: string): TReport;
}

type StringListKey<TReport> = {
	[K in keyof TReport]: TReport[K] extends readonly string[] ? K : never;
}[keyof TReport];

function appendToList<TReport, TKey extends StringListKey<TReport>>(
	key: TKey,
): (report: TReport, value: string) => TReport {
	return (report, value) => ({
		...report,
		[key]: [...report[key], value],
	});
}

function parseMarkerBlock<TReport>(text: string, options: MarkerBlockParserOptions<TReport>): TReport | undefined {
	const start = text.indexOf(options.begin);
	const end = text.indexOf(options.end);
	if (start < 0 || end <= start) return undefined;
	const body = text.slice(start + options.begin.length, end).trim();
	let report = options.initialReport;
	let appendListValue: ((report: TReport, value: string) => TReport) | undefined;
	for (const line of body.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (trimmed.startsWith("- ") && appendListValue !== undefined) {
			report = appendListValue(report, trimmed.slice(2));
			continue;
		}
		const colon = trimmed.indexOf(":");
		if (colon <= 0) {
			appendListValue = undefined;
			continue;
		}
		const key = trimmed.slice(0, colon);
		const value = trimmed.slice(colon + 1).trim();
		const listAppender = value === "" ? options.listFields[key] : undefined;
		if (listAppender !== undefined) {
			appendListValue = listAppender;
			continue;
		}
		appendListValue = undefined;
		report = options.assignTextField(report, key, value);
	}
	return report;
}

function assignReportTextField(report: Report, key: string, value: string): Report {
	switch (key) {
		case "status":
			return { ...report, status: value };
		case "objective":
			return { ...report, objective: value };
		case "branch":
			return { ...report, branch: value };
		case "parentBranch":
			return { ...report, parentBranch: value };
		case "planPath":
			return { ...report, planPath: value };
		case "branchContext":
			return { ...report, branchContext: value };
		case "recommendedSlice":
			return { ...report, recommendedSlice: value };
		case "commitMessage":
			return { ...report, commitMessage: value };
		case "prTitle":
			return { ...report, prTitle: value };
		case "prBodySummary":
			return { ...report, prBodySummary: value };
		case "stopReason":
			return { ...report, stopReason: value };
	}
	return report;
}

function parseReport(text: string): Report | undefined {
	return parseMarkerBlock(text, {
		begin: REPORT_BEGIN,
		end: REPORT_END,
		initialReport: { changedFiles: [], validation: [], objectiveTracking: [] },
		listFields: {
			changedFiles: appendToList<Report, "changedFiles">("changedFiles"),
			validation: appendToList<Report, "validation">("validation"),
			objectiveTracking: appendToList<Report, "objectiveTracking">("objectiveTracking"),
		},
		assignTextField: assignReportTextField,
	});
}

function isRecoverySupervisorStatus(value: string): value is NonNullable<RecoverySupervisorReport["status"]> {
	return value === "recovered" || value === "not-recovered" || value === "needs-human" || value === "failed";
}

function assignRecoveryReportTextField(
	report: RecoverySupervisorReport,
	key: string,
	value: string,
): RecoverySupervisorReport {
	switch (key) {
		case "status":
			return isRecoverySupervisorStatus(value) ? { ...report, status: value } : report;
		case "summary":
			return { ...report, summary: value };
		case "currentBranch":
			return { ...report, currentBranch: value };
		case "stopReason":
			return { ...report, stopReason: value };
	}
	return report;
}

function parseRecoverySupervisorReport(text: string): RecoverySupervisorReport | undefined {
	return parseMarkerBlock(text, {
		begin: RECOVERY_REPORT_BEGIN,
		end: RECOVERY_REPORT_END,
		initialReport: { recoveryActions: [], changedFiles: [], stagedFiles: [], validation: [] },
		listFields: {
			recoveryActions: appendToList<RecoverySupervisorReport, "recoveryActions">("recoveryActions"),
			changedFiles: appendToList<RecoverySupervisorReport, "changedFiles">("changedFiles"),
			stagedFiles: appendToList<RecoverySupervisorReport, "stagedFiles">("stagedFiles"),
			validation: appendToList<RecoverySupervisorReport, "validation">("validation"),
		},
		assignTextField: assignRecoveryReportTextField,
	});
}

function formatRecoveryContextReport(report: Report): string {
	return [
		`status: ${report.status ?? "unknown"}`,
		`branch: ${report.branch ?? "unknown"}`,
		`parentBranch: ${report.parentBranch ?? "unknown"}`,
		`recommendedSlice: ${report.recommendedSlice ?? "unknown"}`,
		...formatList("reported changed files", report.changedFiles),
		...formatList("reported validation", report.validation),
		...formatList("reported objective tracking", report.objectiveTracking),
	].join("\n");
}

function buildRecoverySupervisorPrompt(context: AutopilotRecoveryContext): string {
	return `You are a focused recovery supervisor for /objective:autopilot iteration ${context.iteration}/${context.totalIterations}.

Objective: ${context.objective}
Starting branch before the child iteration: ${context.startingBranch}
Failure phase: ${context.phase}
Failure message:
${context.failureMessage}
${context.command === undefined ? "" : `Failed command: ${context.command}\n`}${context.currentBranch === undefined ? "" : `Current branch: ${context.currentBranch}\n`}
Live changed files before recovery:
${context.changedFiles.length === 0 ? "- none" : context.changedFiles.map((file) => `- ${file}`).join("\n")}
Live staged files before recovery:
${context.stagedFiles.length === 0 ? "- none" : context.stagedFiles.map((file) => `- ${file}`).join("\n")}

Child report summary:
${context.report === undefined ? "unknown" : formatRecoveryContextReport(context.report)}

Your job is narrow local recovery, not implementation:
- Inspect repository state and perform only minimal local recovery needed to return control to the parent verifier.
- Do not implement Objective feature work or edit feature code.
- Do not commit, submit, push, merge, publish, deploy, resolve GitHub threads, restack Graphite branches, or mutate external systems.
- ${AUTOPILOT_GRAPHITE_STACK_NAVIGATION_RULE}; restack-required submit failures must return control to the human.
- Do not stage files unless a minimal recovery command unavoidably stages them; if staging happens, report it.
- Prefer deterministic local commands and explain what evidence justified each action.
- For a Graphite-untracked implementation branch, you may run \`gt track <implementation-branch> --parent ${context.startingBranch} --no-interactive\` only when live evidence supports that parent.
- If \`gt track\` fails, report status needs-human or not-recovered; do not invent Branch Memory breadcrumb fallback state or continue with an untracked implementation branch.
- The TypeScript parent will not trust your report alone; it will re-check live branch state, HEAD, staged files, Graphite branch info, git diff --check, changed files, and Objective tracking.

Finish with exactly one structured report block:
${RECOVERY_REPORT_BEGIN}
status: recovered | not-recovered | needs-human | failed
summary: <one line>
currentBranch: <branch or unknown>
recoveryActions:
- <action performed, or none>
changedFiles:
- <path, or none>
stagedFiles:
- <path, or none>
validation:
- <command/result>
stopReason: <if not recovered>
${RECOVERY_REPORT_END}`;
}

async function verifyAfterChild(options: VerifyAfterChildOptions): Promise<RepoChangeFacts> {
	const { env, report, startingBranch } = options;
	if (report.status !== "ready-for-parent-commit") {
		throw new AutopilotPhaseError("verification", `Child stopped: ${report.stopReason ?? report.status ?? "unknown"}`);
	}
	const facts = await collectRepoChangeFacts(env);
	if (!facts.hasChanges) throw new AutopilotPhaseError("verification", "Child reported ready, but git status is clean.");
	const currentBranch = await git(env, ["branch", "--show-current"]);
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
		await execChecked({ env, command: "gt", args: ["branch", "info"] });
	} catch (error) {
		throw new AutopilotPhaseError("verification", error instanceof Error ? error.message : String(error), {
			changedFiles: facts.changedFiles,
			command: formatCommand("gt", ["branch", "info"]),
		});
	}
	try {
		await execChecked({ env, command: "git", args: ["diff", "--check"] });
	} catch (error) {
		throw new AutopilotPhaseError("verification", error instanceof Error ? error.message : String(error), {
			changedFiles: facts.changedFiles,
			command: formatCommand("git", ["diff", "--check"]),
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

async function buildRecoveryContext(options: BuildRecoveryContextOptions): Promise<AutopilotRecoveryContext> {
	const { env, args, iteration, startingBranch, error, report } = options;
	const currentBranch = await currentBranchForFailure(env);
	return {
		objective: args.objective,
		iteration,
		totalIterations: args.iterations,
		startingBranch,
		phase: error.phase,
		failureMessage: error.message,
		changedFiles: error.details?.changedFiles ?? (await changedFilesForFailure(env)),
		stagedFiles: error.details?.stagedFiles ?? (await stagedFilesForFailure(env)),
		...optionalEntry("command", error.details?.command),
		...optionalEntry("currentBranch", currentBranch),
		report,
	};
}

function recoveryReportNotes(report: RecoverySupervisorReport): string[] {
	return [
		`supervisor status: ${report.status ?? "missing"}`,
		...(report.summary === undefined ? [] : [`supervisor summary: ${report.summary}`]),
		...report.recoveryActions.map((action) => `supervisor action: ${action}`),
		...report.validation.map((entry) => `supervisor validation: ${entry}`),
		...(report.stopReason === undefined ? [] : [`supervisor stop reason: ${report.stopReason}`]),
	];
}

async function verifyAfterChildWithRecovery(options: VerifyAfterChildWithRecoveryOptions): Promise<{ facts: RepoChangeFacts; recoveryNotes: string[] }> {
	const { env, args, report, startingBranch, iteration } = options;
	const { pi, ctx } = env;
	try {
		return { facts: await verifyAfterChild({ env, report, startingBranch }), recoveryNotes: [] };
	} catch (error) {
		if (!(error instanceof AutopilotPhaseError) || error.phase !== "verification") throw error;
		const headBefore = await git(env, ["rev-parse", "HEAD"]);
		const recoveryContext = await buildRecoveryContext({ env, args, iteration, startingBranch, error, report });
		sendCommandProgressOrNotify({
			host: pi,
			ctx,
			message: `Starting objective-autopilot recovery supervisor for iteration ${iteration}/${args.iterations}…`,
		});
		const supervisor = await runRecoverySupervisor({
			cwd: ctx.cwd,
			prompt: buildRecoverySupervisorPrompt(recoveryContext),
			...optionalEntry("model", args.model),
			onProgress: (snapshot, stderrTail) => {
				showRecoveryProgress(ctx, {
					iteration,
					totalIterations: args.iterations,
					objective: args.objective,
					phase: error.phase,
					...optionalEntry("requestedModel", args.model),
					snapshot,
					...optionalEntry("stderrTail", stderrTail),
				});
			},
		});
		if (supervisor.exitCode !== 0) {
			throw new AutopilotPhaseError(
				"verification",
				`Recovery supervisor exited ${supervisor.exitCode}.\n${tail(firstNonEmptyText(supervisor.stderr, supervisor.finalText) ?? "")}`,
				{ changedFiles: recoveryContext.changedFiles, stagedFiles: recoveryContext.stagedFiles },
			);
		}
		const recoveryReport = parseRecoverySupervisorReport(supervisor.finalText);
		if (recoveryReport === undefined) {
			throw new AutopilotPhaseError(
				"verification",
				`Recovery supervisor did not produce a parseable report. Tail:\n${tail(firstNonEmptyText(supervisor.finalText, supervisor.stderr) ?? "")}`,
				{ changedFiles: recoveryContext.changedFiles, stagedFiles: recoveryContext.stagedFiles },
			);
		}
		const recoveryNotes = recoveryReportNotes(recoveryReport);
		if (recoveryReport.status !== "recovered") {
			throw new AutopilotPhaseError("verification", `Recovery supervisor did not recover: ${recoveryReport.stopReason ?? recoveryReport.status ?? "unknown"}`, {
				changedFiles: await changedFilesForFailure(env),
				stagedFiles: await stagedFilesForFailure(env),
				recoveryNotes,
			});
		}
		const headAfter = await git(env, ["rev-parse", "HEAD"]);
		if (headAfter !== headBefore) {
			throw new AutopilotPhaseError("verification", "Recovery supervisor changed HEAD; stopping for manual review.", {
				changedFiles: await changedFilesForFailure(env),
				stagedFiles: await stagedFilesForFailure(env),
				recoveryNotes,
			});
		}
		const stagedFiles = await stagedFilesForFailure(env);
		if (stagedFiles.length > 0) {
			throw new AutopilotPhaseError("verification", "Recovery supervisor left staged files; stopping for manual review.", {
				changedFiles: await changedFilesForFailure(env),
				stagedFiles,
				recoveryNotes,
			});
		}
		const currentBranch = await git(env, ["branch", "--show-current"]);
		if (currentBranch === "main" || currentBranch === "master") {
			throw new AutopilotPhaseError("verification", `Recovery supervisor switched to ${currentBranch}; stopping for manual review.`, {
				changedFiles: await changedFilesForFailure(env),
				recoveryNotes,
			});
		}
		try {
			const freshFacts = await verifyAfterChild({ env, report, startingBranch });
			return { facts: freshFacts, recoveryNotes };
		} catch (reverifyError) {
			if (reverifyError instanceof AutopilotPhaseError) {
				throw new AutopilotPhaseError(reverifyError.phase, reverifyError.message, {
					changedFiles: reverifyError.details?.changedFiles ?? (await changedFilesForFailure(env)),
					stagedFiles: reverifyError.details?.stagedFiles ?? (await stagedFilesForFailure(env)),
					...optionalEntry("command", reverifyError.details?.command),
					recoveryNotes,
				});
			}
			throw reverifyError;
		}
	}
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

async function runJustFormatterRecoveryIfNeeded(env: AutopilotEnv, changedFiles: readonly string[]): Promise<string[]> {
	if (!changedFiles.some((file) => file.endsWith(".ts") || file.endsWith(".tsx"))) return [];
	const checkArgs = ["ts-format-check"];
	const check = await execResult({ env, command: "just", args: checkArgs });
	if (check.code === 0 && !check.killed) return [];

	const fixArgs = ["ts-format-fix"];
	const fix = await execResult({ env, command: "just", args: fixArgs });
	if (fix.code !== 0 || fix.killed) {
		const command = formatCommand("just", fixArgs);
		throw new AutopilotPhaseError("formatter recovery", `Formatter autofix failed.\n${commandFailureMessage("just", fixArgs, fix)}`, {
			changedFiles: [...changedFiles],
			command,
		});
	}
	const rerun = await execResult({ env, command: "just", args: checkArgs });
	if (rerun.code !== 0 || rerun.killed) {
		const command = formatCommand("just", checkArgs);
		throw new AutopilotPhaseError("formatter recovery", `Formatter check still fails after autofix.\n${commandFailureMessage("just", checkArgs, rerun)}`, {
			changedFiles: [...changedFiles],
			command,
			recoveryNotes: ["ran just ts-format-fix after just ts-format-check failed"],
		});
	}
	return ["ran just ts-format-fix after just ts-format-check failed"];
}

async function stageChangedFiles(env: AutopilotEnv, changedFiles: readonly string[]): Promise<StageChangedFilesResult> {
	if (changedFiles.length === 0) throw new AutopilotPhaseError("staging", "No changed files to stage.");
	const commandArgs = ["add", "-A", "--", "."];
	const result = await execResult({ env, command: "git", args: commandArgs });
	if (result.code === 0 && !result.killed) return { stagedFiles: [...changedFiles], recoveryNotes: [] };

	throw new AutopilotPhaseError("staging", `Unable to stage changed files.\n${commandFailureMessage("git", commandArgs, result)}`, {
		changedFiles: [...changedFiles],
		command: formatCommand("git", commandArgs),
	});
}

async function commitAndMaybeSubmit(options: CommitAndMaybeSubmitOptions): Promise<{ commitOutput: string; submitOutput?: string; recoveryNotes: string[] }> {
	const { env, report, changedFiles, shouldSubmit } = options;
	const stage = await stageChangedFiles(env, changedFiles);
	const recoveryNotes = [...options.recoveryNotes, ...stage.recoveryNotes];
	const message = usableReportText(report.commitMessage) ?? usableReportText(report.recommendedSlice) ?? "Objective autopilot update";
	let commitOutput: string;
	try {
		commitOutput = await execChecked({ env, command: "git", args: ["commit", "-m", message] });
	} catch (error) {
		throw new AutopilotPhaseError("commit", error instanceof Error ? error.message : String(error), {
			changedFiles: [...changedFiles],
			stagedFiles: stage.stagedFiles,
			recoveryNotes,
		});
	}
	if (!shouldSubmit) return { commitOutput, recoveryNotes };
	try {
		const submitOutput = await execChecked({ env, command: "sdl", args: ["flow", "submit", "--no-restack"] });
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
	const { env, text, level = "info" } = options;
	if (env.pi.sendUserMessage) env.pi.sendUserMessage(text);
	else if (env.ctx.hasUI) env.ctx.ui.notify(text, level);
}

function tail(text: string): string {
	return text.length <= MAX_FAILURE_TAIL_CHARS ? text : text.slice(text.length - MAX_FAILURE_TAIL_CHARS);
}

interface ProgressWidgetLinesOptions {
	headerLine: string;
	objective: string;
	processLine: string;
	progressLabel: string;
	requestedModel?: string;
	snapshot: RunnerSubagentJsonEventParserSnapshot;
	stderrTail?: string;
}

function formatProgressWidgetLines(options: ProgressWidgetLinesOptions): string[] {
	const { progress, activity } = options.snapshot;
	const lines = [
		options.headerLine,
		`objective: ${options.objective}`,
		options.processLine,
		`model: ${formatRequestedModel(options.snapshot, options.requestedModel)}`,
		`${options.progressLabel}: ${progress.state}; turns/tools: ${progress.turnCount}/${progress.toolCount}; elapsed: ${formatElapsed(progress.elapsedMs)}`,
	];
	if (progress.currentTool !== undefined) lines.push(`current tool: ${progress.currentTool}`);
	const preview = runnerSubagentPrimaryActivityPreview(activity);
	if (preview !== undefined) lines.push(`activity: ${preview}`);
	if (activity.lastToolName !== undefined) {
		const prefix = activity.lastToolResultIsError ? "last tool error" : "last tool";
		lines.push(`${prefix}: ${activity.lastToolName}`);
	}
	if (activity.lastToolResultPreview !== undefined) lines.push(`last result: ${activity.lastToolResultPreview}`);
	if (options.stderrTail !== undefined && options.stderrTail.trim() !== "") lines.push(`stderr: ${compactPreviewText(options.stderrTail)}`);
	return lines;
}

function formatRequestedModel(snapshot: RunnerSubagentJsonEventParserSnapshot, requestedModel: string | undefined): string {
	const launch = snapshot.progress.launch;
	if (launch?.model !== undefined) return `${launch.model.provider}/${launch.model.id}`;
	if (launch?.requestedModel !== undefined) return `requested ${launch.requestedModel}`;
	if (requestedModel !== undefined) return `requested ${requestedModel}`;
	return "pending";
}

function formatChildProgressWidgetLines(update: ChildProgressUpdate): string[] {
	return formatProgressWidgetLines({
		headerLine: `/objective:autopilot ${update.iteration}/${update.totalIterations}`,
		objective: update.objective,
		processLine: "child process: subagent",
		progressLabel: "child",
		...optionalEntry("requestedModel", update.requestedModel),
		snapshot: update.snapshot,
		...optionalEntry("stderrTail", update.stderrTail),
	});
}

function showChildProgress(ctx: CommandContext, update: ChildProgressUpdate): void {
	ctx.ui.setWidget?.(STATUS_KEY, formatChildProgressWidgetLines(update), { placement: "aboveEditor" });
}

function formatRecoveryProgressWidgetLines(update: RecoveryProgressUpdate): string[] {
	return formatProgressWidgetLines({
		headerLine: `/objective:autopilot ${update.iteration}/${update.totalIterations}`,
		objective: update.objective,
		processLine: `recovery supervisor: ${update.phase}`,
		progressLabel: "supervisor",
		...optionalEntry("requestedModel", update.requestedModel),
		snapshot: update.snapshot,
		...optionalEntry("stderrTail", update.stderrTail),
	});
}

function showRecoveryProgress(ctx: CommandContext, update: RecoveryProgressUpdate): void {
	ctx.ui.setWidget?.(STATUS_KEY, formatRecoveryProgressWidgetLines(update), { placement: "aboveEditor" });
}

function formatList(title: string, values: readonly string[]): string[] {
	if (values.length === 0) return [`- ${title}: none`];
	return [`- ${title}:`, ...values.map((value) => `  - ${value}`)];
}

async function currentBranchForFailure(env: AutopilotEnv): Promise<string | undefined> {
	try {
		return await git(env, ["branch", "--show-current"]);
	} catch {
		return undefined;
	}
}

async function stagedFilesForFailure(env: AutopilotEnv): Promise<string[]> {
	try {
		const raw = await gitRaw(env, ["diff", "--cached", "--name-only"]);
		return raw.split(/\r?\n/).filter((line) => line !== "");
	} catch {
		return [];
	}
}

async function changedFilesForFailure(env: AutopilotEnv): Promise<string[]> {
	try {
		return (await collectRepoChangeFacts(env)).changedFiles;
	} catch {
		return [];
	}
}

async function formatAutopilotFailure(env: AutopilotEnv, error: unknown): Promise<string> {
	const message = error instanceof Error ? error.message : String(error);
	const phase = error instanceof AutopilotPhaseError ? error.phase : "unknown";
	const details = error instanceof AutopilotPhaseError ? error.details : undefined;
	const branch = await currentBranchForFailure(env);
	const changedFiles = details?.changedFiles ?? (await changedFilesForFailure(env));
	const stagedFiles = details?.stagedFiles ?? (await stagedFilesForFailure(env));
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
	const env: AutopilotEnv = { pi, ctx };
	let args: ParsedArgs;
	try {
		args = parseArgs(rawArgs);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		sendSummary({ env, text: `${message}\n\n${usage()}`, level: "error" });
		return;
	}

	sendCommandProgressOrNotify({ host: pi, ctx, message: "Checking repository for /objective:autopilot…" });
	await ctx.waitForIdle();
	ctx.ui.setWidget?.(STATUS_KEY, ["/objective:autopilot", "checking repository…"], { placement: "aboveEditor" });
	try {
		let startingBranch = await assertInitialGuards(env, args.objective);
		const summaries: string[] = [];
		for (let iteration = 1; iteration <= args.iterations; iteration++) {
			sendCommandProgressOrNotify({
				host: pi,
				ctx,
				message: `Starting objective-autopilot child iteration ${iteration}/${args.iterations}…`,
			});
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
			const child = await runChild({
				cwd: ctx.cwd,
				prompt: buildChildPrompt(args, iteration, startingBranch),
				...optionalEntry("model", args.model),
				onProgress: (snapshot, stderrTail) => {
					showChildProgress(ctx, {
						iteration,
						totalIterations: args.iterations,
						objective: args.objective,
						...optionalEntry("requestedModel", args.model),
						snapshot,
						...optionalEntry("stderrTail", stderrTail),
					});
				},
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
			const verification = await verifyAfterChildWithRecovery({ env, args, report, startingBranch, iteration });
			let changedFiles = verification.facts.changedFiles;
			if (args.isDryRun) {
				summaries.push([
					`iteration ${iteration}: verified dry-run on ${report.branch}; ${changedFiles.length} changed file(s).`,
					...verification.recoveryNotes.map((note) => `- recovery: ${note}`),
				].join("\n"));
				break;
			}
			let recoveryNotes = [
				...verification.recoveryNotes,
				...(await runJustFormatterRecoveryIfNeeded(env, changedFiles)),
			];
			if (recoveryNotes.length > 0) {
				changedFiles = (await collectRepoChangeFacts(env)).changedFiles;
			}
			const commit = await commitAndMaybeSubmit({
				env,
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
			const postStatus = await gitRaw(env, ["status", "--porcelain=v1"]);
			if (parseGitStatusPaths(postStatus).length > 0) throw new Error(`Worktree is dirty after commit/submit:\n${postStatus}`);
			startingBranch = await git(env, ["branch", "--show-current"]);
		}
		sendSummary({ env, text: [`/objective:autopilot complete`, ...summaries].join("\n\n") });
	} catch (error) {
		sendSummary({ env, text: await formatAutopilotFailure(env, error), level: "error" });
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
			description: "Run bounded fresh-child Objective autopilot iterations with parent verification and no-restack submit.",
			handler: async (args, ctx) => runAutopilot(pi, args, ctx),
		},
	});
}
