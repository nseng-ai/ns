import { registerCommandWithImmediateAck } from "../../commands/ack.ts";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { formatZodError, optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import { parseCliCommandArgs } from "../../commands/cli-extension.ts";
import { parseMachineEnvelopeDataWithFailureData } from "../../runtime/machine-envelope.ts";
import type { NotifyLevel } from "../../runtime/tool-types.ts";
import { definePiSurfaceParity } from "../../runtime/parity-extension.ts";
import {
	downloadPrFeedback,
	type ExecOptions,
	type ExecResult,
	type PrFeedbackDownloadCounts,
} from "./feedback-download.ts";

export const PR_DOWNLOAD_FEEDBACK_COMMAND_NAME = "pr:download-feedback";
export const PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME = "pr:download-stack-feedback";
const DOWNLOAD_FEEDBACK_STATUS_KEY = PR_DOWNLOAD_FEEDBACK_COMMAND_NAME;
const DOWNLOAD_STACK_FEEDBACK_STATUS_KEY = PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME;
const COMMAND_TIMEOUT_MS = 60_000;
const STACK_DISCOVERY_TIMEOUT_MS = 120_000;
const ADDRESSING_FOLLOW_UP = [
	"## Addressing workflow boundary",
	"",
	"If asked to address this feedback, treat this download as one snapshot: apply fixes, run appropriate local validation, submit the branch, resolve addressed threads, then stop and report.",
	"",
	"Do not wait for or poll CI, Graphite mergeability, automated review jobs, or newly generated feedback. Re-download feedback only when the user explicitly requests another pass or invokes a stack-repair/checks workflow. The `code-fix-gh-stack` workflow owns waiting, re-querying checks, and iterative repair.",
].join("\n");
const stackBranchesDataSchema = z.looseObject({
	branches: z.array(z.string()),
});

const branchPrEntrySchema = z.looseObject({
	branch: z.string(),
	pr_number: z.number().int().positive(),
	title: z.string(),
	url: z.string(),
	head_ref_name: z.string(),
	base_ref_name: z.string(),
});

const ambiguousBranchPrEntrySchema = z.looseObject({
	branch: z.string(),
});

const mapBranchPrsDataSchema = z.looseObject({
	branchPrs: z.array(branchPrEntrySchema),
	missingBranches: z.array(z.string()).optional(),
	ambiguousBranches: z.array(ambiguousBranchPrEntrySchema).optional(),
});

type BranchPrEntry = z.output<typeof branchPrEntrySchema>;
type MapBranchPrsData = z.output<typeof mapBranchPrsDataSchema>;
interface StackFeedbackDownload {
	entry: BranchPrEntry;
	bodyMarkdown: string;
	counts: PrFeedbackDownloadCounts;
}

export const prExtensionParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: PR_DOWNLOAD_FEEDBACK_COMMAND_NAME,
		workflow: "Download current PR feedback into the Pi editor as a report",
		parity: "FULL",
		cli: "ns address exec download-feedback",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi",
		sourceModule: "pr",
		notes: "Pi owns editor prefill; pr-address owns portable collection and Markdown rendering.",
	},
	{
		kind: "command",
		surface: PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME,
		workflow:
			"Download every PR's feedback from the current Graphite downstack into the Pi editor as one report",
		parity: "FULL",
		cli: "ns slot gt exec stack-branches --downstack + ns address exec map-branch-prs + ns address exec download-feedback",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi",
		sourceModule: "pr",
		notes:
			"Pi orchestrates stack discovery and editor prefill; slot owns Graphite stack discovery and pr-address owns PR feedback collection/Markdown rendering.",
	},
] as const);

export interface ExtensionContext {
	cwd: string;
	hasUI?: boolean;
	ui?: {
		notify?(message: string, level?: NotifyLevel): void;
		setStatus?(key: string, value: string | undefined): void;
		setEditorText?(text: string): void;
		custom?<T>(
			factory: (
				tui: TUI,
				theme: Theme,
				keybindings: unknown,
				done: (value: T) => void,
			) => Component,
			options?: unknown,
		): Promise<T>;
	};
	waitForIdle?(): Promise<void>;
	isIdle?(): boolean;
	sessionManager?: {
		getBranch?(): readonly SessionEntry[];
		getEntries?(): readonly SessionEntry[];
	};
}

