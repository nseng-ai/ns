import { createCommandIo, runWithCommandIo, type CommandIo } from "@sdl/core/command-io";
import { formatCommand, normalizeExecResult, type ExecOutputListener } from "@sdl/core/exec";
import { formatErrorMessage } from "@sdl/core/primitives";
import {
	executeStackLanding,
	landArgumentCompletions,
	parseArgs,
	registerLandStackRenderer,
} from "./land-stack.ts";
import {
	createLandUiCommandIo,
	LandStackCommandStream,
	withCommandStreaming,
} from "./land-stack/command-stream.ts";
import {
	AUTO_CHUNK_LANDING_THRESHOLD,
	GT_MUTATION_TIMEOUT_MS,
	SLOT_TIMEOUT_MS,
} from "./land-stack/constants.ts";
import {
	completed,
	failure,
	landStackFailure,
	type LandStackOutcome,
} from "./land-stack/errors.ts";
import { exec, execGraphite } from "./land-stack/command-exec.ts";
import {
	formatFailure,
	formatFailureNotification,
	landFailureKind,
	presentBrief,
	setStatus,
	usage,
} from "./land-stack/presentation.ts";
import { renderLandResultBlockFromMessage } from "./land-stack/land-presentation.ts";
import { loadLandingShape } from "./land-stack/stack-facts.ts";
import type { Caps } from "@sdl/clinkr";
import type {
	AutocompleteItem,
	CustomMessage,
	LandStackCommandContext,
	LandStackExtensionAPI,
	LandingShape,
	LandResultKind,
	MessageRenderer,
	NotifyLevel,
	ParsedArgs,
	StackSnapshot,
} from "./land-stack/types.ts";
import { isManagedSlotPath, slotNameFromPath } from "./land-stack/worktrees.ts";

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

	pi.registerCommand(COMMAND_NAME, {
		description: "Land the current PR or Graphite stack into trunk",
		getArgumentCompletions: landArgumentCompletions,
		handler: async (rawArgs, ctx) => {
			await runLandCommand(pi, rawArgs, ctx);
		},
	});
}

export type LandCliConfirmPrompt = (title: string, message: string) => Promise<boolean> | boolean;

interface RunLandCommandOptions {
	progressIo?: CommandIo;
}

