import { DEFAULT_FAST_MODEL, DEFAULT_FAST_MODEL_REF, parseModelRef } from "@asdl/plans";
import type * as PiAi from "@earendil-works/pi-ai";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandResult } from "asdl-dev/src/checkpoint-flow.ts";
import { truncateDisplayLine } from "./terminal-presentation.ts";

export const HARNESS_ENV = "PI_DRAFT_HARNESS";
export const DEFAULT_HARNESS = "codex-pi";
export const DRAFT_MODEL_ENV = "PI_DRAFT_MODEL";
export const CLAUDE_CLI_MODEL = "claude-haiku-4-5";

const CLAUDE_CLI_LABEL = "Claude CLI";
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DEFAULT_MAX_TOKENS = 512;

type CompleteSimpleFunction = typeof PiAi.completeSimple;

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

type ModelAuth =
	| { ok: true; apiKey?: string; headers?: Record<string, string> }
	| { ok: false; error: string };

interface ModelRegistryLike {
	find(provider: string, modelId: string): unknown | undefined;
	getApiKeyAndHeaders(model: unknown): Promise<ModelAuth>;
}

export interface ExtensionCommandContext {
	cwd: string;
	modelRegistry: ModelRegistryLike;
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
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<CommandResult>;
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

export function resolveCodexDraftModel(
	env: Record<string, string | undefined>,
): { value: PiModelConfig; warning?: string } {
	const override = env[DRAFT_MODEL_ENV]?.trim();
	if (!override) {
		return { value: CODEX_DEFAULT_CONFIG };
	}

	const parsed = override.includes("/")
		? parseModelRef(override)
		: { provider: DEFAULT_FAST_MODEL.provider, modelId: override };
	if (parsed === undefined) {
		return {
			value: CODEX_DEFAULT_CONFIG,
			warning: `Invalid ${DRAFT_MODEL_ENV}=${JSON.stringify(override)}; using ${DEFAULT_FAST_MODEL_REF}.`,
		};
	}

	return {
		value: {
			provider: parsed.provider,
			modelId: parsed.modelId,
			label: `${parsed.provider}/${parsed.modelId}`,
			authLabel: parsed.provider === DEFAULT_FAST_MODEL.provider ? "Codex" : parsed.provider,
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
		const completeSimple = await loadCompleteSimple();
		const response = await withSpinner(ctx, input.spinnerKey, input.progressMessage(config.label), () =>
			completeSimple(
				model as PiAi.Model<PiAi.Api>,
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

async function loadCompleteSimple(): Promise<CompleteSimpleFunction> {
	const piAi = await import("@earendil-works/pi-ai");
	return piAi.completeSimple;
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

		const result = await withSpinner(ctx, input.spinnerKey, input.progressMessage(CLAUDE_CLI_LABEL), () =>
			pi.exec(
				"bash",
				[
					"-lc",
					'env -u CLAUDECODE claude -p --model "$1" --output-format text --system-prompt "$(cat \"$2\")" < "$3"',
					"bash",
					model,
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
