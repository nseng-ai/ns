import { completeSimple } from "@earendil-works/pi-ai";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createCommitWithPreparedMessage,
	prepareCheckpointMessage,
	type CommandResult,
	type DraftCheckpointRequest,
} from "./checkpoint-flow.ts";
import type { PendingWorktreeSnapshot } from "./pending-worktree.ts";

const HARNESS_ENV = "PI_CP_HARNESS";
const DEFAULT_HARNESS = "gpt-nano-pi";
const OPENAI_PROVIDER = "openai";
const GPT_NANO_MODEL = "gpt-5.4-nano";
const GPT_NANO_MODEL_LABEL = "GPT-5.4 Nano";
const CODEX_PROVIDER = "openai-codex";
const CODEX_MODEL = "gpt-5.4-mini";
const CODEX_MODEL_LABEL = "GPT-5.4 Mini via Codex";
const CLAUDE_CLI_MODEL = "claude-haiku-4-5";
const CLAUDE_CLI_LABEL = "Claude CLI";
const SPINNER_STATUS_KEY = "cp";
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SYSTEM_PROMPT = `You write terse checkpoint commit messages for coding agents.

Given git status and diff, output exactly one git commit message:
- Subject line first, prefixed with "[cp]".
- Subject must be at most 52 characters total. Shorter is better. Use imperative mood with no trailing period.
- Then one blank line.
- Then 1 to 3 bullet lines, each starting with "- ".
- No prose paragraphs, no markdown headers, no code fences, no trailers.
- No Co-Authored-By trailer.
- Mention untracked files by filename when they matter.
- Optimize for later agents scanning git log, not for a polished PR description.`;

type DraftHarness = "gpt-nano-pi" | "codex-pi" | "claude-cli";
type NotifyLevel = "info" | "warning" | "error";

type ModelAuth =
	| { ok: true; apiKey?: string; headers?: Record<string, string> }
	| { ok: false; error: string };

type ModelRegistryLike = {
	find(provider: string, modelId: string): unknown | undefined;
	getApiKeyAndHeaders(model: unknown): Promise<ModelAuth>;
};

export type ExtensionCommandContext = {
	cwd: string;
	modelRegistry: ModelRegistryLike;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
		theme?: {
			fg(color: string, text: string): string;
		};
	};
	waitForIdle(): Promise<void>;
};

export type ExtensionAPI = {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: ExtensionCommandContext): Promise<void> | void;
		},
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<CommandResult>;
};

export type PreparedCheckpointMessage =
	| { ok: true; message: string; source: "model" | "repaired_model" | "fallback"; feedback?: string }
	| { ok: false; error: string };

export async function prepareCheckpointMessageForPi(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
): Promise<PreparedCheckpointMessage> {
	const harness = selectDraftHarness();
	if ("error" in harness) {
		return { ok: false, error: harness.error };
	}

	const prepared = await prepareCheckpointMessage({
		status: snapshot.status,
		diff: snapshot.diff,
		draft: (request) => draftWithHarness(pi, ctx, harness.value, request),
	});
	if (prepared.ok) {
		notifyPreparationSource(ctx, prepared.source, prepared.feedback);
	}
	return prepared;
}

export async function commitPreparedCheckpointMessage(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
	message: string,
): Promise<{ summary: string } | { error: string }> {
	return createCommitWithPreparedMessage({
		cwd,
		message,
		exec: (command, args, commandCwd, timeout) => exec(pi, command, args, commandCwd, timeout),
	});
}

function selectDraftHarness(): { value: DraftHarness } | { error: string } {
	const configured = process.env[HARNESS_ENV]?.trim() || DEFAULT_HARNESS;
	if (configured === "gpt-nano-pi" || configured === "codex-pi" || configured === "claude-cli") {
		return { value: configured };
	}

	return {
		error: `Invalid ${HARNESS_ENV}=${JSON.stringify(configured)}. Valid values: gpt-nano-pi, codex-pi, claude-cli.`,
	};
}

async function draftWithHarness(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	harness: DraftHarness,
	request: DraftCheckpointRequest,
): Promise<{ output: string } | { error: string }> {
	if (harness === "gpt-nano-pi") {
		return draftWithGptNanoPi(ctx, request);
	}
	if (harness === "codex-pi") {
		return draftWithCodexPi(ctx, request);
	}
	return draftWithClaudeCli(pi, ctx, request);
}

async function draftWithGptNanoPi(
	ctx: ExtensionCommandContext,
	request: DraftCheckpointRequest,
): Promise<{ output: string } | { error: string }> {
	return draftWithPiModel(ctx, {
		provider: OPENAI_PROVIDER,
		modelId: GPT_NANO_MODEL,
		label: GPT_NANO_MODEL_LABEL,
		authLabel: "OpenAI",
		reasoning: "low",
		request,
	});
}

async function draftWithCodexPi(
	ctx: ExtensionCommandContext,
	request: DraftCheckpointRequest,
): Promise<{ output: string } | { error: string }> {
	return draftWithPiModel(ctx, {
		provider: CODEX_PROVIDER,
		modelId: CODEX_MODEL,
		label: CODEX_MODEL_LABEL,
		authLabel: "Codex",
		reasoning: "minimal",
		request,
	});
}