async function runLandCommand(
	pi: LandExtensionAPI,
	rawArgs: string,
	ctx: LandCommandContext,
	options: RunLandCommandOptions = {},
): Promise<LandStackOutcome> {
	const progressIo = options.progressIo;
	const args = parseArgs(rawArgs);
	if (args.type === "failure") {
		presentBrief({
			ctx,
			fullMessage: args.failure.message,
			level: args.failure.level,
			uiMessage: formatFailureNotification(args.failure),
			kind: landFailureKind(args.failure),
		});
		return failure(args.failure);
	}
	if (args.value.help) {
		notify({ ctx, message: usage(), level: "info" });
		return completed();
	}

	await ctx.waitForIdle();

	const commandStream = new LandStackCommandStream(progressIo ?? createLandUiCommandIo(pi, ctx), {
		shouldShowRunningCommandStatus: progressIo !== undefined && ctx.hasUI,
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
		presentBrief({
			ctx,
			fullMessage: formatFailure(shape.failure, []),
			level: shape.failure.level,
			uiMessage: formatFailureNotification(shape.failure),
			kind: landFailureKind(shape.failure),
		});
		return failure(shape.failure);
	}

	if (
		shape.value.stack.actualCurrentBranch === shape.value.stack.trunk ||
		shape.value.stack.landingBranches.length === 0
	) {
		const message = `Current branch is ${shape.value.stack.actualCurrentBranch}, which is trunk or has no PR path to land. Nothing to do.`;
		presentBrief({ ctx, fullMessage: message, level: "info", uiMessage: message, kind: "refusal" });
		return completed();
	}

	if (isIsolatedFastPath(shape.value.stack)) {
		const outcome = await runFastLand(runtimeLandPi, ctx, shape.value, {
			dryRun: args.value.dryRun,
			...(progressIo === undefined ? {} : { progressIo }),
		});
		if (outcome.type === "failure") return outcome;
		return await runPostLandingSlotCleanup({
			pi: runtimeLandPi,
			ctx,
			args: args.value,
			shape: shape.value,
		});
	}

	if (shape.value.stack.landingBranches.length > AUTO_CHUNK_LANDING_THRESHOLD) {
		const outcome = await executeStackLanding(pi, ctx, args.value, {
			initialShape: shape.value,
			...(progressIo === undefined ? {} : { io: progressIo }),
		});
		if (outcome.type === "failure") return outcome;
		return await runPostLandingSlotCleanup({
			pi: runtimePi,
			ctx,
			args: args.value,
			shape: shape.value,
		});
	}

	const confirmationOutcome = await confirmStackModeIfNeeded(ctx, shape.value, {
		dryRun: args.value.dryRun,
		yes: args.value.yes,
	});
	if (confirmationOutcome.type === "failure") return confirmationOutcome;

	const outcome = await executeStackLanding(pi, ctx, args.value, {
		skipMainConfirmation: true,
		initialShape: shape.value,
		...(progressIo === undefined ? {} : { io: progressIo }),
	});
	if (outcome.type === "failure") return outcome;
	return await runPostLandingSlotCleanup({
		pi: runtimePi,
		ctx,
		args: args.value,
		shape: shape.value,
	});
}

/**
 * Lower-level adapter used by the SDL CLI extension.
 *
 * This intentionally does not use `registerCliCommandExtension`: that helper lives
 * above Flow in `@sdl/pi` and owns Pi slash-command registration and
 * rendering. This adapter must stay below that package so SDL CLI execution can
 * reuse Flow land orchestration through the intentional private Flow/Pi package cycle.
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
	/**
	 * Resolved terminal caps for the house-style CLI result blocks (`resolveFlowStreamCaps` in the
	 * flow wrapper). When omitted, final result blocks render as plain text — the CLI surface stays
	 * un-styled rather than guessing caps, and the Pi command-stream path is never affected.
	 */
	caps?: Caps | undefined;
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
	const caps = input.caps;
	const progressIo = createLandCliCommandIo(input);
	const outcome = await runWithCommandIo(
		progressIo,
		async () =>
			await runLandCommand(
				api,
				input.rawArgs,
				{
					cwd: input.cwd,
					hasUI: confirm !== undefined,
					ui: {
						notify(message, level) {
							progressIo.notify(message, level === "success" ? "info" : level);
						},
						confirm: async (title, message) =>
							confirm === undefined ? false : await confirm(title, message),
						setStatus: (_key, value) => {
							if (value !== undefined) progressIo.phase(value);
						},
					},
					waitForIdle: async () => {},
					// CLI-only house-style result-block renderer (house-style §4). Wired only here, so the
					// shared orchestration's `presentBrief`/`notify` stay plain in the Pi command-stream
					// path — ANSI never leaks into `renderCommandStreamMessage`.
					...(caps === undefined ? {} : { renderResultBlock: createCliResultBlockRenderer(caps) }),
				},
				{ progressIo },
			),
	);
	return outcome.type === "failure" && outcome.failure.level === "error" ? 1 : 0;
}

/**
 * Build the CLI result-block renderer: split a settled message's first line into the bold +
 * intent-painted + glyph headline and render the remainder as normal-weight body (house-style §4).
 * Domain-authored detail (partial-success lists, failure cause + command details, recovery guidance)
 * is preserved verbatim in the body so recovery text is never lost.
 */
function createCliResultBlockRenderer(
	caps: Caps,
): (kind: LandResultKind, message: string) => string {
	return (kind, message) => renderLandResultBlockFromMessage(caps, { kind, message });
}

