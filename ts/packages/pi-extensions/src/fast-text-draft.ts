import { DEFAULT_FAST_MODEL, DEFAULT_FAST_MODEL_REF, resolveModelRef } from "@asdl/plans";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandResult } from "@asdl/sdl/checkpoint-flow";
import { callPiModelText, type PiModelRegistryLike } from "./pi-model-call.ts";
import { truncateDisplayLine } from "./terminal-presentation.ts";

export const HARNESS_ENV = "PI_DRAFT_HARNESS";
export const DEFAULT_HARNESS = "codex-pi";
export const DRAFT_MODEL_ENV = "PI_DRAFT_MODEL";
export const CLAUDE_CLI_MODEL = "claude-haiku-4-5";

const CLAUDE_CLI_LABEL = "Claude CLI";
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DEFAULT_MAX_TOKENS = 512;

export type DraftHarness = "codex-pi" | "claude-cli";
export type NotifyLevel = "info" | "warning" | "error";

type WidgetPlacement = "aboveEditor" | "belowEditor";

interface Theme {
	fg(color: string, text: string): string;
}

interface Component {
	render(width: number): string[];
	invalidate(): void;
}

type WidgetContent = string[] | ((tui: unknown, theme: Theme) => Component) | undefined;

export interface ExtensionCommandContext {
	cwd: string;
	modelRegistry: PiModelRegistryLike;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
		setWidget?(key: string, value: WidgetContent, options?: { placement?: WidgetPlacement }): void;
		theme?: Theme;
	};
	waitForIdle(): Promise<void>;
}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: ExtensionCommandContext): Promise<void> | void;
		},
	): void;
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<CommandResult>;
}

export interface FastTextDraftInput {
	harness: DraftHarness;
	systemPrompt: string;
	userPrompt: string;
	spinnerKey: string;
	progressMessage: (harnessLabel: string) => string;
	taskNoun: string;
	maxTokens?: number;
}

export interface PiModelConfig {
	provider: string;
	modelId: string;
	label: string;
	authLabel: string;
	reasoning: "minimal" | "low";
}

const CODEX_DEFAULT_CONFIG: PiModelConfig = {
	provider: DEFAULT_FAST_MODEL.provider,
	modelId: DEFAULT_FAST_MODEL.modelId,
	label: `${DEFAULT_FAST_MODEL.modelId} via Codex`,
	authLabel: "Codex",
	reasoning: "minimal",
};

export function selectDraftHarness(): { value: DraftHarness } | { error: string } {
	const configured = process.env[HARNESS_ENV]?.trim() || DEFAULT_HARNESS;
	if (configured === "codex-pi" || configured === "claude-cli") {
		return { value: configured };
	}

	return {
		error: `Invalid ${HARNESS_ENV}=${JSON.stringify(configured)}. Valid values: codex-pi, claude-cli.`,
	};
}

export function resolveCodexDraftModel(env: Record<string, string | undefined>): {
	value: PiModelConfig;
	warning?: string;
} {
	if (!env[DRAFT_MODEL_ENV]?.trim()) {
		return { value: CODEX_DEFAULT_CONFIG };
	}

	const resolution = resolveModelRef(env, DRAFT_MODEL_ENV, DEFAULT_FAST_MODEL_REF);
	if (!resolution.ok) {
		return {
			value: CODEX_DEFAULT_CONFIG,
			warning: `${resolution.error} Using ${DEFAULT_FAST_MODEL_REF}.`,
		};
	}

	const { provider, modelId } = resolution.value;
	return {
		value: {
			provider,
			modelId,
			label: `${provider}/${modelId}`,
			authLabel: provider === DEFAULT_FAST_MODEL.provider ? "Codex" : provider,
			reasoning: "minimal",
		},
	};
}

export function resolveClaudeCliDraftModel(env: Record<string, string | undefined>): string {
	return env[DRAFT_MODEL_ENV]?.trim() || CLAUDE_CLI_MODEL;
}

export async function draftWithFastText(
	pi: Pick<ExtensionAPI, "exec">,
	ctx: ExtensionCommandContext,
	input: FastTextDraftInput,
): Promise<{ output: string } | { error: string }> {
	if (input.harness === "codex-pi") {
		const resolved = resolveCodexDraftModel(process.env);
		if (resolved.warning !== undefined) {
			ctx.ui.notify(resolved.warning, "warning");
		}
		return draftWithPiModel(ctx, resolved.value, input);
	}
	return draftWithClaudeCli(pi, ctx, input);
}

async function draftWithPiModel(
	ctx: ExtensionCommandContext,
	config: PiModelConfig,
	input: FastTextDraftInput,
): Promise<{ output: string } | { error: string }> {
	const result = await withSpinner(ctx, input.spinnerKey, input.progressMessage(config.label), () =>
		callPiModelText({
			registry: ctx.modelRegistry,
			provider: config.provider,
			modelId: config.modelId,
			systemPrompt: input.systemPrompt,
			userText: input.userPrompt,
			maxTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
			reasoning: config.reasoning,
			timeoutMs: 120_000,
		}),
	);
	if (!result.ok) {
		return { error: piModelDraftError(result, config, input.taskNoun) };
	}
	if (result.text.trim().length === 0) {
		return { error: `${config.label} returned an empty ${input.taskNoun}.` };
	}
	return { output: result.text };
}

function piModelDraftError(
	result: Exclude<Awaited<ReturnType<typeof callPiModelText>>, { ok: true }>,
	config: PiModelConfig,
	taskNoun: string,
): string {
	switch (result.reason) {
		case "model-unavailable":
			return `Could not find Pi model ${config.provider}/${config.modelId}.`;
		case "auth":
			return `${config.authLabel} auth failed: ${result.message ?? "unknown auth error"}`;
		case "empty-auth":
			return `No ${config.authLabel} auth found for ${config.provider}. Run /login or configure Pi auth.`;
		case "aborted":
			return `${config.label} failed to draft a ${taskNoun}: ${result.message ?? "aborted"}`;
		case "request-failed":
			return `${config.label} failed to draft a ${taskNoun}: ${result.message ?? "error"}`;
	}
}

async function draftWithClaudeCli(
	pi: Pick<ExtensionAPI, "exec">,
	ctx: ExtensionCommandContext,
	input: FastTextDraftInput,
): Promise<{ output: string } | { error: string }> {
	const model = resolveClaudeCliDraftModel(process.env);
	const tempDir = await mkdtemp(join(tmpdir(), "pi-draft-"));
	try {
		const systemPromptPath = join(tempDir, "system-prompt.txt");
		const userPromptPath = join(tempDir, "user-prompt.txt");
		await writeFile(systemPromptPath, input.systemPrompt, "utf8");
		await writeFile(userPromptPath, input.userPrompt, "utf8");

		const result = await withSpinner(
			ctx,
			input.spinnerKey,
			input.progressMessage(CLAUDE_CLI_LABEL),
			() =>
				pi.exec(
					"bash",
					[
						"-lc",
						'env -u CLAUDECODE claude -p --model "$1" --output-format text --system-prompt "$(cat "$2")" < "$3"',
						"bash",
						model,
						systemPromptPath,
						userPromptPath,
					],
					{ cwd: ctx.cwd, timeout: 120_000 },
				),
		);
		if (result.code !== 0) {
			return {
				error: formatCommandError(
					`${CLAUDE_CLI_LABEL} failed to draft a ${input.taskNoun}.`,
					result,
				),
			};
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
	return [
		summary,
		details ? `exit ${result.code}${killed}: ${details}` : `exit ${result.code}${killed}`,
	]
		.filter(Boolean)
		.join("\n");
}
