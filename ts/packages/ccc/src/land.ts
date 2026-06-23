import { normalizeExecResult, type ExecOutputListener } from "@sdl/core/exec";
import { formatErrorMessage } from "@sdl/core/primitives";
import {
	sendCommandProgressOrNotify,
	registerCommandWithImmediateAck,
} from "@sdl/pi-extension-runtime/command-ack";
import {
	executeStackLanding,
	landArgumentCompletions,
	parseArgs,
	registerLandStackRenderer,
} from "./land-stack.ts";
import { LandStackCommandStream, withCommandStreaming } from "./land-stack/command-stream.ts";
import { AUTO_CHUNK_LANDING_THRESHOLD } from "./land-stack/constants.ts";
import {
	completed,
	failure,
	landStackFailure,
	type LandStackOutcome,
} from "./land-stack/errors.ts";
import {
	formatFailure,
	formatFailureNotification,
	presentBrief,
	usage,
} from "./land-stack/presentation.ts";
import { loadLandingShape } from "./land-stack/stack-facts.ts";
import type {
	AutocompleteItem,
	CustomMessage,
	LandStackCommandContext,
	LandingShape,
	MessageRenderer,
	NotifyLevel,
	StackSnapshot,
} from "./land-stack/types.ts";

export type { NotifyLevel } from "./land-stack/types.ts";

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed?: boolean;
}

export type ExtensionMode = "tui" | "rpc" | "json" | "print";

export interface PrintOutput {
	write(chunk: string): unknown;
}

export interface LandCommandContext extends LandStackCommandContext {
	mode?: ExtensionMode;
	printOutput?: PrintOutput;
}

export interface LandExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description: string;
			getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
			handler(args: string, ctx: LandCommandContext): Promise<void> | void;
		},
	): void;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(
		message: CustomMessage,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): void;
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult>;
}

const COMMAND_NAME = "sdl:flow:land";
const PR_VIEW_FIELDS = "number,headRefName,baseRefName,title,body,headRefOid";
const PR_VIEW_TIMEOUT_MS = 30_000;
const PR_MERGE_TIMEOUT_MS = 120_000;

export interface ValidPullRequestView {
	number: number;
	headRefName: string;
	baseRefName: string;
	title: string;
	body: string;
	headRefOid: string;
}

export function registerLandCommand(pi: LandExtensionAPI): void {
	registerLandStackRenderer(pi);

	registerCommandWithImmediateAck({
		host: pi,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description: "Land the current PR or Graphite stack into trunk",
			getArgumentCompletions: landArgumentCompletions,
			handler: async (rawArgs, ctx) => {
				await runLandCommand(pi, rawArgs, ctx);
			},
		},
	});
}

export type LandCliConfirmPrompt = (title: string, message: string) => Promise<boolean> | boolean;

async function runLandCommand(
	pi: LandExtensionAPI,
	rawArgs: string,
	ctx: LandCommandContext,
): Promise<LandStackOutcome> {
	const args = parseArgs(rawArgs);
	if (args.type === "failure") {
		presentBrief(
			ctx,
			args.failure.message,
			args.failure.level,
			formatFailureNotification(args.failure),
		);
		return failure(args.failure);
	}
	if (args.value.help) {
		notify(ctx, usage(), "info");
		return completed();
	}

	await ctx.waitForIdle();

	const commandStream = new LandStackCommandStream(pi, ctx, {
		shouldMirrorFinishedCommandsToNonUi: false,
	});
	const runtimePi = withCommandStreaming(pi, commandStream);
	const runtimeLandPi: LandExtensionAPI = {
		...pi,
		exec: async (command, commandArgs, options) =>
			normalizeExecResult(await runtimePi.exec(command, commandArgs, options)),
	};
	const shape = await loadLandingShape(runtimePi, ctx.cwd);
	if (shape.type === "failure") {
		presentBrief(
			ctx,
			formatFailure(shape.failure, []),
			shape.failure.level,
			formatFailureNotification(shape.failure),
		);
		return failure(shape.failure);
	}

	if (
		shape.value.stack.actualCurrentBranch === shape.value.stack.trunk ||
		shape.value.stack.landingBranches.length === 0
	) {
		const message = `Current branch is ${shape.value.stack.actualCurrentBranch}, which is trunk or has no PR path to land. Nothing to do.`;
		presentBrief(ctx, message, "info", message);
		return completed();
	}

	if (isIsolatedFastPath(shape.value.stack)) {
		return await runFastLand(runtimeLandPi, ctx, shape.value, { dryRun: args.value.dryRun });
	}

	if (shape.value.stack.landingBranches.length > AUTO_CHUNK_LANDING_THRESHOLD) {
		return await executeStackLanding(pi, ctx, args.value, { initialShape: shape.value });
	}

	const confirmationOutcome = await confirmStackModeIfNeeded(ctx, shape.value, {
		dryRun: args.value.dryRun,
		yes: args.value.yes,
	});
	if (confirmationOutcome.type === "failure") return confirmationOutcome;

	return await executeStackLanding(pi, ctx, args.value, {
		skipMainConfirmation: true,
		initialShape: shape.value,
	});
}

