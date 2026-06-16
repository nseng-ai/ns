import { z } from "zod";

import { parseCliCommandArgs } from "./cli-command-extension.ts";
import { parseMachineEnvelopeData } from "./machine-envelope.ts";
import { definePiSurfaceParity } from "./parity.ts";

export const PR_DOWNLOAD_FEEDBACK_COMMAND_NAME = "pr:download-feedback";
export const PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME = "pr:download-stack-feedback";

const DOWNLOAD_FEEDBACK_STATUS_KEY = PR_DOWNLOAD_FEEDBACK_COMMAND_NAME;
const DOWNLOAD_STACK_FEEDBACK_STATUS_KEY = PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME;
const COMMAND_TIMEOUT_MS = 60_000;
const STACK_DISCOVERY_TIMEOUT_MS = 120_000;

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

const mapBranchPrsDataSchema = z.looseObject({
	branch_prs: z.array(branchPrEntrySchema),
});

type BranchPrEntry = z.output<typeof branchPrEntrySchema>;

interface StackFeedbackDownload {
	entry: BranchPrEntry;
	markdown: string;
}

export const prExtensionParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: PR_DOWNLOAD_FEEDBACK_COMMAND_NAME,
		workflow: "Download current PR feedback into the Pi editor as a triage prompt",
		parity: "FULL",
		cli: "pr-address exec download-feedback",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "pr",
		notes: "Pi owns editor prefill; pr-address owns portable collection and Markdown rendering.",
	},
	{
		kind: "command",
		surface: PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME,
		workflow: "Download every PR's feedback from the current Graphite stack into the Pi editor as one triage prompt",
		parity: "FULL",
		cli: "slot gt exec stack-branches + pr-address exec map-branch-prs + pr-address exec download-feedback",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "pr",
		notes: "Pi orchestrates stack discovery and editor prefill; slot owns Graphite stack discovery and pr-address owns PR feedback collection/Markdown rendering.",
	},
] as const);

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed?: boolean;
}

interface ExecOptions {
	cwd?: string;
	timeout?: number;
	signal?: AbortSignal;
}

export interface ExtensionContext {
	cwd: string;
	hasUI?: boolean;
	ui?: {
		notify?(message: string, level?: "info" | "warning" | "error"): void;
		setStatus?(key: string, value: string | undefined): void;
		setEditorText?(text: string): void;
	};
}

export interface RegisteredCommand {
	description?: string;
	handler(args: string, ctx: ExtensionContext): Promise<void> | void;
}

export interface ExtensionAPI {
	registerCommand(name: string, command: RegisteredCommand): void;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	sendUserMessage?(content: string, options?: unknown): void;
}

export default function prExtension(pi: ExtensionAPI): void {
	pi.registerCommand(PR_DOWNLOAD_FEEDBACK_COMMAND_NAME, {
		description: "Download current PR feedback into the editor as a triage prompt.",
		handler: async (rawArgs, ctx) => {
			await runPrDownloadFeedbackCommand(pi, rawArgs, ctx);
		},
	});
	pi.registerCommand(PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME, {
		description: "Download feedback from every PR in the current Graphite stack into the editor as a triage prompt.",
		handler: async (rawArgs, ctx) => {
			await runPrDownloadStackFeedbackCommand(pi, rawArgs, ctx);
		},
	});
}

async function runPrDownloadFeedbackCommand(pi: ExtensionAPI, rawArgs: string, ctx: ExtensionContext): Promise<void> {
	const parsedArgs = parseDownloadFeedbackArgs(rawArgs);
	if (parsedArgs.type === "invalid") {
		notify(ctx, parsedArgs.message, "error");
		return;
	}

	ctx.ui?.setStatus?.(DOWNLOAD_FEEDBACK_STATUS_KEY, "PR feedback: downloading…");
	try {
		const args = ["exec", "download-feedback", ...parsedArgs.args, "--format", "json"];
		const result = await pi.exec("pr-address", args, { cwd: ctx.cwd, timeout: COMMAND_TIMEOUT_MS });
		const parsed = parseMachineEnvelopeData(result.stdout, { label: "pr-address download-feedback", stdoutTail: { maxLines: 20, maxChars: 2000 } });
		if (parsed.type === "valid") {
			const markdown = markdownFromData(parsed.data);
			if (markdown === undefined) {
				notify(ctx, "pr-address download-feedback returned no markdown field.", "error");
				return;
			}
			prefillEditor(ctx, markdown, "Downloaded PR feedback into the editor. Review/edit, then press Enter.");
			return;
		}

		const negativeMarkdown = markdownFromNegativeEnvelope(result.stdout);
		if (negativeMarkdown !== undefined) {
			prefillEditor(ctx, negativeMarkdown, "Downloaded PR feedback report into the editor. Review/edit, then press Enter.");
			return;
		}

		notify(ctx, envelopeDetail(parsed, result), "error");
	} finally {
		ctx.ui?.setStatus?.(DOWNLOAD_FEEDBACK_STATUS_KEY, undefined);
	}
}

