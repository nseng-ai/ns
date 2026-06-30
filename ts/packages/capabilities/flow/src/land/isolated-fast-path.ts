import type { SdlCommandIo } from "sdl-sdk";
import { formatErrorMessage } from "@sdl/core/primitives";
import {
	completed,
	failure,
	landStackFailure,
	type LandStackOutcome,
} from "../land-stack/errors.ts";
import type {
	LandResultKind,
	LandingShape,
	LandStackCommandContext,
	NotifyLevel,
	StackSnapshot,
} from "../land-stack/types.ts";

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

interface IsolatedFastPathApi {
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<{ stdout: string; stderr: string; code: number; killed?: boolean }>;
}

interface PrintOutput {
	write(chunk: string): unknown;
}

interface IsolatedFastPathContext extends LandStackCommandContext {
	mode?: "tui" | "rpc" | "json" | "print";
	printOutput?: PrintOutput;
}

interface RunIsolatedFastPathLandingOptions {
	pi: IsolatedFastPathApi;
	ctx: IsolatedFastPathContext;
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
	const pr = await loadPullRequest(options.pi, options.target.repoRoot);
	if ("error" in pr) {
		notify({ ctx: options.ctx, message: pr.error, level: "error", kind: "failure" });
		return failure(landStackFailure(pr.error));
	}

	if (pr.baseRefName !== options.target.trunk) {
		const message = `Refusing to land PR #${pr.number}: base branch is '${pr.baseRefName}', not Graphite trunk '${options.target.trunk}'. Merge not attempted.`;
		notify({ ctx: options.ctx, message, level: "error", kind: "refusal" });
		return failure(landStackFailure(message, { outcome: "refusal" }));
	}

	if (options.isDryRun) {
		notify({
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
		"Running gh pr merge -s with PR title/body as commit message…",
		progressOptions,
	);

	const result = await options.pi.exec(
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
			cwd: options.target.repoRoot,
			timeout: PR_MERGE_TIMEOUT_MS,
		},
	);

	const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
	if (result.code === 0) {
		const message = `Merged PR #${pr.number}; squash commit used PR title/body.`;
		notify({
			ctx: options.ctx,
			message: output ? `${output}\n${message}` : message,
			level: "info",
			kind: "success",
		});
		return completed();
	}

	const message = `gh pr merge -s with PR title/body failed for PR #${pr.number} with exit code ${result.code}.`;
	const fullMessage = output ? `${output}\n${message}` : message;
	notify({ ctx: options.ctx, message: fullMessage, level: "error", kind: "failure" });
	return failure(landStackFailure(fullMessage));
}

function progress(
	ctx: IsolatedFastPathContext,
	message: string,
	options: { progressIo?: SdlCommandIo } = {},
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
	ctx: IsolatedFastPathContext;
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
	pi: IsolatedFastPathApi,
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