async function draftWithPiModel(
	ctx: ExtensionCommandContext,
	options: {
		provider: string;
		modelId: string;
		label: string;
		authLabel: string;
		reasoning: "minimal" | "low";
		request: DraftCheckpointRequest;
	},
): Promise<{ output: string } | { error: string }> {
	const model = ctx.modelRegistry.find(options.provider, options.modelId);
	if (!model) {
		return { error: `Could not find Pi model ${options.provider}/${options.modelId}.` };
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) {
		return { error: `${options.authLabel} auth failed: ${auth.error}` };
	}
	if (!auth.apiKey) {
		return { error: `No ${options.authLabel} auth found for ${options.provider}. Run /login or configure Pi auth.` };
	}

	try {
		const action = options.request.previousDraft ? "Repairing" : "Drafting";
		const completionOptions = {
			...(auth.headers ? { headers: auth.headers } : {}),
			apiKey: auth.apiKey,
			maxTokens: 512,
			reasoning: options.reasoning,
			timeoutMs: 120_000,
		};
		const response = await withSpinner(ctx, `${action} checkpoint message with ${options.label}…`, () =>
			completeSimple(
				model,
				{
					systemPrompt: SYSTEM_PROMPT,
					messages: [
						{
							role: "user",
							content: [{ type: "text", text: buildUserPrompt(options.request) }],
							timestamp: Date.now(),
						},
					],
				},
				completionOptions,
			),
		);

		if (response.stopReason === "error" || response.stopReason === "aborted") {
			return { error: `${options.label} failed to draft a checkpoint message: ${response.errorMessage ?? response.stopReason}` };
		}

		const output = response.content
			.filter((content): content is { type: "text"; text: string } => content.type === "text" && typeof content.text === "string")
			.map((content) => content.text)
			.join("\n");
		if (output.trim().length === 0) {
			return { error: `${options.label} returned an empty checkpoint message.` };
		}

		return { output };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { error: `${options.label} failed to draft a checkpoint message: ${message}` };
	}
}

async function draftWithClaudeCli(
	pi: Pick<ExtensionAPI, "exec">,
	ctx: ExtensionCommandContext,
	request: DraftCheckpointRequest,
): Promise<{ output: string } | { error: string }> {
	const tempDir = await mkdtemp(join(tmpdir(), "pi-cp-"));
	try {
		const systemPromptPath = join(tempDir, "system-prompt.txt");
		const userPromptPath = join(tempDir, "user-prompt.txt");
		await writeFile(systemPromptPath, SYSTEM_PROMPT, "utf8");
		await writeFile(userPromptPath, buildUserPrompt(request), "utf8");

		const action = request.previousDraft ? "Repairing" : "Drafting";
		const result = await withSpinner(ctx, `${action} checkpoint message with ${CLAUDE_CLI_LABEL}…`, () =>
			exec(
				pi,
				"bash",
				[
					"-lc",
					'env -u CLAUDECODE claude -p --model "$1" --output-format text --system-prompt "$(cat \"$2\")" < "$3"',
					"bash",
					CLAUDE_CLI_MODEL,
					systemPromptPath,
					userPromptPath,
				],
				ctx.cwd,
				120_000,
			),
		);
		if (result.code !== 0) {
			return { error: formatCommandError(`${CLAUDE_CLI_LABEL} failed to draft a checkpoint message.`, result) };
		}

		return { output: result.stdout };
	} finally {
		await rm(tempDir, { force: true, recursive: true });
	}
}

function buildUserPrompt(input: DraftCheckpointRequest): string {
	const base = `Draft a checkpoint commit message for this pending git state.\n\n## git status --porcelain\n\n${input.status.trim() || "(clean)"}\n\n## git diff HEAD\n\n${input.diff.trim() || "(no tracked diff; rely on untracked filenames in status)"}\n`;
	if (!input.previousDraft || !input.validationFeedback) {
		return base;
	}
	return `${base}\n## previous invalid draft\n\n${input.previousDraft.trim()}\n\n## deterministic validation feedback\n\n${input.validationFeedback}\n\nRewrite the checkpoint message so it satisfies every validation rule. Return only the corrected commit message.\n`;
}

function notifyPreparationSource(
	ctx: ExtensionCommandContext,
	source: "model" | "repaired_model" | "fallback",
	feedback: string | undefined,
): void {
	if (source === "repaired_model") {
		ctx.ui.notify("Checkpoint message repaired after validation feedback.", "info");
		return;
	}
	if (source === "fallback") {
		ctx.ui.notify(
			[
				"Using deterministic fallback checkpoint message after validation failure.",
				conciseFeedback(feedback),
			]
				.filter(Boolean)
				.join("\n"),
			"warning",
		);
	}
}

function conciseFeedback(feedback: string | undefined): string | undefined {
	if (!feedback) {
		return undefined;
	}
	return feedback.split("\n").filter(Boolean).slice(0, 5).join("\n");
}

async function withSpinner<T>(
	ctx: ExtensionCommandContext,
	message: string,
	operation: () => Promise<T>,
): Promise<T> {
	let frameIndex = 0;
	const render = () => {
		const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
		frameIndex += 1;
		const status = `${frame} ${message}`;
		ctx.ui.setStatus(SPINNER_STATUS_KEY, ctx.ui.theme?.fg("accent", status) ?? status);
	};

	render();
	const timer = setInterval(render, 120);
	try {
		return await operation();
	} finally {
		clearInterval(timer);
		ctx.ui.setStatus(SPINNER_STATUS_KEY, undefined);
	}
}

async function exec(
	pi: Pick<ExtensionAPI, "exec">,
	command: string,
	args: string[],
	cwd: string,
	timeout: number,
): Promise<CommandResult> {
	return pi.exec(command, args, { cwd, timeout });
}

function formatCommandError(summary: string, result: CommandResult): string {
	const details = result.stderr.trim() || result.stdout.trim();
	const killed = result.killed ? " (killed or timed out)" : "";
	return [summary, details ? `exit ${result.code}${killed}: ${details}` : `exit ${result.code}${killed}`].filter(Boolean).join("\n");
}