async function runPrDownloadStackFeedbackCommand(pi: ExtensionAPI, rawArgs: string, ctx: ExtensionContext): Promise<void> {
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
			notify(ctx, "No Graphite stack branches found for the current checkout.", "warning");
			return;
		}

		ctx.ui?.setStatus?.(DOWNLOAD_STACK_FEEDBACK_STATUS_KEY, `PR stack feedback: mapping ${stackBranches.branches.length} branches…`);
		const mapped = await mapStackBranchesToPrs(pi, ctx, stackBranches.branches);
		if (mapped.type === "error") {
			notify(ctx, mapped.message, "error");
			return;
		}
		if (mapped.entries.length === 0) {
			notify(ctx, "No open PRs found for the current Graphite stack branches.", "warning");
			return;
		}

		const downloads: StackFeedbackDownload[] = [];
		for (const [index, entry] of mapped.entries.entries()) {
			ctx.ui?.setStatus?.(DOWNLOAD_STACK_FEEDBACK_STATUS_KEY, `PR stack feedback: downloading ${index + 1}/${mapped.entries.length} (#${entry.pr_number})…`);
			const downloaded = await downloadFeedbackForPr(pi, ctx, entry);
			if (downloaded.type === "error") {
				notify(ctx, downloaded.message, "error");
				return;
			}
			downloads.push(downloaded.value);
		}

		const markdown = buildStackDownloadFeedbackMarkdown(downloads);
		prefillEditor(ctx, markdown, "Downloaded PR stack feedback into the editor. Review/edit, then press Enter.");
	} finally {
		ctx.ui?.setStatus?.(DOWNLOAD_STACK_FEEDBACK_STATUS_KEY, undefined);
	}
}

type ParsedDownloadFeedbackArgs = { type: "valid"; args: string[] } | { type: "invalid"; message: string };

type CommandResult<T> = { type: "ok"; value: T } | { type: "error"; message: string };

function parseDownloadFeedbackArgs(rawArgs: string): ParsedDownloadFeedbackArgs {
	const parsed = parseCliCommandArgs(rawArgs);
	if (!parsed.ok) return { type: "invalid", message: parsed.error };
	if (parsed.args.length === 0) return { type: "valid", args: [] };
	if (parsed.args.length === 1 && isPositiveIntegerToken(parsed.args[0] ?? "")) return { type: "valid", args: ["--pr-number", parsed.args[0] ?? ""] };
	return { type: "invalid", message: "Usage: /pr:download-feedback [pr-number]" };
}

