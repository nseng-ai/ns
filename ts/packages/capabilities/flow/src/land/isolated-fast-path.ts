import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { NsCommandIo } from "@nseng-ai/kernel/sdk";
import {
	completed,
	failure,
	landStackFailure,
	type LandStackOutcome,
	type LandStackResult,
} from "./stack/errors.ts";
import { toLandStackFailure } from "./stack/landing-plan.ts";
import { notifyPrintAware, presentFailureAndReturn, setStatus } from "./stack/presentation.ts";
import type {
	LandingShape,
	PrintAwareLandStackCommandContext,
	StackSnapshot,
} from "./stack/types.ts";
import type { LandGithubPrGateway, LandingFailure, SquashMergeVerification } from "./types.ts";

export interface ValidPullRequestView {
	number: number;
	headRefName: string;
	baseRefName: string;
	title: string;
	body: string;
	headRefOid: string;
}

interface RunIsolatedFastPathLandingOptions<BeforeMergeValue> {
	github: LandGithubPrGateway;
	ctx: PrintAwareLandStackCommandContext;
	target: LandingShape;
	isDryRun: boolean;
	beforeMerge?: () => Promise<LandStackResult<BeforeMergeValue>>;
	progressIo?: NsCommandIo;
}

export interface IsolatedFastPathLandingResult<BeforeMergeValue = undefined> {
	readonly outcome: LandStackOutcome;
	readonly beforeMergeValue: BeforeMergeValue | undefined;
}

export function isIsolatedFastPath(stack: StackSnapshot): boolean {
	return (
		stack.actualCurrentBranch !== stack.trunk &&
		stack.landingBranches.length === 1 &&
		stack.landingBranches[0] === stack.actualCurrentBranch &&
		stack.descendantBranches.length === 0
	);
}

export async function runIsolatedFastPathLanding<BeforeMergeValue = undefined>(
	options: RunIsolatedFastPathLandingOptions<BeforeMergeValue>,
): Promise<IsolatedFastPathLandingResult<BeforeMergeValue>> {
	const prResult = await options.github.pullRequestFacts({
		repoRoot: options.target.repoRoot,
		branchOrNumber: options.target.stack.actualCurrentBranch,
	});
	if (prResult.type === "failure") {
		return isolatedFastPathResult<BeforeMergeValue>(
			presentLandingFailure(options.ctx, prResult.failure),
			undefined,
		);
	}
	const pr = prResult.value;

	if (pr.baseRefName !== options.target.trunk) {
		const message = `Refusing to land PR #${pr.number}: base branch is '${pr.baseRefName}', not Graphite trunk '${options.target.trunk}'. Merge not attempted.`;
		notifyPrintAware({ ctx: options.ctx, message, level: "error", kind: "refusal" });
		return isolatedFastPathResult<BeforeMergeValue>(
			failure(landStackFailure(message, { outcome: "refusal" })),
			undefined,
		);
	}

	if (options.isDryRun) {
		notifyPrintAware({
			ctx: options.ctx,
			message: `Dry run only; would merge PR #${pr.number} into ${options.target.trunk}.`,
			level: "info",
			kind: "success",
		});
		return isolatedFastPathResult<BeforeMergeValue>(completed(), undefined);
	}

	const beforeMergeOutcome = await options.beforeMerge?.();
	if (beforeMergeOutcome?.type === "failure") {
		return isolatedFastPathResult<BeforeMergeValue>(beforeMergeOutcome, undefined);
	}
	const beforeMergeValue = beforeMergeOutcome?.value;

	const progressOptions = optionalEntry("progressIo", options.progressIo);
	progress(
		options.ctx,
		"Running gh pr merge --squash with PR title/body as commit message…",
		progressOptions,
	);

	const result = await options.github.squashMergePullRequest({
		repoRoot: options.target.repoRoot,
		pullRequest: pr,
	});
	if (result.type === "failure") {
		return isolatedFastPathResult(
			presentLandingFailure(options.ctx, result.failure),
			beforeMergeValue,
		);
	}

	// The squash merge already carries post-merge verification (from the mergePullRequest mutation
	// response, or a single fallback pullRequestFacts load inside the gateway), so no extra
	// `gh pr view` is needed here.
	const verificationFailure = mergedVerificationFailure({
		verified: result.value.verification,
		trunk: options.target.trunk,
		branch: options.target.stack.actualCurrentBranch,
	});
	if (verificationFailure !== undefined) {
		notifyPrintAware({
			ctx: options.ctx,
			message: verificationFailure,
			level: "error",
			kind: "failure",
		});
		return isolatedFastPathResult(failure(landStackFailure(verificationFailure)), beforeMergeValue);
	}

	notifyPrintAware({
		ctx: options.ctx,
		message: `Merged PR #${pr.number}; squash commit used PR title/body.`,
		level: "info",
		kind: "success",
	});
	return isolatedFastPathResult(completed(), beforeMergeValue);
}

function isolatedFastPathResult<BeforeMergeValue>(
	outcome: LandStackOutcome,
	beforeMergeValue: BeforeMergeValue | undefined,
): IsolatedFastPathLandingResult<BeforeMergeValue> {
	return { outcome, beforeMergeValue };
}

function progress(
	ctx: PrintAwareLandStackCommandContext,
	message: string,
	options: { progressIo?: NsCommandIo } = {},
): void {
	if (options.progressIo !== undefined) {
		options.progressIo.phase(message);
		return;
	}
	setStatus(ctx, message);
	notifyPrintAware({ ctx, message, level: "info" });
}

function presentLandingFailure(
	ctx: PrintAwareLandStackCommandContext,
	landingFailure: LandingFailure,
): LandStackOutcome {
	return presentFailureAndReturn(ctx, toLandStackFailure(landingFailure));
}

function mergedVerificationFailure(options: {
	readonly verified: SquashMergeVerification;
	readonly trunk: string;
	readonly branch: string;
}): string | undefined {
	if (
		options.verified.state === "MERGED" &&
		options.verified.mergedAt &&
		options.verified.baseRefName === options.trunk &&
		options.verified.headRefName === options.branch
	) {
		return undefined;
	}
	return "squash merge succeeded but PR did not verify as MERGED; post-landing cleanup skipped.";
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
