import type { SdlCommandIo } from "@sdl/kernel/sdk";
import { formatCommand } from "@sdl/core/command";
import {
	completed,
	failure,
	landStackFailure,
	type LandStackOutcome,
} from "../land-stack/errors.ts";
import { exec, formatCommandDetails } from "../land-stack/command-exec.ts";
import { GH_MERGE_TIMEOUT_MS } from "../land-stack/constants.ts";
import { squashMergeArgs } from "../land-stack/landing-operations.ts";
import { loadPr } from "../land-stack/pr-facts.ts";
import { notifyPrintAware, setStatus } from "../land-stack/presentation.ts";
import type {
	LandingShape,
	PrintAwareLandStackCommandContext,
	StackSnapshot,
} from "../land-stack/types.ts";

export interface ValidPullRequestView {
	number: number;
	headRefName: string;
	baseRefName: string;
	title: string;
	body: string;
	headRefOid: string;
}

interface IsolatedFastPathApi {
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<{ stdout: string; stderr: string; code: number; killed?: boolean }>;
}

interface RunIsolatedFastPathLandingOptions {
	pi: IsolatedFastPathApi;
	ctx: PrintAwareLandStackCommandContext;
	target: LandingShape;
	isDryRun: boolean;
	progressIo?: SdlCommandIo;
}

export function isIsolatedFastPath(stack: StackSnapshot): boolean {
	return (
		stack.actualCurrentBranch !== stack.trunk &&
		stack.landingBranches.length === 1 &&
		stack.landingBranches[0] === stack.actualCurrentBranch &&
		stack.descendantBranches.length === 0
	);
}

export async function runIsolatedFastPathLanding(
	options: RunIsolatedFastPathLandingOptions,
): Promise<LandStackOutcome> {
	const prResult = await loadPr(
		options.pi,
		options.target.repoRoot,
		options.target.stack.actualCurrentBranch,
	);
	if (prResult.type === "failure") {
		notifyPrintAware({
			ctx: options.ctx,
			message: prResult.failure.message,
			level: "error",
			kind: "failure",
		});
		return prResult;
	}
	const pr = prResult.value;

	if (pr.baseRefName !== options.target.trunk) {
		const message = `Refusing to land PR #${pr.number}: base branch is '${pr.baseRefName}', not Graphite trunk '${options.target.trunk}'. Merge not attempted.`;
		notifyPrintAware({ ctx: options.ctx, message, level: "error", kind: "refusal" });
		return failure(landStackFailure(message, { outcome: "refusal" }));
	}

	if (options.isDryRun) {
		notifyPrintAware({
			ctx: options.ctx,
			message: `Dry run only; would merge PR #${pr.number} into ${options.target.trunk}.`,
			level: "info",
			kind: "success",
		});
		return completed();
	}

	const progressOptions =
		options.progressIo === undefined ? {} : { progressIo: options.progressIo };
	progress(
		options.ctx,
		"Running gh pr merge --squash with PR title/body as commit message…",
		progressOptions,
	);

	const mergeArgs = squashMergeArgs(pr);
	const result = await exec({
		pi: options.pi,
		command: "gh",
		args: mergeArgs,
		cwd: options.target.repoRoot,
		timeoutMs: GH_MERGE_TIMEOUT_MS,
	});

	if (result.code === 0) {
		const message = `Merged PR #${pr.number}; squash commit used PR title/body.`;
		const output = successfulCommandOutput(result);
		notifyPrintAware({
			ctx: options.ctx,
			message: output ? `${output}\n${message}` : message,
			level: "info",
			kind: "success",
		});
		return completed();
	}

	const commandDisplay = formatCommand("gh", mergeArgs);
	const message = `gh pr merge --squash with PR title/body failed for PR #${pr.number}.`;
	const fullMessage = `${message}\n${formatCommandDetails(result, commandDisplay)}`;
	notifyPrintAware({ ctx: options.ctx, message: fullMessage, level: "error", kind: "failure" });
	return failure(landStackFailure(fullMessage));
}

function progress(
	ctx: PrintAwareLandStackCommandContext,
	message: string,
	options: { progressIo?: SdlCommandIo } = {},
): void {
	if (options.progressIo !== undefined) {
		options.progressIo.phase(message);
		return;
	}
	setStatus(ctx, message);
	notifyPrintAware({ ctx, message, level: "info" });
}

function successfulCommandOutput(result: { stdout: string; stderr: string }): string {
	return [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
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