function parseNoArgs(rawArgs: string, usage: string): { type: "valid" } | { type: "invalid"; message: string } {
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

async function loadStackBranches(pi: ExtensionAPI, ctx: ExtensionContext): Promise<{ type: "ok"; branches: string[] } | { type: "error"; message: string }> {
	const result = await pi.exec("slot", ["gt", "exec", "stack-branches", "--format", "json"], { cwd: ctx.cwd, timeout: STACK_DISCOVERY_TIMEOUT_MS });
	const parsed = parseMachineEnvelopeData(result.stdout, { label: "slot gt exec stack-branches", stdoutTail: { maxLines: 20, maxChars: 2000 } });
	if (parsed.type !== "valid") {
		const negativeBranches = stackBranchesFromNegativeEnvelope(result.stdout);
		if (negativeBranches !== undefined) return { type: "ok", branches: negativeBranches };
		return { type: "error", message: envelopeDetail(parsed, result) };
	}
	const schemaResult = stackBranchesDataSchema.safeParse(parsed.data);
	if (!schemaResult.success) return { type: "error", message: schemaError("slot gt exec stack-branches", schemaResult.error) };
	return { type: "ok", branches: schemaResult.data.branches };
}

async function mapStackBranchesToPrs(pi: ExtensionAPI, ctx: ExtensionContext, branches: readonly string[]): Promise<{ type: "ok"; entries: BranchPrEntry[] } | { type: "error"; message: string }> {
	const branchesJson = JSON.stringify({ branches });
	const result = await pi.exec("pr-address", ["exec", "map-branch-prs", "--branches-json", branchesJson, "--format", "json", "--stdout-mode", "full"], { cwd: ctx.cwd, timeout: COMMAND_TIMEOUT_MS });
	const parsed = parseMachineEnvelopeData(result.stdout, { label: "pr-address map-branch-prs", stdoutTail: { maxLines: 20, maxChars: 2000 } });
	if (parsed.type !== "valid") return { type: "error", message: envelopeDetail(parsed, result) };
	const schemaResult = mapBranchPrsDataSchema.safeParse(parsed.data);
	if (!schemaResult.success) return { type: "error", message: schemaError("pr-address map-branch-prs", schemaResult.error) };
	return { type: "ok", entries: schemaResult.data.branch_prs };
}

async function downloadFeedbackForPr(pi: ExtensionAPI, ctx: ExtensionContext, entry: BranchPrEntry): Promise<CommandResult<StackFeedbackDownload>> {
	const result = await pi.exec("pr-address", ["exec", "download-feedback", "--pr-number", String(entry.pr_number), "--format", "json"], { cwd: ctx.cwd, timeout: COMMAND_TIMEOUT_MS });
	const parsed = parseMachineEnvelopeData(result.stdout, { label: `pr-address download-feedback #${entry.pr_number}`, stdoutTail: { maxLines: 20, maxChars: 2000 } });
	if (parsed.type === "valid") {
		const markdown = markdownFromData(parsed.data);
		if (markdown === undefined) return { type: "error", message: `pr-address download-feedback #${entry.pr_number} returned no markdown field.` };
		return { type: "ok", value: { entry, markdown } };
	}

	const negativeMarkdown = markdownFromNegativeEnvelope(result.stdout);
	if (negativeMarkdown !== undefined) return { type: "ok", value: { entry, markdown: negativeMarkdown } };
	return { type: "error", message: envelopeDetail(parsed, result) };
}

function markdownFromData(data: Record<string, unknown>): string | undefined {
	return typeof data.markdown === "string" ? data.markdown : undefined;
}

function markdownFromNegativeEnvelope(stdout: string): string | undefined {
	const data = dataFromNegativeEnvelope(stdout);
	return data === undefined ? undefined : markdownFromData(data);
}

function stackBranchesFromNegativeEnvelope(stdout: string): string[] | undefined {
	const data = dataFromNegativeEnvelope(stdout);
	if (data === undefined) return undefined;
	const schemaResult = stackBranchesDataSchema.safeParse(data);
	return schemaResult.success ? schemaResult.data.branches : undefined;
}

function dataFromNegativeEnvelope(stdout: string): Record<string, unknown> | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed) || parsed.exit_code !== 1 || !isRecord(parsed.data)) return undefined;
	return parsed.data;
}

function buildStackDownloadFeedbackMarkdown(downloads: readonly StackFeedbackDownload[]): string {
	return [
		"# PR stack feedback triage request",
		"",
		"Triage and group the feedback below across the entire Graphite stack. Identify shared fixes, per-PR fixes, ordering constraints, and ambiguous feedback. Do not edit files yet; propose a plan and wait for human confirmation. Do not resolve or reply to GitHub threads from this prompt.",
		"",
		"## Stack PRs",
		...downloads.map(({ entry }) => `- #${entry.pr_number} ${entry.branch}: ${entry.title} (${entry.url})`),
		"",
		"## Feedback by PR",
		...downloads.flatMap(({ entry, markdown }) => [
			"",
			`## PR #${entry.pr_number}: ${entry.title}`,
			`- Branch: ${entry.branch}`,
			`- URL: ${entry.url}`,
			"",
			...demoteMarkdownHeadings(stripPrDownloadHeading(markdown)).split("\n"),
		]),
	].join("\n");
}

function stripPrDownloadHeading(markdown: string): string {
	return markdown.replace(/^# PR feedback triage request(?:\r\n|\r|\n)+/u, "").trim();
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
	const issueText = error.issues.map((issue) => (issue.path.length === 0 ? issue.message : `${issue.path.join(".")}: ${issue.message}`)).join("; ");
	return `${label} returned unexpected data: ${issueText}`;
}

function prefillEditor(ctx: ExtensionContext, markdown: string, message: string): void {
	if (ctx.ui?.setEditorText === undefined) {
		notify(ctx, "This Pi runtime cannot prefill editor text.", "error");
		return;
	}
	ctx.ui.setEditorText(markdown);
	notify(ctx, message, "info");
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error"): void {
	ctx.ui?.notify?.(message, level);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
