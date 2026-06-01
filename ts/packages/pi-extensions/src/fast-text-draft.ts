import { completeSimple } from "@earendil-works/pi-ai";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandResult } from "./checkpoint-flow.ts";
import { truncateDisplayLine } from "./terminal-presentation.ts";

export const HARNESS_ENV = "PI_DRAFT_HARNESS";
export const DEFAULT_HARNESS = "codex-pi";

const OPENAI_PROVIDER = "openai";
const GPT_NANO_MODEL = "gpt-5.4-nano";
const GPT_NANO_MODEL_LABEL = "GPT-5.4 Nano";
const CODEX_PROVIDER = "openai-codex";
const CODEX_MODEL = "gpt-5.4-mini";
const CODEX_MODEL_LABEL = "GPT-5.4 Mini via Codex";
const CLAUDE_CLI_MODEL = "claude-haiku-4-5";
const CLAUDE_CLI_LABEL = "Claude CLI";
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DEFAULT_MAX_TOKENS = 512;

export type DraftHarness = "gpt-nano-pi" | "codex-pi" | "claude-cli";
export type NotifyLevel = "info" | "warning" | "error";

type WidgetPlacement = "aboveEditor" | "belowEditor";

type Theme = {
	fg(color: string, text: string): string;
};

type Component = {
	render(width: number): string[];
	invalidate(): void;
};

type WidgetContent = string[] | ((tui: unknown, theme: Theme) => Component) | undefined;

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
		setWidget?(key: string, value: WidgetContent, options?: { placement?: WidgetPlacement }): void;
		theme?: Theme;
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

export type FastTextDraftInput = {
	harness: DraftHarness;
	systemPrompt: string;
	userPrompt: string;
	spinnerKey: string;
	progressMessage: (harnessLabel: string) => string;
	taskNoun: string;
	maxTokens?: number;
};

type PiModelConfig = {
	provider: string;
	modelId: string;
	label: string;
	authLabel: string;
	reasoning: "minimal" | "low";
};

const GPT_NANO_CONFIG: PiModelConfig = {
	provider: OPENAI_PROVIDER,
	modelId: GPT_NANO_MODEL,
	label: GPT_NANO_MODEL_LABEL,
	authLabel: "OpenAI",
	reasoning: "low",
};

const CODEX_CONFIG: PiModelConfig = {
	provider: CODEX_PROVIDER,
	modelId: CODEX_MODEL,
	label: CODEX_MODEL_LABEL,
	authLabel: "Codex",
	reasoning: "minimal",
};

export function selectDraftHarness(): { value: DraftHarness } | { error: string } {
	const configured = process.env[HARNESS_ENV]?.trim() || DEFAULT_HARNESS;
	if (configured === "gpt-nano-pi" || configured === "codex-pi" || configured === "claude-cli") {
		return { value: configured };
	}

	return {
		error: `Invalid ${HARNESS_ENV}=${JSON.stringify(configured)}. Valid values: gpt-nano-pi, codex-pi, claude-cli.`,
	};
}

export async function draftWithFastText(
	pi: Pick<ExtensionAPI, "exec">,
	ctx: ExtensionCommandContext,
	input: FastTextDraftInput,
): Promise<{ output: string } | { error: string }> {
	if (input.harness === "gpt-nano-pi") {
		return draftWithPiModel(ctx, GPT_NANO_CONFIG, input);
	}
	if (input.harness === "codex-pi") {
		return draftWithPiModel(ctx, CODEX_CONFIG, input);
	}
	return draftWithClaudeCli(pi, ctx, input);
}