interface SessionEntry {
	type: string;
	customType?: string;
	data?: unknown;
}

export interface RegisteredCommand {
	description?: string;
	handler(args: string, ctx: ExtensionContext): Promise<void> | void;
}

interface CustomMessage {
	customType: string;
	content: string;
	display: boolean;
	details?: unknown;
}

export interface ExtensionAPI {
	registerCommand(name: string, command: RegisteredCommand): void;
	on(
		event: "session_start",
		handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void,
	): void;
	on(event: "agent_end" | "session_shutdown", handler: () => Promise<void> | void): void;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	sendUserMessage?(content: string, options?: unknown): void;
	sendMessage?(message: CustomMessage, options?: unknown): void;
	appendEntry?(customType: string, data?: unknown): void;
}

export default function prExtension(pi: ExtensionAPI): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: PR_DOWNLOAD_FEEDBACK_COMMAND_NAME,
		commandDefinition: {
			description: "Download current PR feedback into the editor as a report.",
			handler: async (rawArgs, ctx) => {
				await runPrDownloadFeedbackCommand(pi, rawArgs, ctx);
			},
		},
	});
	registerCommandWithImmediateAck({
		host: pi,
		commandName: PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME,
		commandDefinition: {
			description:
				"Download feedback from every PR in the current Graphite downstack into the editor as a report.",
			handler: async (rawArgs, ctx) => {
				await runPrDownloadStackFeedbackCommand(pi, rawArgs, ctx);
			},
		},
	});
}

async function runPrDownloadFeedbackCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: ExtensionContext,
): Promise<void> {
	const parsedArgs = parseOptionalPrNumberArgs(rawArgs, "Usage: /pr:download-feedback [pr-number]");
	if (parsedArgs.type === "invalid") {
		notify(ctx, parsedArgs.message, "error");
		return;
	}

	ctx.ui?.setStatus?.(DOWNLOAD_FEEDBACK_STATUS_KEY, "PR feedback: downloading…");
	try {
		const prNumber = parsedArgs.prNumber;
		const downloaded = await downloadPrFeedback({
			pi,
			cwd: ctx.cwd,
			...optionalEntry("prNumber", prNumber),
			timeoutMs: COMMAND_TIMEOUT_MS,
			shouldAllowFailureData: true,
		});
		if (downloaded.type === "error") {
			notify(ctx, downloaded.message, "error");
			return;
		}

		const message =
			downloaded.exitCode === 0
				? "Downloaded PR feedback into the editor. Review/edit, then press Enter."
				: "Downloaded PR feedback report into the editor. Review/edit, then press Enter.";
		prefillEditor(ctx, appendAddressingFollowUp(downloaded.data.markdown), message);
	} finally {
		ctx.ui?.setStatus?.(DOWNLOAD_FEEDBACK_STATUS_KEY, undefined);
	}
}

async function runPrDownloadStackFeedbackCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: ExtensionContext,
): Promise<void> {
	const parsedArgs = parseNoArgs(rawArgs, "Usage: /pr:download-stack-feedback");
	if (parsedArgs.type === "invalid") {
		notify(ctx, parsedArgs.message, "error");
		return;
	}

	ctx.ui?.setStatus?.(DOWNLOAD_STACK_FEEDBACK_STATUS_KEY, "PR stack feedback: discovering stack…");
	try {
		const stackBranches = await loadStackBranches(pi, ctx);
		if (stackBranches.type === "error") {
			notify(ctx, stackBranches.message, "error");
			return;
		}
		if (stackBranches.branches.length === 0) {
			notify(ctx, "No Graphite downstack branches found for the current checkout.", "warning");
			return;
		}

		ctx.ui?.setStatus?.(
			DOWNLOAD_STACK_FEEDBACK_STATUS_KEY,
			`PR stack feedback: mapping ${stackBranches.branches.length} branches…`,
		);
		const mapped = await mapStackBranchesToPrs(pi, ctx, stackBranches.branches);
		if (mapped.type === "error") {
			notify(ctx, mapped.message, "error");
			return;
		}
		if (mapped.entries.length === 0) {
			notify(ctx, "No open PRs found for the current Graphite downstack branches.", "warning");
			return;
		}

		const downloads: StackFeedbackDownload[] = [];
		for (const [index, entry] of mapped.entries.entries()) {
			ctx.ui?.setStatus?.(
				DOWNLOAD_STACK_FEEDBACK_STATUS_KEY,
				`PR stack feedback: downloading ${index + 1}/${mapped.entries.length} (#${entry.pr_number})…`,
			);
			const downloaded = await downloadFeedbackForPr(pi, ctx, entry);
			if (downloaded.type === "error") {
				notify(ctx, downloaded.message, "error");
				return;
			}
			downloads.push(downloaded.value);
		}

		const markdown = buildStackDownloadFeedbackMarkdown(downloads, {
			missingBranches: mapped.missingBranches,
		});
		prefillEditor(
			ctx,
			appendAddressingFollowUp(markdown),
			stackDownloadCompleteMessage(downloads.length, mapped.missingBranches),
		);
	} finally {
		ctx.ui?.setStatus?.(DOWNLOAD_STACK_FEEDBACK_STATUS_KEY, undefined);
	}
}

type ParsedDownloadFeedbackArgs =
	| { type: "valid"; args: string[]; prNumber?: number }
	| { type: "invalid"; message: string };

export type CommandResult<T> = { type: "ok"; value: T } | { type: "error"; message: string };

function parseOptionalPrNumberArgs(rawArgs: string, usage: string): ParsedDownloadFeedbackArgs {
	const parsed = parseCliCommandArgs(rawArgs);
	if (!parsed.ok) return { type: "invalid", message: parsed.error };
	if (parsed.args.length === 0) return { type: "valid", args: [] };
	const prNumberToken = parsed.args[0] ?? "";
	if (parsed.args.length === 1 && isPositiveIntegerToken(prNumberToken))
		return { type: "valid", args: ["--pr-number", prNumberToken], prNumber: Number(prNumberToken) };
	return { type: "invalid", message: usage };
}

function parseNoArgs(
	rawArgs: string,
	usage: string,
): { type: "valid" } | { type: "invalid"; message: string } {
	const parsed = parseCliCommandArgs(rawArgs);
	if (!parsed.ok) return { type: "invalid", message: parsed.error };
	if (parsed.args.length === 0) return { type: "valid" };
	return { type: "invalid", message: usage };
}

function isPositiveIntegerToken(value: string): boolean {
	if (!/^\d+$/u.test(value)) return false;
	const number = Number(value);
	return Number.isSafeInteger(number) && number > 0;
}

async function loadStackBranches(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): Promise<{ type: "ok"; branches: string[] } | { type: "error"; message: string }> {
	const result = await pi.exec(
		"ns",
		["slot", "gt", "exec", "stack-branches", "--downstack", "--format", "json"],
		{
			cwd: ctx.cwd,
			timeout: STACK_DISCOVERY_TIMEOUT_MS,
		},
	);
	const parsed = parseEnvelopeWithSchema({
		label: "ns slot gt exec stack-branches",
		result,
		schema: stackBranchesDataSchema,
		allowFailureData: true,
	});
	if (parsed.type === "error") return parsed;
	return { type: "ok", branches: parsed.value.branches };
}

async function mapStackBranchesToPrs(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	branches: readonly string[],
): Promise<
	| { type: "ok"; entries: BranchPrEntry[]; missingBranches: string[] }
	| { type: "error"; message: string }
