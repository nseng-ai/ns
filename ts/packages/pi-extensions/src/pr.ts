import { parseCliCommandArgs } from "./cli-command-extension.ts";
import { parseMachineEnvelopeData } from "./machine-envelope.ts";
import { definePiSurfaceParity } from "./parity.ts";

export const PR_DOWNLOAD_FEEDBACK_COMMAND_NAME = "pr:download-feedback";

const STATUS_KEY = PR_DOWNLOAD_FEEDBACK_COMMAND_NAME;
const COMMAND_TIMEOUT_MS = 60_000;

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
}

async function runPrDownloadFeedbackCommand(pi: ExtensionAPI, rawArgs: string, ctx: ExtensionContext): Promise<void> {
	const parsedArgs = parseDownloadFeedbackArgs(rawArgs);
	if (parsedArgs.type === "invalid") {
		notify(ctx, parsedArgs.message, "error");
		return;
	}

	ctx.ui?.setStatus?.(STATUS_KEY, "PR feedback: downloading…");
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

		const detail = result.stderr.trim() === "" ? parsed.message : `${parsed.message}\n${result.stderr.trim()}`;
		notify(ctx, detail, "error");
	} finally {
		ctx.ui?.setStatus?.(STATUS_KEY, undefined);
	}
}

type ParsedDownloadFeedbackArgs = { type: "valid"; args: string[] } | { type: "invalid"; message: string };

function parseDownloadFeedbackArgs(rawArgs: string): ParsedDownloadFeedbackArgs {
	const parsed = parseCliCommandArgs(rawArgs);
	if (!parsed.ok) return { type: "invalid", message: parsed.error };
	if (parsed.args.length === 0) return { type: "valid", args: [] };
	if (parsed.args.length === 1 && isPositiveIntegerToken(parsed.args[0] ?? "")) return { type: "valid", args: ["--pr-number", parsed.args[0] ?? ""] };
	return { type: "invalid", message: "Usage: /pr:download-feedback [pr-number]" };
}

function isPositiveIntegerToken(value: string): boolean {
	if (!/^\d+$/u.test(value)) return false;
	const number = Number(value);
	return Number.isSafeInteger(number) && number > 0;
}

function markdownFromData(data: Record<string, unknown>): string | undefined {
	return typeof data.markdown === "string" ? data.markdown : undefined;
}

function markdownFromNegativeEnvelope(stdout: string): string | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed) || parsed.exit_code !== 1 || !isRecord(parsed.data)) return undefined;
	return markdownFromData(parsed.data);
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