function createLandCliCommandIo(input: LandCliInput): CommandIo {
	// Keep this as a narrow CCC CLI edge adapter over the existing CommandIo primitive;
	// the same edge mapping also appears in autoslot, but extracting it would add a
	// second wrapper abstraction instead of just adapting local callbacks to CommandIo.
	// Reusing the SDL SDK adapter would couple this lower land path to SdlExtensionApi.
	return createCommandIo({
		...(input.onOutput === undefined
			? {}
			: { phaseTransient: (text: string) => input.onOutput?.("stderr", text) }),
		phaseFallback: input.stderr,
		notifyInfo: input.stdout,
		notifyDiagnostic: input.stderr,
	});
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
			{ outcome: "refusal" },
		);
		presentBrief({
			ctx,
			fullMessage: landFailure.message,
			level: landFailure.level,
			uiMessage: formatFailureNotification(landFailure),
			kind: landFailureKind(landFailure),
		});
		return failure(landFailure);
	}

	const confirmed = await ctx.ui.confirm("Land stack?", formatUpfrontStackConfirmation(shape));
	if (!confirmed) {
		const landFailure = landStackFailure("Cancelled before merge; no PRs were landed.", {
			level: "info",
			outcome: "refusal",
		});
		presentBrief({
			ctx,
			fullMessage: landFailure.message,
			level: landFailure.level,
			uiMessage: formatFailureNotification(landFailure),
			kind: landFailureKind(landFailure),
		});
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

interface RunPostLandingSlotCleanupOptions {
	pi: LandStackExtensionAPI;
	ctx: LandCommandContext;
	args: ParsedArgs;
	shape: LandingShape;
}

async function runPostLandingSlotCleanup({
	pi,
	ctx,
	args,
	shape,
}: RunPostLandingSlotCleanupOptions): Promise<LandStackOutcome> {
	if (!args.free || args.dryRun) return completed();

	const slotName = isManagedSlotPath(shape.repoRoot) ? slotNameFromPath(shape.repoRoot) : undefined;
	if (slotName === undefined) {
		const message = `Post-landing --free requested, but current worktree ${shape.repoRoot} is not a managed slot; kept local branch ${shape.stack.actualCurrentBranch}.`;
		notify({ ctx, message, level: "info", kind: "refusal" });
		return completed();
	}

	const cleanupDetails = formatPostLandingCleanupDetails({
		branch: shape.stack.actualCurrentBranch,
		repoRoot: shape.repoRoot,
		slotName,
	});
	if (!args.force && !args.yes) {
		if (!ctx.hasUI) {
			const landFailure = landStackFailure(
				[
					"PRs were landed, but post-landing slot cleanup requires confirmation in non-interactive mode.",
					cleanupDetails,
					"Run the commands manually, or use --free --force for post-landing cleanup next time.",
				].join("\n\n"),
				{
					outcome: "refusal",
					suggestedAction: postLandingCleanupSuggestedAction(
						slotName,
						shape.stack.actualCurrentBranch,
					),
				},
			);
			presentBrief({
				ctx,
				fullMessage: landFailure.message,
				level: landFailure.level,
				uiMessage: formatFailureNotification(landFailure),
				kind: landFailureKind(landFailure),
			});
			return failure(landFailure);
		}

		const confirmed = await ctx.ui.confirm(
			"Free current slot and delete local branch?",
			cleanupDetails,
		);
		if (!confirmed) {
			const landFailure = landStackFailure(
				`Cancelled post-landing cleanup; PRs were landed but ${slotName} and local branch ${shape.stack.actualCurrentBranch} were kept.`,
				{
					level: "warning",
					outcome: "refusal",
					suggestedAction: postLandingCleanupSuggestedAction(
						slotName,
						shape.stack.actualCurrentBranch,
					),
				},
			);
			presentBrief({
				ctx,
				fullMessage: landFailure.message,
				level: landFailure.level,
				uiMessage: formatFailureNotification(landFailure),
				kind: landFailureKind(landFailure),
			});
			return failure(landFailure);
		}
	}

	try {
		setStatus(ctx, `freeing ${slotName}...`);
		const freeArgs = ["slot", "free", "--wt", slotName];
		const freeResult = await exec(pi, "sdl", freeArgs, shape.repoRoot, SLOT_TIMEOUT_MS);
		if (freeResult.code !== 0) {
			const landFailure = landStackFailure(`PRs were landed, but freeing ${slotName} failed.`, {
				commandDisplay: formatCommand("sdl", freeArgs),
				result: freeResult,
				suggestedAction: postLandingCleanupSuggestedAction(
					slotName,
					shape.stack.actualCurrentBranch,
				),
			});
			presentBrief({
				ctx,
				fullMessage: landFailure.message,
				level: landFailure.level,
				uiMessage: formatFailureNotification(landFailure),
				kind: landFailureKind(landFailure),
			});
			return failure(landFailure);
		}

		setStatus(ctx, `deleting ${shape.stack.actualCurrentBranch}...`);
		const deleteArgs = ["delete", shape.stack.actualCurrentBranch, "-f", "-q"];
		const deleteResult = await execGraphite(pi, {
			args: deleteArgs,
			cwd: shape.repoRoot,
			timeoutMs: GT_MUTATION_TIMEOUT_MS,
		});
		if (deleteResult.code !== 0) {
			const landFailure = landStackFailure(
				`PRs were landed and ${slotName} was freed, but deleting local branch ${shape.stack.actualCurrentBranch} failed.`,
				{
					commandDisplay: formatCommand("gt", deleteArgs),
					result: deleteResult,
					suggestedAction: `Delete local branch ${shape.stack.actualCurrentBranch} manually when safe.`,
				},
			);
			presentBrief({
				ctx,
				fullMessage: landFailure.message,
				level: landFailure.level,
				uiMessage: formatFailureNotification(landFailure),
				kind: landFailureKind(landFailure),
			});
			return failure(landFailure);
		}
	} finally {
		setStatus(ctx, undefined);
	}

	notify({
		ctx,
		message: `Post-landing cleanup complete: freed ${slotName} and deleted local branch ${shape.stack.actualCurrentBranch}.`,
		level: "success",
		kind: "success",
	});
	return completed();
}

function formatPostLandingCleanupDetails(options: {
	branch: string;
	repoRoot: string;
	slotName: string;
}): string {
	const freeCommand = formatCommand("sdl", ["slot", "free", "--wt", options.slotName]);
	const deleteCommand = formatCommand("gt", ["delete", options.branch, "-f", "-q"]);
	return [
		"Post-landing --free cleanup will detach the current managed slot to trunk, then delete the landed local Graphite branch.",
		"",
		`Slot: ${options.slotName}`,
		`Worktree: ${options.repoRoot}`,
		`Local branch: ${options.branch}`,
		"",
		"Commands:",
		`$ ${freeCommand}`,
		`$ ${deleteCommand}`,
	].join("\n");
}

function postLandingCleanupSuggestedAction(slotName: string, branch: string): string {
	return `Run ${formatCommand("sdl", ["slot", "free", "--wt", slotName])}, then ${formatCommand("gt", ["delete", branch, "-f", "-q"])} when safe.`;
}

async function runFastLand(
	pi: LandExtensionAPI,
	ctx: LandCommandContext,
	target: LandingShape,
	options: { dryRun: boolean; progressIo?: CommandIo },
): Promise<LandStackOutcome> {
	const pr = await loadPullRequest(pi, target.repoRoot);
	if ("error" in pr) {
		notify({ ctx, message: pr.error, level: "error", kind: "failure" });
		return failure(landStackFailure(pr.error));
	}

	if (pr.baseRefName !== target.trunk) {
		const message = `Refusing to land PR #${pr.number}: base branch is '${pr.baseRefName}', not Graphite trunk '${target.trunk}'. Merge not attempted.`;
		notify({ ctx, message, level: "error", kind: "refusal" });
		return failure(landStackFailure(message, { outcome: "refusal" }));
	}

	if (options.dryRun) {
		notify({
			ctx,
			message: `Dry run only; would merge PR #${pr.number} into ${target.trunk}.`,
			level: "info",
			kind: "success",
		});
		return completed();
	}

	const progressOptions =
		options.progressIo === undefined ? {} : { progressIo: options.progressIo };
	progress(ctx, "Running gh pr merge -s with PR title/body as commit message…", progressOptions);

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
		notify({
			ctx,
			message: output ? `${output}\n${message}` : message,
			level: "info",
			kind: "success",
		});
		return completed();
	}

	const message = `gh pr merge -s with PR title/body failed for PR #${pr.number} with exit code ${result.code}.`;
	const fullMessage = output ? `${output}\n${message}` : message;
	notify({ ctx, message: fullMessage, level: "error", kind: "failure" });
	return failure(landStackFailure(fullMessage));
}

function progress(
	ctx: LandCommandContext,
	message: string,
	options: { progressIo?: CommandIo } = {},
): void {
	if (ctx.mode === "print") {
		const output = message.endsWith("\n") ? message : `${message}\n`;
		(ctx.printOutput ?? process.stdout).write(output);
	}
	if (options.progressIo !== undefined) {
		options.progressIo.phase(message);
		return;
	}
	ctx.ui.notify(message, "info");
}

interface NotifyOptions {
	ctx: LandCommandContext;
	message: string;
	level: NotifyLevel;
	kind?: LandResultKind;
}

function notify(options: NotifyOptions): void {
	const { ctx, message, level } = options;
	if (ctx.mode === "print") {
		const output = message.endsWith("\n") ? message : `${message}\n`;
		(ctx.printOutput ?? process.stdout).write(output);
	}
	// House-style ANSI applies only when the CLI edge wired `renderResultBlock` (Pi/print contexts
	// leave it undefined, keeping plain text colored downstream by `renderCommandStreamMessage`).
	const rendered =
		options.kind !== undefined && ctx.renderResultBlock !== undefined
			? ctx.renderResultBlock(options.kind, message)
			: message;
	ctx.ui.notify(rendered, level);
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
