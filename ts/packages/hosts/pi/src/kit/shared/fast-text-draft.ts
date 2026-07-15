import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandSucceeded, type CommandExecApi, type ExecResult } from "@nseng-ai/foundation/exec";
import { callPiModelText, type PiModelRegistryLike } from "../models/call.ts";
import type {
	NotifyLevel,
	SetWidgetFunction,
	WidgetComponentFactory,
	WidgetTheme,
} from "../../runtime/tool-types.ts";
import { truncateDisplayLine } from "../terminal/presentation.ts";
import { withSafePiUi } from "./safe-ui.ts";
import { createPiCommandExecApi, type RawPiExecApi } from "./command-exec.ts";
import { SPINNER_FRAMES } from "./spinner-frames.ts";
import { unrefTimerScheduler } from "./timers.ts";

export const HARNESS_ENV = "PI_DRAFT_HARNESS";
export const DEFAULT_HARNESS = "codex-pi";
export const CLAUDE_CLI_MODEL = "claude-haiku-4-5";

const CLAUDE_CLI_LABEL = "Claude CLI";
const DEFAULT_MAX_TOKENS = 512;

export type DraftHarness = "codex-pi" | "claude-cli";

export interface ExtensionCommandContext {
	cwd: string;
	modelRegistry: PiModelRegistryLike;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
		setWidget?: SetWidgetFunction;
		theme?: WidgetTheme;
	};
	waitForIdle(): Promise<void>;
}

export interface ExtensionAPI extends RawPiExecApi {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: ExtensionCommandContext): Promise<void> | void;
		},
	): void;
}

export interface FastTextDraftInput {
	harness: DraftHarness;
	systemPrompt: string;
	userPrompt: string;
	spinnerKey: string;
	progressMessage: (harnessLabel: string) => string;
	taskNoun: string;
	maxTokens?: number;
	modelRef?: string;
}

export interface PiModelConfig {
	provider: string;
	modelId: string;
	label: string;
	authLabel: string;
	reasoning: "minimal" | "low";
}

export function selectDraftHarness(): { value: DraftHarness } | { error: string } {
	const configured = process.env[HARNESS_ENV]?.trim() || DEFAULT_HARNESS;
	if (configured === "codex-pi" || configured === "claude-cli") {
		return { value: configured };
	}

	return {
		error: `Invalid ${HARNESS_ENV}=${JSON.stringify(configured)}. Valid values: codex-pi, claude-cli.`,
	};
}

export function resolveCodexDraftModel(modelRef: string): PiModelConfig {
	const separator = modelRef.indexOf("/");
	if (separator <= 0 || separator === modelRef.length - 1) {
		throw new Error(`Invalid resolved Pi draft model reference ${JSON.stringify(modelRef)}.`);
	}
	const provider = modelRef.slice(0, separator);
	const modelId = modelRef.slice(separator + 1);
	return {
		provider,
		modelId,
		label: `${provider}/${modelId}`,
		authLabel: provider === DEFAULT_FAST_MODEL.provider ? "Codex" : provider,
		reasoning: "minimal",
	};
}

export function resolveClaudeCliDraftModel(): string {
	return CLAUDE_CLI_MODEL;
}

export async function draftWithFastText(
	pi: Pick<ExtensionAPI, "exec">,
	ctx: ExtensionCommandContext,
	input: FastTextDraftInput,
): Promise<{ output: string } | { error: string }> {
	if (input.harness === "codex-pi") {
		if (input.modelRef === undefined) {
			return { error: "Codex Pi draft requires an already-resolved model reference." };
		}
		return draftWithPiModel(ctx, resolveCodexDraftModel(input.modelRef), input);
	}
	return draftWithClaudeCli(createPiCommandExecApi(pi), ctx, input);
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
	pi: CommandExecApi,
	ctx: ExtensionCommandContext,
	input: FastTextDraftInput,
): Promise<{ output: string } | { error: string }> {
	const model = resolveClaudeCliDraftModel();
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
		if (!commandSucceeded(result)) {
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
	let isStale = false;
	let timer: ReturnType<typeof unrefTimerScheduler.setInterval> | undefined;
	const clearTimer = () => {
		if (timer === undefined) return;
		timer.cancel();
		timer = undefined;
	};
	const render = () => {
		if (isStale) return;
		const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
		frameIndex += 1;
		const result = withSafePiUi(() => {
			setProgress(ctx, spinnerKey, `${frame} ${message}`);
		});
		if (result.type === "ok") return;
		isStale = true;
		clearTimer();
	};

	render();
	if (!isStale) {
		timer = unrefTimerScheduler.setInterval(render, 120);
	}
	try {
		return await operation();
	} finally {
		clearTimer();
		if (!isStale) {
			withSafePiUi(() => {
				clearProgress(ctx, spinnerKey);
			});
		}
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

function makeProgressWidget(text: string): WidgetComponentFactory {
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

function formatCommandError(summary: string, result: ExecResult): string {
	const details = result.stderr.trim() || result.stdout.trim();
	const termination =
		result.type === "exited" ? `exit ${result.code ?? "unknown"}` : result.type.replace("-", " ");
	return [summary, details ? `${termination}: ${details}` : termination].filter(Boolean).join("\n");
}
