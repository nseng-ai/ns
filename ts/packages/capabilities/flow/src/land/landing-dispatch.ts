import type { SdlCommandIo } from "sdl-sdk";
import { executeStackLanding } from "../land-stack.ts";
import type { LandLiveProgressSink } from "../land-stack/command-stream.ts";
import {
	completed,
	failure,
	landStackFailure,
	type LandStackOutcome,
} from "../land-stack/errors.ts";
import {
	formatFailure,
	formatFailureNotification,
	landFailureKind,
	presentBrief,
} from "../land-stack/presentation.ts";
import { loadLandingShape } from "../land-stack/stack-facts.ts";
import type {
	LandingShape,
	LandStackExtensionAPI,
	ParsedArgs,
	PrintAwareLandStackCommandContext,
} from "../land-stack/types.ts";
import { isIsolatedFastPath, runIsolatedFastPathLanding } from "./isolated-fast-path.ts";
import { runPostLandingSlotCleanup } from "./post-landing-slot-cleanup.ts";

interface NormalizedExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed?: boolean;
}

export interface NormalizedLandExtensionAPI extends LandStackExtensionAPI {
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<NormalizedExecResult>;
}

interface RunLandingDispatchOptions {
	pi: LandStackExtensionAPI;
	runtimePi: LandStackExtensionAPI;
	runtimeLandPi: NormalizedLandExtensionAPI;
	ctx: PrintAwareLandStackCommandContext;
	parsedArgs: ParsedArgs;
	progressIo?: SdlCommandIo;
	liveProgress?: LandLiveProgressSink;
}

export async function runLandingDispatch(
	options: RunLandingDispatchOptions,
): Promise<LandStackOutcome> {
	const progressIo = options.progressIo;
	const shape = await loadLandingShape(options.runtimePi, options.ctx.cwd);
	if (shape.type === "failure") {
		presentBrief({
			ctx: options.ctx,
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
		presentBrief({
			ctx: options.ctx,
			fullMessage: message,
			level: "info",
			uiMessage: message,
			kind: "refusal",
		});
		return completed();
	}

	if (isIsolatedFastPath(shape.value.stack)) {
		const outcome = await runIsolatedFastPathLanding({
			pi: options.runtimeLandPi,
			ctx: options.ctx,
			target: shape.value,
			isDryRun: options.parsedArgs.isDryRun,
			...(progressIo === undefined ? {} : { progressIo }),
		});
		if (outcome.type === "failure") return outcome;
		return await runPostLandingSlotCleanup({
			pi: options.runtimeLandPi,
			ctx: options.ctx,
			args: options.parsedArgs,
			shape: shape.value,
		});
	}

	const confirmationOutcome = await confirmStackModeIfNeeded(options.ctx, shape.value, {
		isDryRun: options.parsedArgs.isDryRun,
		shouldSkipConfirmation: options.parsedArgs.shouldSkipConfirmation,
	});
	if (confirmationOutcome.type === "failure") return confirmationOutcome;

	const outcome = await executeStackLanding(options.pi, options.ctx, options.parsedArgs, {
		shouldSkipMainConfirmation: true,
		...(options.parsedArgs.shouldSkipConfirmation
			? {}
			: { preMergeConfirmation: "already-approved" }),
		initialShape: shape.value,
		...(progressIo === undefined ? {} : { io: progressIo }),
		...(options.liveProgress === undefined ? {} : { liveProgress: options.liveProgress }),
	});
	if (outcome.type === "failure") return outcome;
	return await runPostLandingSlotCleanup({
		pi: options.runtimePi,
		ctx: options.ctx,
		args: options.parsedArgs,
		shape: shape.value,
	});
}

async function confirmStackModeIfNeeded(
	ctx: PrintAwareLandStackCommandContext,
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
