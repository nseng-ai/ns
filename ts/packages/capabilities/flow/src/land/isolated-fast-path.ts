import type { NsCommandIo } from "@nseng-ai/sdk/sdk";
import {
	executeIsolatedLanding,
	isIsolatedFastPath,
	type IsolatedLandingOutcome,
} from "./execution/isolated-landing.ts";
import type {
	LandConfirmationRequest,
	LandExecutionMessageProgress,
} from "./execution/host-seams.ts";
import type {
	PostLandingCleanupRequest,
	PostLandingSlotCleanupDecision,
} from "./execution/post-landing-cleanup.ts";
import {
	formatIsolatedDryRunNotification,
	formatIsolatedLandingSuccessNotification,
	notifyPrintAware,
	presentFailureAndReturn,
	setStatus,
} from "./land-presentation.ts";
import {
	createFlowLandConfirmationGateway,
	createUpfrontApprovedLandConfirmationGateway,
} from "./flow-land-confirmation-gateway.ts";
import type { PrintAwareLandStackCommandContext } from "./stack/types.ts";
import { landCompleted, landOutcomeFailure, type LandOutcome } from "./results.ts";
import type { LandContext, LandingFailure, LandingShape } from "./types.ts";

export interface ValidPullRequestView {
	number: number;
	headRefName: string;
	baseRefName: string;
	title: string;
	body: string;
	headRefOid: string;
}

interface RunIsolatedFastPathLandingOptions {
	landContext: LandContext;
	ctx: PrintAwareLandStackCommandContext;
	target: LandingShape;
	isDryRun: boolean;
	cleanup: PostLandingCleanupRequest;
	approvedConfirmationKinds: ReadonlySet<LandConfirmationRequest["kind"]>;
	progressIo?: NsCommandIo;
}

export interface IsolatedFastPathLandingResult<BeforeMergeValue = PostLandingSlotCleanupDecision> {
	readonly outcome: LandOutcome;
	readonly beforeMergeValue: BeforeMergeValue | undefined;
}

export { isIsolatedFastPath };

export async function runIsolatedFastPathLanding(
	options: RunIsolatedFastPathLandingOptions,
): Promise<IsolatedFastPathLandingResult> {
	const coreOutcome = await executeIsolatedLanding({
		context: options.landContext,
		host: {
			confirmation: createUpfrontApprovedLandConfirmationGateway(
				createFlowLandConfirmationGateway(options.ctx),
				options.approvedConfirmationKinds,
			),
			progress: isolatedLandingProgress(options.ctx, options.progressIo),
		},
		target: options.target,
		isDryRun: options.isDryRun,
		cleanup: options.cleanup,
	});
	return presentIsolatedLandingOutcome(options.ctx, coreOutcome);
}

function presentIsolatedLandingOutcome(
	ctx: PrintAwareLandStackCommandContext,
	outcome: IsolatedLandingOutcome,
): IsolatedFastPathLandingResult {
	if (outcome.type === "failure") {
		const landOutcome =
			outcome.stage === "base-check" || outcome.stage === "verification"
				? presentVerbatimIsolatedFailure(ctx, outcome.failure)
				: presentIsolatedFailure(ctx, outcome.failure);
		return {
			outcome: landOutcome,
			beforeMergeValue:
				outcome.cleanupDecision.type === "not-needed" ? undefined : outcome.cleanupDecision,
		};
	}
	if (outcome.result === "dry-run") {
		notifyPrintAware({
			ctx,
			message: formatIsolatedDryRunNotification(
				outcome.pullRequest.number,
				outcome.pullRequest.baseRefName,
			),
			level: "info",
			kind: "success",
		});
		return { outcome: landCompleted(), beforeMergeValue: undefined };
	}

	notifyPrintAware({
		ctx,
		message: formatIsolatedLandingSuccessNotification({
			pullRequestNumber: outcome.pullRequest.number,
			commandOutput: outcome.commandOutput,
		}),
		level: "info",
		kind: "success",
	});
	return { outcome: landCompleted(), beforeMergeValue: outcome.cleanupDecision };
}

function presentIsolatedFailure(
	ctx: PrintAwareLandStackCommandContext,
	failure: LandingFailure,
): LandOutcome {
	presentFailureAndReturn(ctx, failure);
	return landOutcomeFailure(failure);
}

function presentVerbatimIsolatedFailure(
	ctx: PrintAwareLandStackCommandContext,
	failure: Extract<IsolatedLandingOutcome, { readonly type: "failure" }>["failure"],
): LandOutcome {
	notifyPrintAware({
		ctx,
		message: failure.message,
		level: "error",
		kind: failure.type === "execution" && failure.outcome === "refusal" ? "refusal" : "failure",
	});
	return landOutcomeFailure(failure);
}

function isolatedLandingProgress(
	ctx: PrintAwareLandStackCommandContext,
	progressIo: NsCommandIo | undefined,
): LandExecutionMessageProgress {
	return {
		note(message): void {
			if (progressIo === undefined) notifyPrintAware({ ctx, message, level: "info" });
		},
		setStatus(message): void {
			if (progressIo !== undefined) {
				if (message !== undefined) progressIo.phase(message);
				return;
			}
			setStatus(ctx, message);
		},
	};
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