/**
 * Lower-level adapter used by the SDL CLI extension.
 *
 * This intentionally does not use `registerCliCommandExtension`: that helper lives
 * above CCC in `@sdl/pi-extensions` and owns Pi slash-command registration and
 * rendering. This adapter must stay below that package so SDL CLI execution can
 * reuse CCC land orchestration without creating a CCC -> pi-extensions cycle.
 */
export interface LandCliInput {
	cwd: string;
	rawArgs: string;
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult>;
	stdout(text: string): void;
	stderr(text: string): void;
	onOutput?: ExecOutputListener | undefined;
	confirm?: LandCliConfirmPrompt | undefined;
}

export async function runLandCli(input: LandCliInput): Promise<number> {
	let didRegister = false;
	const api: LandExtensionAPI = {
		registerCommand() {
			didRegister = true;
		},
		exec: input.exec,
	};
	registerLandCommand(api);
	if (!didRegister) {
		input.stderr("Land command registration failed.\n");
		return 1;
	}

	const confirm = input.confirm;
	const outcome = await runLandCommand(api, input.rawArgs, {
		cwd: input.cwd,
		hasUI: confirm !== undefined,
		ui: {
			notify(message, level) {
				const output = `${message.trimEnd()}\n`;
				if (level === "error") {
					input.stderr(output);
					return;
				}
				input.stdout(output);
			},
			confirm: async (title, message) =>
				confirm === undefined ? false : await confirm(title, message),
			setStatus: (_key, value) => {
				writeCliStatusToOutput(input.onOutput, value);
			},
		},
		waitForIdle: async () => {},
	});
	return outcome.type === "failure" && outcome.failure.level === "error" ? 1 : 0;
}

function writeCliStatusToOutput(
	onOutput: ExecOutputListener | undefined,
	status: string | undefined,
): void {
	if (status === undefined) return;
	onOutput?.("stdout", `${status}\n`);
}

export function isIsolatedFastPath(stack: StackSnapshot): boolean {
	return (
		stack.actualCurrentBranch !== stack.trunk &&
		stack.landingBranches.length === 1 &&
		stack.landingBranches[0] === stack.actualCurrentBranch &&
		stack.descendantBranches.length === 0
	);
}

async function confirmStackModeIfNeeded(
	ctx: LandCommandContext,
	shape: LandingShape,
	options: { dryRun: boolean; yes: boolean },
): Promise<LandStackOutcome> {
	if (options.dryRun || options.yes) return completed();
	if (!ctx.hasUI) {
		const landFailure = landStackFailure(
			"Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.",
		);
		presentBrief(
			ctx,
			landFailure.message,
			landFailure.level,
			formatFailureNotification(landFailure),
		);
		return failure(landFailure);
	}

	const confirmed = await ctx.ui.confirm("Land stack?", formatUpfrontStackConfirmation(shape));
	if (!confirmed) {
		const landFailure = landStackFailure("Cancelled before merge; no PRs were landed.", {
			level: "info",
		});
		presentBrief(
			ctx,
			landFailure.message,
			landFailure.level,
			formatFailureNotification(landFailure),
		);
		return failure(landFailure);
	}
	return completed();
}

function formatUpfrontStackConfirmation(shape: LandingShape): string {
	const stack = shape.stack;
	const bottomBranch = stack.landingBranches[0] ?? stack.actualCurrentBranch;
	const lines = [
		`Land ${stack.landingBranches.length} PRs from ${bottomBranch} through ${stack.actualCurrentBranch} into ${stack.trunk}?`,
	];
	if (stack.descendantBranches.length > 0) {
		lines.push(
			`Descendants above ${stack.actualCurrentBranch} will not be merged; this command will try to maintain them after landing.`,
		);
	}
	return lines.join("\n");
}

