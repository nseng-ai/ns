import { runWithSdlCommandIo } from "@sdl/kernel/command-io";
import type { SdlCommandIo } from "sdl-sdk";
import { type ExecOutputListener, normalizeExecResult } from "@sdl/core/command";
import {
	executeStackLanding,
	landArgumentCompletions,
	parseArgs,
	registerLandStackRenderer,
} from "./land-stack.ts";
import { createFlowCliCommandIo } from "./cli-command-io.ts";
import {
	createLandUiCommandIo,
	LandStackCommandStream,
	withCommandStreaming,
	type LandLiveProgressSink,
} from "./land-stack/command-stream.ts";
import {
	completed,
	failure,
	landStackFailure,
	type LandStackOutcome,
} from "./land-stack/errors.ts";
import {
	formatFailure,
	formatFailureNotification,
	landFailureKind,
	notifyPrintAware,
	presentBrief,
	usage,
} from "./land-stack/presentation.ts";
import {
	renderLandConfirmationDetails,
	renderLandResultBlockFromMessage,
} from "./land-stack/land-presentation.ts";
import { isIsolatedFastPath, runIsolatedFastPathLanding } from "./land/isolated-fast-path.ts";
import { runPostLandingSlotCleanup } from "./land/post-landing-slot-cleanup.ts";
import { loadLandingShape } from "./land-stack/stack-facts.ts";
import type { Caps } from "@sdl/clinkr";
import type {
	AutocompleteItem,
	CustomMessage,
	LandingShape,
	LandResultKind,
	MessageRenderer,
	PrintAwareLandStackCommandContext,
} from "./land-stack/types.ts";

export type { ExtensionMode, NotifyLevel, PrintOutput } from "./land-stack/types.ts";
export type { ValidPullRequestView } from "./land/isolated-fast-path.ts";
export { isIsolatedFastPath, parsePullRequestView } from "./land/isolated-fast-path.ts";

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed?: boolean;
}

export type LandCommandContext = PrintAwareLandStackCommandContext;

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
	progressIo?: SdlCommandIo;
	liveProgress?: LandLiveProgressSink;
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
	if (args.value.shouldShowHelp) {
		notifyPrintAware({ ctx, message: usage(), level: "info" });
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
		const outcome = await runIsolatedFastPathLanding({
			pi: runtimeLandPi,
			ctx,
			target: shape.value,
			isDryRun: args.value.isDryRun,
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

	const confirmationOutcome = await confirmStackModeIfNeeded(ctx, shape.value, {
		isDryRun: args.value.isDryRun,
		shouldSkipConfirmation: args.value.shouldSkipConfirmation,
	});
	if (confirmationOutcome.type === "failure") return confirmationOutcome;

	const outcome = await executeStackLanding(pi, ctx, args.value, {
		shouldSkipMainConfirmation: true,
		...(args.value.shouldSkipConfirmation ? {} : { preMergeConfirmation: "already-approved" }),
		initialShape: shape.value,
		...(progressIo === undefined ? {} : { io: progressIo }),
		...(options.liveProgress === undefined ? {} : { liveProgress: options.liveProgress }),
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
	onOutput?: ExecOutputListener;
	confirm?: LandCliConfirmPrompt;
	/** Optional progress sink; when omitted, the legacy CLI command stream is used. */
	progressIo?: SdlCommandIo;
	/** Optional Flow-owned structured live-progress sink for dynamic land titles. */
	liveProgress?: LandLiveProgressSink;
	/**
	 * Resolved terminal caps for the house-style CLI result blocks (`resolveFlowStreamCaps` in the
	 * flow wrapper). When omitted, final result blocks render as plain text — the CLI surface stays
	 * un-styled rather than guessing caps, and the Pi command-stream path is never affected.
	 */
	caps?: Caps;
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
	const progressIo = input.progressIo ?? createFlowCliCommandIo(input);
	const liveProgress = input.liveProgress;
	const outcome = await runWithSdlCommandIo(
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
					// CLI-only house-style renderers. Wired only here, so the shared orchestration's
					// `presentBrief`/`notify` stay plain in the Pi command-stream path — ANSI never leaks into
					// `renderCommandStreamMessage` or non-interactive refusal text.
					...(caps === undefined
						? {}
						: {
								renderResultBlock: createCliResultBlockRenderer(caps),
								renderConfirmationDetails: (message: string) =>
									renderLandConfirmationDetails(caps, message),
							}),
				},
				{ progressIo, ...(liveProgress === undefined ? {} : { liveProgress }) },
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

async function confirmStackModeIfNeeded(
	ctx: LandCommandContext,
	shape: LandingShape,
	options: { isDryRun: boolean; shouldSkipConfirmation: boolean },
): Promise<LandStackOutcome> {
	if (options.isDryRun || options.shouldSkipConfirmation) return completed();
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
		"This will squash-merge the selected Graphite stack path from bottom to top, refreshing each remaining PR before it lands.",
		"",
		"Step     What happens",
		"Preflight Check PR state, branch refs, worktree safety, and landing order.",
		"Merge    Merge each PR using its current PR title/body as the squash commit message.",
		"Refresh  Fetch/restack/update the remaining upstack PRs after each merge.",
		"Cleanup  Delete landed local Graphite branches when they are no longer checked out.",
		"",
		`Stack: ${stack.landingBranches.length} PR${stack.landingBranches.length === 1 ? "" : "s"} from ${bottomBranch} through ${stack.actualCurrentBranch}`,
		`Target: ${stack.trunk}`,
	];
	if (stack.descendantBranches.length > 0) {
		lines.push(
			`Descendants: ${stack.descendantBranches.join(", ")} will not be merged; the command will try to maintain them after landing.`,
		);
	}
	lines.push("", "Proceed with landing?");
	return lines.join("\n");
}