async function draftWithPiModel(
	ctx: ExtensionCommandContext,
	config: PiModelConfig,
	input: FastTextDraftInput,
): Promise<{ output: string } | { error: string }> {
	const model = ctx.modelRegistry.find(config.provider, config.modelId);
	if (!model) {
		return { error: `Could not find Pi model ${config.provider}/${config.modelId}.` };
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) {
		return { error: `${config.authLabel} auth failed: ${auth.error}` };
	}
	if (!auth.apiKey) {
		return { error: `No ${config.authLabel} auth found for ${config.provider}. Run /login or configure Pi auth.` };
	}

	try {
		const completionOptions = {
			...(auth.headers ? { headers: auth.headers } : {}),
			apiKey: auth.apiKey,
			maxTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
			reasoning: config.reasoning,
			timeoutMs: 120_000,
		};
		const response = await withSpinner(ctx, input.spinnerKey, input.progressMessage(config.label), () =>
			completeSimple(
				model,
				{
					systemPrompt: input.systemPrompt,
					messages: [
						{
							role: "user",
							content: [{ type: "text", text: input.userPrompt }],
							timestamp: Date.now(),
						},
					],
				},
				completionOptions,
			),
		);

		if (response.stopReason === "error" || response.stopReason === "aborted") {
			return { error: `${config.label} failed to draft a ${input.taskNoun}: ${response.errorMessage ?? response.stopReason}` };
		}

		const output = response.content
			.filter((content): content is { type: "text"; text: string } => content.type === "text" && typeof content.text === "string")
			.map((content) => content.text)
			.join("\n");
		if (output.trim().length === 0) {
			return { error: `${config.label} returned an empty ${input.taskNoun}.` };
		}

		return { output };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { error: `${config.label} failed to draft a ${input.taskNoun}: ${message}` };
	}
}

async function draftWithClaudeCli(
	pi: Pick<ExtensionAPI, "exec">,
	ctx: ExtensionCommandContext,
	input: FastTextDraftInput,
): Promise<{ output: string } | { error: string }> {
	const tempDir = await mkdtemp(join(tmpdir(), "pi-draft-"));
	try {
		const systemPromptPath = join(tempDir, "system-prompt.txt");
		const userPromptPath = join(tempDir, "user-prompt.txt");
		await writeFile(systemPromptPath, input.systemPrompt, "utf8");
		await writeFile(userPromptPath, input.userPrompt, "utf8");

		const result = await withSpinner(ctx, input.spinnerKey, input.progressMessage(CLAUDE_CLI_LABEL), () =>
			pi.exec(
				"bash",
				[
					"-lc",
					'env -u CLAUDECODE claude -p --model "$1" --output-format text --system-prompt "$(cat \"$2\")" < "$3"',
					"bash",
					CLAUDE_CLI_MODEL,
					systemPromptPath,
					userPromptPath,
				],
				{ cwd: ctx.cwd, timeout: 120_000 },
			),
		);
		if (result.code !== 0) {
			return { error: formatCommandError(`${CLAUDE_CLI_LABEL} failed to draft a ${input.taskNoun}.`, result) };
		}

		return { output: result.stdout };
	} finally {
		await rm(tempDir, { force: true, recursive: true });
	}
}

async function withSpinner<T>(
	ctx: ExtensionCommandContext,
	spinnerKey: string,
	message: string,
	operation: () => Promise<T>,
): Promise<T> {
	let frameIndex = 0;
	const render = () => {
		const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
		frameIndex += 1;
		setProgress(ctx, spinnerKey, `${frame} ${message}`);
	};

	render();
	const timer = setInterval(render, 120);
	try {
		return await operation();
	} finally {
		clearInterval(timer);
		clearProgress(ctx, spinnerKey);
	}
}

function setProgress(ctx: ExtensionCommandContext, spinnerKey: string, status: string): void {
	if (ctx.ui.setWidget) {
		ctx.ui.setWidget(spinnerKey, makeProgressWidget(status), { placement: "aboveEditor" });
		ctx.ui.setStatus(spinnerKey, undefined);
		return;
	}

	ctx.ui.setStatus(spinnerKey, ctx.ui.theme?.fg("accent", status) ?? status);
}

function makeProgressWidget(text: string): (tui: unknown, theme: Theme) => Component {
	return (_tui, theme) => ({
		render(width: number): string[] {
			if (width <= 0) return [""];
			return [theme.fg("accent", truncateDisplayLine(text, width))];
		},
		invalidate(): void {},
	});
}

function clearProgress(ctx: ExtensionCommandContext, spinnerKey: string): void {
	ctx.ui.setWidget?.(spinnerKey, undefined);
	ctx.ui.setStatus(spinnerKey, undefined);
}

function formatCommandError(summary: string, result: CommandResult): string {
	const details = result.stderr.trim() || result.stdout.trim();
	const killed = result.killed ? " (killed or timed out)" : "";
	return [summary, details ? `exit ${result.code}${killed}: ${details}` : `exit ${result.code}${killed}`].filter(Boolean).join("\n");
}