> {
	const branchesJson = JSON.stringify({ branches });
	const result = await pi.exec(
		"ns",
		["address", "exec", "map-branch-prs", "--branches-json", branchesJson, "--format", "json"],
		{ cwd: ctx.cwd, timeout: COMMAND_TIMEOUT_MS },
	);
	const parsed = parseEnvelopeWithSchema({
		label: "ns address exec map-branch-prs",
		result,
		schema: mapBranchPrsDataSchema,
		// map-branch-prs uses exit 1 for partial branch coverage; stack feedback can
		// still download the mapped PRs and note branches without open PRs.
		allowFailureData: true,
	});
	if (parsed.type === "error") return parsed;
	const ambiguousBranchNames = branchNames(parsed.value.ambiguousBranches ?? []);
	if (ambiguousBranchNames.length > 0) {
		return {
			type: "error",
			message: `Cannot download stack feedback because multiple open PRs matched branches: ${ambiguousBranchNames.join(", ")}`,
		};
	}
	return {
		type: "ok",
		entries: parsed.value.branchPrs,
		missingBranches: parsed.value.missingBranches ?? [],
	};
}

function branchNames(entries: NonNullable<MapBranchPrsData["ambiguousBranches"]>): string[] {
	return entries.map((entry) => entry.branch);
}

async function downloadFeedbackForPr(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	entry: BranchPrEntry,
): Promise<CommandResult<StackFeedbackDownload>> {
	const downloaded = await downloadPrFeedback({
		pi,
		cwd: ctx.cwd,
		prNumber: entry.pr_number,
		timeoutMs: COMMAND_TIMEOUT_MS,
		shouldAllowFailureData: true,
	});
	if (downloaded.type === "error") return { type: "error", message: downloaded.message };
	return {
		type: "ok",
		value: { entry, bodyMarkdown: downloaded.data.bodyMarkdown, counts: downloaded.data.counts },
	};
}

export interface EnvelopeWithSchemaOptions<T> {
	label: string;
	result: ExecResult;
	schema: z.ZodType<T>;
	allowFailureData?: boolean;
}

function parseEnvelopeWithSchema<T>(options: EnvelopeWithSchemaOptions<T>): CommandResult<T> {
	const parsed = parseMachineEnvelopeDataWithFailureData(options.result.stdout, {
		label: options.label,
		stdoutTail: { maxLines: 20, maxChars: 2000 },
		...optionalEntry("shouldAllowFailureData", options.allowFailureData),
	});
	if (parsed.type === "invalid") {
		return { type: "error", message: envelopeDetail(parsed, options.result) };
	}

	const schemaResult = options.schema.safeParse(parsed.data);
	if (!schemaResult.success)
		return { type: "error", message: schemaError(options.label, schemaResult.error) };
	return { type: "ok", value: schemaResult.data };
}

function appendAddressingFollowUp(markdown: string): string {
	return `${markdown.trimEnd()}\n\n${ADDRESSING_FOLLOW_UP}`;
}

function buildStackDownloadFeedbackMarkdown(
	downloads: readonly StackFeedbackDownload[],
	options: { missingBranches?: readonly string[] } = {},
): string {
	const missingBranches = options.missingBranches ?? [];
	return [
		"# PR stack feedback report",
		"",
		"Downloaded PR feedback for the current Graphite downstack is below.",
		"",
		"## Stack PRs",
		...downloads.map(
			({ entry }) => `- #${entry.pr_number} ${entry.branch}: ${entry.title} (${entry.url})`,
		),
		...renderMissingStackBranches(missingBranches),
		"",
		"## Feedback by PR",
		...downloads.flatMap(({ entry, bodyMarkdown }) => [
			"",
			`## PR #${entry.pr_number}: ${entry.title}`,
			`- Branch: ${entry.branch}`,
			`- URL: ${entry.url}`,
			"",
			...demoteMarkdownHeadings(bodyMarkdown).split("\n"),
		]),
		"",
		...renderStackDownloadFeedbackSummary(downloads, missingBranches),
	].join("\n");
}