async function runFastLand(
	pi: LandExtensionAPI,
	ctx: LandCommandContext,
	target: LandingShape,
	options: { dryRun: boolean },
): Promise<LandStackOutcome> {
	const pr = await loadPullRequest(pi, target.repoRoot);
	if ("error" in pr) {
		notify(ctx, pr.error, "error");
		return failure(landStackFailure(pr.error));
	}

	if (pr.baseRefName !== target.trunk) {
		const message = `Refusing to land PR #${pr.number}: base branch is '${pr.baseRefName}', not Graphite trunk '${target.trunk}'. Merge not attempted.`;
		notify(ctx, message, "error");
		return failure(landStackFailure(message));
	}

	if (options.dryRun) {
		notify(ctx, `Dry run only; would merge PR #${pr.number} into ${target.trunk}.`, "info");
		return completed();
	}

	progress(pi, ctx, "Running gh pr merge -s with PR title/body as commit message…");

	const result = await pi.exec(
		"gh",
		[
			"pr",
			"merge",
			String(pr.number),
			"-s",
			"--match-head-commit",
			pr.headRefOid,
			"--subject",
			pr.title,
			"--body",
			pr.body,
		],
		{
			cwd: target.repoRoot,
			timeout: PR_MERGE_TIMEOUT_MS,
		},
	);

	const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
	if (result.code === 0) {
		const message = `Merged PR #${pr.number}; squash commit used PR title/body.`;
		notify(ctx, output ? `${output}\n${message}` : message, "info");
		return completed();
	}

	const message = `gh pr merge -s with PR title/body failed for PR #${pr.number} with exit code ${result.code}.`;
	const fullMessage = output ? `${output}\n${message}` : message;
	notify(ctx, fullMessage, "error");
	return failure(landStackFailure(fullMessage));
}

function progress(pi: LandExtensionAPI, ctx: LandCommandContext, message: string): void {
	if (ctx.mode === "print") {
		const output = message.endsWith("\n") ? message : `${message}\n`;
		(ctx.printOutput ?? process.stdout).write(output);
	}
	sendCommandProgressOrNotify({
		host: pi,
		ctx,
		message,
		shouldNotifyWhenNoUi: true,
	});
}

function notify(ctx: LandCommandContext, message: string, level: NotifyLevel): void {
	if (ctx.mode === "print") {
		const output = message.endsWith("\n") ? message : `${message}\n`;
		(ctx.printOutput ?? process.stdout).write(output);
	}
	ctx.ui.notify(message, level);
}

export async function loadPullRequest(
	pi: Pick<LandExtensionAPI, "exec">,
	cwd: string,
): Promise<ValidPullRequestView | { error: string }> {
	const result = await pi.exec("gh", ["pr", "view", "--json", PR_VIEW_FIELDS], {
		cwd,
		timeout: PR_VIEW_TIMEOUT_MS,
	});
	if (result.code !== 0) {
		const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
		return {
			error:
				output.length > 0
					? output
					: `gh pr view failed with exit code ${result.code}. Merge not attempted.`,
		};
	}

	let raw: unknown;
	try {
		raw = JSON.parse(result.stdout);
	} catch (error) {
		return {
			error: `Failed to parse gh pr view output: ${formatErrorMessage(error)}. Merge not attempted.`,
		};
	}

	return parsePullRequestView(raw);
}

export function parsePullRequestView(value: unknown): ValidPullRequestView | { error: string } {
	if (!isRecord(value)) {
		return { error: "gh pr view did not return a PR object. Merge not attempted." };
	}

	const number =
		typeof value.number === "number" && Number.isFinite(value.number) ? value.number : undefined;
	const headRefName = nonEmptyString(value.headRefName) ? value.headRefName : undefined;
	const baseRefName = nonEmptyString(value.baseRefName) ? value.baseRefName : undefined;
	const title = nonEmptyString(value.title) ? value.title : undefined;
	const headRefOid = nonEmptyString(value.headRefOid) ? value.headRefOid : undefined;

	const missingFields: string[] = [];
	if (number === undefined) missingFields.push("number");
	if (headRefName === undefined) missingFields.push("headRefName");
	if (baseRefName === undefined) missingFields.push("baseRefName");
	if (title === undefined) missingFields.push("title");
	if (headRefOid === undefined) missingFields.push("headRefOid");

	if (
		number === undefined ||
		headRefName === undefined ||
		baseRefName === undefined ||
		title === undefined ||
		headRefOid === undefined
	) {
		return {
			error: `gh pr view did not return required field(s): ${missingFields.join(", ")}. Merge not attempted.`,
		};
	}

	const body = value.body;
	if (body !== undefined && body !== null && typeof body !== "string") {
		return { error: "gh pr view returned a non-string body. Merge not attempted." };
	}

	return {
		number,
		headRefName,
		baseRefName,
		title,
		body: typeof body === "string" ? body : "",
		headRefOid,
	};
}

function nonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
