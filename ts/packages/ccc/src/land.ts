import { formatErrorMessage } from "@asdl/core/primitives";
import { executeStackLanding, landArgumentCompletions, parseArgs, registerLandStackRenderer } from "./land-stack.ts";
import { AUTO_CHUNK_LANDING_THRESHOLD } from "./land-stack/constants.ts";
import { landStackFailure } from "./land-stack/errors.ts";
import { formatFailure, formatFailureNotification, presentBrief, usage } from "./land-stack/presentation.ts";
import { loadLandingShape } from "./land-stack/stack-facts.ts";
import type {
	AutocompleteItem,
	CustomMessage,
	LandStackCommandContext,
	LandingShape,
	MessageRenderer,
	NotifyLevel,
	RenderTheme,
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
	sendMessage?(message: CustomMessage, options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" }): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
}

const COMMAND_NAME = "code:land";
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
			await ctx.waitForIdle();

			const args = parseArgs(rawArgs);
			if (args.type === "failure") {
				presentBrief(ctx, args.failure.message, args.failure.level, formatFailureNotification(args.failure));
				return;
			}
			if (args.value.help) {
				notify(ctx, usage(), "info");
				return;
			}

			const shape = await loadLandingShape(pi, ctx.cwd);
			if (shape.type === "failure") {
				presentBrief(ctx, formatFailure(shape.failure, []), shape.failure.level, formatFailureNotification(shape.failure));
				return;
			}

			if (shape.value.stack.actualCurrentBranch === shape.value.stack.trunk || shape.value.stack.landingBranches.length === 0) {
				presentBrief(
					ctx,
					`Current branch is ${shape.value.stack.actualCurrentBranch}, which is trunk or has no PR path to land. Nothing to do.`,
					"info",
					`Current branch is ${shape.value.stack.actualCurrentBranch}, which is trunk or has no PR path to land. Nothing to do.`,
				);
				return;
			}

			if (isIsolatedFastPath(shape.value.stack)) {
				await runFastLand(pi, ctx, shape.value, { dryRun: args.value.dryRun });
				return;
			}

			if (shape.value.stack.landingBranches.length > AUTO_CHUNK_LANDING_THRESHOLD) {
				await executeStackLanding(pi, ctx, args.value, { initialShape: shape.value });
				return;
			}

			const confirmed = await confirmStackModeIfNeeded(ctx, shape.value, { dryRun: args.value.dryRun, yes: args.value.yes });
			if (!confirmed) return;

			await executeStackLanding(pi, ctx, args.value, { skipMainConfirmation: true, initialShape: shape.value });
		},
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
): Promise<boolean> {
	if (options.dryRun || options.yes) return true;
	if (!ctx.hasUI) {
		presentBrief(
			ctx,
			"Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.",
			"error",
			"Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.",
		);
		return false;
	}

	const confirmed = await ctx.ui.confirm("Land stack?", formatUpfrontStackConfirmation(shape));
	if (!confirmed) {
		presentBrief(ctx, "Cancelled before merge; no PRs were landed.", "info", "Cancelled before merge; no PRs were landed.");
		return false;
	}
	return true;
}

function formatUpfrontStackConfirmation(shape: LandingShape): string {
	const stack = shape.stack;
	const bottomBranch = stack.landingBranches[0] ?? stack.actualCurrentBranch;
	const lines = [`Land ${stack.landingBranches.length} PRs from ${bottomBranch} through ${stack.actualCurrentBranch} into ${stack.trunk}?`];
	if (stack.descendantBranches.length > 0) {
		lines.push(`Descendants above ${stack.actualCurrentBranch} will not be merged; this command will try to maintain them after landing.`);
	}
	return lines.join("\n");
}

async function runFastLand(
	pi: LandExtensionAPI,
	ctx: LandCommandContext,
	target: LandingShape,
	options: { dryRun: boolean },
): Promise<void> {
	const pr = await loadPullRequest(pi, target.repoRoot);
	if ("error" in pr) {
		notify(ctx, pr.error, "error");
		return;
	}

	if (pr.baseRefName !== target.trunk) {
		notify(
			ctx,
			`Refusing to land PR #${pr.number}: base branch is '${pr.baseRefName}', not Graphite trunk '${target.trunk}'. Merge not attempted.`,
			"error",
		);
		return;
	}

	if (options.dryRun) {
		notify(ctx, `Dry run only; would merge PR #${pr.number} into ${target.trunk}.`, "info");
		return;
	}

	notify(ctx, "Running gh pr merge -s with PR title/body as commit message…", "info");

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
		return;
	}

	const message = `gh pr merge -s with PR title/body failed for PR #${pr.number} with exit code ${result.code}.`;
	notify(ctx, output ? `${output}\n${message}` : message, "error");
}

function notify(ctx: LandCommandContext, message: string, level: NotifyLevel): void {
	if (ctx.mode === "print") {
		const output = message.endsWith("\n") ? message : `${message}\n`;
		(ctx.printOutput ?? process.stdout).write(output);
	}
	ctx.ui.notify(message, level);
}

export async function loadPullRequest(pi: Pick<LandExtensionAPI, "exec">, cwd: string): Promise<ValidPullRequestView | { error: string }> {
	const result = await pi.exec("gh", ["pr", "view", "--json", PR_VIEW_FIELDS], {
		cwd,
		timeout: PR_VIEW_TIMEOUT_MS,
	});
	if (result.code !== 0) {
		const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
		return { error: output.length > 0 ? output : `gh pr view failed with exit code ${result.code}. Merge not attempted.` };
	}

	let raw: unknown;
	try {
		raw = JSON.parse(result.stdout);
	} catch (error) {
		return { error: `Failed to parse gh pr view output: ${formatErrorMessage(error)}. Merge not attempted.` };
	}

	return parsePullRequestView(raw);
}

export function parsePullRequestView(value: unknown): ValidPullRequestView | { error: string } {
	if (!isRecord(value)) {
		return { error: "gh pr view did not return a PR object. Merge not attempted." };
	}

	const number = typeof value.number === "number" && Number.isFinite(value.number) ? value.number : undefined;
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
		return { error: `gh pr view did not return required field(s): ${missingFields.join(", ")}. Merge not attempted.` };
	}

	const body = value.body;
	if (body !== undefined && body !== null && typeof body !== "string") {
		return { error: "gh pr view returned a non-string body. Merge not attempted." };
	}

	return { number, headRefName, baseRefName, title, body: typeof body === "string" ? body : "", headRefOid };
}

function nonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