function renderStackDownloadFeedbackSummary(
	downloads: readonly StackFeedbackDownload[],
	missingBranches: readonly string[],
): string[] {
	const totals = sumDownloadFeedbackCounts(downloads);
	return [
		"## Summary",
		`Downloaded feedback for ${downloads.length} ${downloads.length === 1 ? "PR" : "PRs"} in the current Graphite downstack.`,
		"",
		"Stack PRs:",
		...downloads.map(
			({ entry }) => `- #${entry.pr_number} ${entry.branch}: ${entry.title} (${entry.url})`,
		),
		...renderMissingStackBranches(missingBranches),
		"",
		"Totals:",
		`- Unresolved review threads included: ${totals.includedReviewThreads}`,
		`- PR-level review bodies included: ${totals.includedReviews}`,
		`- Discussion comments included: ${totals.includedDiscussionComments}`,
		`- Resolved review threads excluded: ${totals.excludedResolvedThreads}`,
		`- Empty PR-level reviews excluded: ${totals.excludedEmptyReviews}`,
		`- Automation-like discussion comments excluded: ${totals.excludedAutomationComments}`,
	];
}

function renderMissingStackBranches(missingBranches: readonly string[]): string[] {
	if (missingBranches.length === 0) return [];
	return ["", "Branches without open PRs:", ...missingBranches.map((branch) => `- ${branch}`)];
}

function stackDownloadCompleteMessage(
	downloadCount: number,
	missingBranches: readonly string[],
): string {
	if (missingBranches.length === 0)
		return "Downloaded PR stack feedback into the editor. Review/edit, then press Enter.";
	return `Downloaded PR stack feedback for ${downloadCount} ${downloadCount === 1 ? "PR" : "PRs"} into the editor; skipped ${missingBranches.length} ${missingBranches.length === 1 ? "branch" : "branches"} without an open PR: ${missingBranches.join(", ")}. Review/edit, then press Enter.`;
}

function sumDownloadFeedbackCounts(
	downloads: readonly StackFeedbackDownload[],
): PrFeedbackDownloadCounts {
	return downloads.reduce<PrFeedbackDownloadCounts>(
		(totals, download) => ({
			includedReviewThreads: totals.includedReviewThreads + download.counts.includedReviewThreads,
			includedReviews: totals.includedReviews + download.counts.includedReviews,
			includedDiscussionComments:
				totals.includedDiscussionComments + download.counts.includedDiscussionComments,
			excludedResolvedThreads:
				totals.excludedResolvedThreads + download.counts.excludedResolvedThreads,
			excludedEmptyReviews: totals.excludedEmptyReviews + download.counts.excludedEmptyReviews,
			excludedAutomationComments:
				totals.excludedAutomationComments + download.counts.excludedAutomationComments,
		}),
		{
			includedReviewThreads: 0,
			includedReviews: 0,
			includedDiscussionComments: 0,
			excludedResolvedThreads: 0,
			excludedEmptyReviews: 0,
			excludedAutomationComments: 0,
		},
	);
}

function demoteMarkdownHeadings(markdown: string): string {
	return markdown
		.split(/\r\n|\r|\n/u)
		.map((line) => (line.startsWith("#") ? `#${line}` : line))
		.join("\n");
}

function envelopeDetail(parsed: { message: string }, result: ExecResult): string {
	const stderr = result.stderr.trim();
	return stderr === "" ? parsed.message : `${parsed.message}\n${stderr}`;
}

function schemaError(label: string, error: z.ZodError): string {
	return `${label} returned unexpected data: ${formatZodError(error, { rootPath: null })}`;
}

function prefillEditor(ctx: ExtensionContext, markdown: string, message: string): void {
	if (ctx.ui?.setEditorText === undefined) {
		notify(ctx, "This Pi runtime cannot prefill editor text.", "error");
		return;
	}
	ctx.ui.setEditorText(markdown);
	notify(ctx, message, "info");
}

function notify(ctx: ExtensionContext, message: string, level: NotifyLevel): void {
	ctx.ui?.notify?.(message, level);
}
