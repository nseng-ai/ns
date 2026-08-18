import { registerCommandWithImmediateAck } from "@nseng-ai/pi-runtime/commands/ack";
import { readFileSync } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { Text } from "@earendil-works/pi-tui";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import type { GitGateway } from "@nseng-ai/foundation/git";
import {
	formatErrorMessage,
	optionalEntries,
	optionalEntry,
} from "@nseng-ai/foundation/primitives";
import type { ScheduledTimer } from "@nseng-ai/foundation/timers";
import {
	loadPointCatalog,
	createNodeProjectConfigGateway,
} from "@nseng-ai/sdk/project-config/points";
import {
	resolvePromptPointContent,
	type PromptPointContentReader,
} from "@nseng-ai/sdk/project-config/prompt-content";
import { systemTimerScheduler } from "@nseng-ai/foundation/time";
import { WRITE_PLAN_COMMAND_NAME } from "@nseng-ai/branch-context/api";
import { sendCommandProgressOrNotify } from "@nseng-ai/pi-runtime/commands/ack";
import {
	WRITE_SAVED_PLAN_FILE_TOOL_NAME,
	deriveSavedPlanContentSlug,
	formatSavedPlanFileEvidence,
	type SavedPlanContentSlugEvidence,
	type SavedPlanFileEvidence,
} from "@nseng-ai/plans/api";
import { isRecord } from "@nseng-ai/pi-runtime/runtime/primitives";
import { resolveBranchContextOperations, resolvePlanStoreRootOption } from "./options.ts";
import type {
	BranchContextExtensionOptions,
	CommandContext,
	ToolContext,
	ToolDefinition,
	ToolResult,
	ToolUpdateHandler,
} from "./host-types.ts";
import type { BranchContextPiCommandApi } from "./pi-command-api.ts";

export { WRITE_PLAN_COMMAND_NAME } from "@nseng-ai/branch-context/api";
const WRITE_PLAN_TOOL_STATUS_KEY = WRITE_PLAN_COMMAND_NAME;

interface WriteSavedPlanFileToolParams {
	content: string;
	summary?: string;
}

interface WriteSavedPlanFileToolDetails extends SavedPlanFileEvidence {
	slugEvidence: SavedPlanContentSlugEvidence;
}

type WriteSavedPlanFilePhase = "validating" | "deriving-slug" | "writing-file";

interface WriteSavedPlanFileProgressDetails {
	phase: WriteSavedPlanFilePhase;
	slug?: string;
	elapsedSeconds?: number;
}

const WRITE_PLAN_POINT_ID = "branch-context.plans-write";

export const DEFAULT_WRITE_PLAN_PROMPT_BODY = readFileSync(
	new URL("./prompts/plans-write-default.md", import.meta.url),
	"utf8",
).trimEnd();

type WritePlanPromptBodyResolution =
	| { type: "resolved"; body: string }
	| { type: "fallback"; body: string; warning: string };

export function buildWritePlanPrompt(
	steering: string,
	promptBody = DEFAULT_WRITE_PLAN_PROMPT_BODY,
): string {
	return `This is a /${WRITE_PLAN_COMMAND_NAME} request. Write a detailed implementation plan and save it in the local plan store.

${formatSteeringBlock(steering)}

${promptBody}`;
}

async function resolveWritePlanPromptBody(
	pi: BranchContextPiCommandApi,
	cwd: string,
): Promise<WritePlanPromptBodyResolution> {
	const repoRoot = await resolveGitRoot(new RealGitGateway(pi), cwd);
	if (repoRoot.type === "failed") {
		return fallbackWritePlanPromptBody(repoRoot.reason);
	}

	try {
		return await readWritePlanPromptBody(repoRoot.path);
	} catch (error) {
		return fallbackWritePlanPromptBody(
			`prompt point ${WRITE_PLAN_POINT_ID} could not be read: ${formatErrorMessage(error)}`,
		);
	}
}

function fallbackWritePlanPromptBody(reason: string): WritePlanPromptBodyResolution {
	return {
		type: "fallback",
		body: DEFAULT_WRITE_PLAN_PROMPT_BODY,
		warning: `Falling back to built-in /${WRITE_PLAN_COMMAND_NAME} prompt body because ${reason}`,
	};
}

async function resolveGitRoot(
	git: GitGateway,
	cwd: string,
): Promise<{ type: "resolved"; path: string } | { type: "failed"; reason: string }> {
	const result = await git.repoRoot({ cwd });
	if (!result.ok) {
		return { type: "failed", reason: result.error.message };
	}
	return { type: "resolved", path: result.value };
}

const branchContextPromptReader: PromptPointContentReader = {
	async readTextFile(path) {
		try {
			const stats = await lstat(path);
			if (stats.isSymbolicLink()) {
				return { ok: false, reason: "unreadable", message: "is a symlink" };
			}
			if (!stats.isFile()) {
				return { ok: false, reason: "unreadable", message: "is not a regular file" };
			}
			return { ok: true, content: await readFile(path, "utf8") };
		} catch (error) {
			const message = formatErrorMessage(error);
			if (isNodeFileNotFound(error)) return { ok: false, reason: "missing", message };
			return { ok: false, reason: "unreadable", message };
		}
	},
};

async function readWritePlanPromptBody(repoRoot: string): Promise<WritePlanPromptBodyResolution> {
	const catalog = loadPointCatalog({ repoRoot, gateway: createNodeProjectConfigGateway() });
	const resolved = await resolvePromptPointContent({
		repoRoot,
		catalog,
		pointId: WRITE_PLAN_POINT_ID,
		reader: branchContextPromptReader,
	});
	if (resolved.ok) return { type: "resolved", body: resolved.content };
	return fallbackWritePlanPromptBody(resolved.message);
}

function isNodeFileNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}

export async function handleWritePlanCommand(
	pi: BranchContextPiCommandApi,
	args: string,
	ctx: CommandContext,
): Promise<void> {
	const steering = args.trim();
	sendCommandProgressOrNotify({
		host: pi,
		ctx,
		message: `Starting /${WRITE_PLAN_COMMAND_NAME} planning turn…`,
	});
	await ctx.waitForIdle();
	const promptBody = await resolveWritePlanPromptBody(pi, ctx.cwd);
	if (promptBody.type === "fallback" && ctx.hasUI) {
		ctx.ui.notify(promptBody.warning, "warning");
	}
	pi.sendUserMessage(buildWritePlanPrompt(steering, promptBody.body));
}

export function buildWriteSavedPlanFileTool(
	pi: BranchContextPiCommandApi,
	options: BranchContextExtensionOptions,
): ToolDefinition {
	return {
		name: WRITE_SAVED_PLAN_FILE_TOOL_NAME,
		label: "Write Saved Plan File",
		description:
			"Create a reviewed, self-contained Markdown implementation plan file for a fresh downstream implementation session in the XDG local plan store at `$XDG_STATE_HOME/ns/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md` (default `$HOME/.local/state/ns/enriched-plan/...`). The tool derives the saved-plan filename slug from the content through the configured slug model, falling back to the current parent-session model when `[models.profiles.fast]` is absent; derives repo and current branch from git; validates the slug; creates parent directories; refuses to overwrite an existing file; writes the full Markdown content; and returns path evidence. It does not create branches or write Branch Memory.",
		promptSnippet:
			"Create a reviewed, self-contained Markdown implementation plan file in the XDG local plan store under `$XDG_STATE_HOME/ns/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md` (default `$HOME/.local/state/ns/enriched-plan/...`).",
		promptGuidelines: [
			`Use write_saved_plan_file for \`/${WRITE_PLAN_COMMAND_NAME}\` after producing a reviewed final Markdown plan.`,
			"Do not generate or pass a saved-plan filename slug; write_saved_plan_file derives it from content through the configured slug model or the current parent-session model fallback.",
			"write_saved_plan_file writes the XDG local plan store under `$XDG_STATE_HOME/ns/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md` (default `$HOME/.local/state/ns/enriched-plan/...`); it does not create branches or write Branch Memory.",
			"write_saved_plan_file content should be self-contained for a completely fresh downstream implementation session, including relevant context discovered during planning.",
			"If planning used external/off-repo research, write_saved_plan_file content should include the concrete findings and provenance inline instead of relying on links or hidden conversation context.",
			"If write_saved_plan_file reports that the saved plan file already exists, stop and report the collision; never overwrite the existing file.",
		],
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				content: {
					type: "string",
					description:
						"Complete reviewed, self-contained Markdown plan content to write, including relevant planning context and external research findings.",
				},
				summary: {
					type: "string",
					description: "Optional one-sentence summary of the plan.",
				},
			},
			required: ["content"],
		},
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const operations = resolveBranchContextOperations(options);
			try {
				emitWriteSavedPlanProgress(onUpdate, ctx, "Validating saved plan input…", {
					phase: "validating",
				});
				const toolParams = parseWriteSavedPlanFileToolParams(params);
				emitWriteSavedPlanProgress(
					onUpdate,
					ctx,
					"Deriving saved-plan filename slug with a model…",
					{
						phase: "deriving-slug",
					},
				);
				const slugStartedAt = Date.now();
				const slugProgressInterval: ScheduledTimer | undefined =
					onUpdate === undefined && !canSetWriteSavedPlanStatus(ctx)
						? undefined
						: systemTimerScheduler.setInterval(() => {
								const elapsedSeconds = Math.round((Date.now() - slugStartedAt) / 1_000);
								emitWriteSavedPlanProgress(
									onUpdate,
									ctx,
									`Deriving saved-plan filename slug with a model… ${elapsedSeconds}s elapsed`,
									{
										phase: "deriving-slug",
										elapsedSeconds,
									},
								);
							}, 5_000);
				let slugEvidence: SavedPlanContentSlugEvidence;
				try {
					slugEvidence = await deriveSavedPlanContentSlug(pi, {
						content: toolParams.content,
						cwd: ctx.cwd,
						...(ctx.model === undefined
							? {}
							: {
									fallbackModelSelection: {
										provider: ctx.model.provider,
										modelId: ctx.model.id,
										thinking: pi.getThinkingLevel(),
									},
								}),
						...optionalEntry("signal", signal),
					});
				} finally {
					if (slugProgressInterval !== undefined) {
						slugProgressInterval.cancel();
					}
				}
				emitWriteSavedPlanProgress(
					onUpdate,
					ctx,
					`Derived slug ${slugEvidence.slug}; resolving repo/branch and writing plan file…`,
					{ phase: "writing-file", slug: slugEvidence.slug },
				);
				emitWriteSavedPlanProgress(onUpdate, ctx, "Writing plan file…", {
					phase: "writing-file",
					slug: slugEvidence.slug,
				});
				const planStoreRoot = resolvePlanStoreRootOption(options);
				const evidence = await operations.writeSavedPlanFile(
					pi,
					buildSavedPlanFileParams(toolParams, slugEvidence.slug),
					{
						cwd: ctx.cwd,
						...optionalEntries({ signal, planStoreRoot }),
					},
				);
				const details: WriteSavedPlanFileToolDetails = { ...evidence, slugEvidence };
				return {
					content: [
						{
							type: "text",
							text: formatSavedPlanFileEvidenceWithSlugModel(evidence, slugEvidence),
						},
					],
					details,
				};
			} finally {
				setWriteSavedPlanStatus(ctx, undefined);
			}
		},
		renderCall(args, _theme, context) {
			return new Text(formatWriteSavedPlanFileCall(args, context), 0, 0);
		},
		renderResult(result, { isPartial }) {
			const text = formatToolResultText(result);
			if (isPartial) {
				return new Text(`Saving branch-context plan…\n${text}`, 0, 0);
			}
			return new Text(text, 0, 0);
		},
	};
}

function emitWriteSavedPlanProgress(
	onUpdate: ToolUpdateHandler | undefined,
	ctx: ToolContext,
	text: string,
	details: WriteSavedPlanFileProgressDetails,
): void {
	onUpdate?.({ content: [{ type: "text", text }], details });
	setWriteSavedPlanStatus(ctx, text);
}

function setWriteSavedPlanStatus(ctx: ToolContext, value: string | undefined): void {
	if (ctx.hasUI === false) {
		return;
	}
	ctx.ui?.setStatus?.(WRITE_PLAN_TOOL_STATUS_KEY, value);
}

function canSetWriteSavedPlanStatus(ctx: ToolContext): boolean {
	if (ctx.hasUI === false) {
		return false;
	}
	return ctx.ui?.setStatus !== undefined;
}

function formatToolResultText(result: ToolResult): string {
	return result.content.map((item) => item.text).join("\n");
}

function formatWriteSavedPlanFileCall(args: unknown, context: unknown): string {
	const content = isRecord(args) && typeof args.content === "string" ? args.content : undefined;
	const tokenEstimate = content === undefined ? "" : ` ${formatEstimatedTokenCount(content)}`;
	if (isToolExecutionStarted(context)) {
		return `${WRITE_SAVED_PLAN_FILE_TOOL_NAME} — saving reviewed plan…${tokenEstimate}`;
	}

	return `${WRITE_SAVED_PLAN_FILE_TOOL_NAME} — receiving saved-plan content from model…${tokenEstimate}`;
}

function isToolExecutionStarted(context: unknown): boolean {
	return isRecord(context) && context.executionStarted === true;
}

const ESTIMATED_CHARS_PER_TOKEN = 4;

function formatEstimatedTokenCount(text: string): string {
	return `${formatCount(Math.ceil(text.length / ESTIMATED_CHARS_PER_TOKEN))} tokens (est.)`;
}

function formatCount(count: number): string {
	if (count < 1_000) {
		return `${count}`;
	}
	if (count < 1_000_000) {
		return `${formatCompactNumber(count / 1_000)}k`;
	}
	return `${formatCompactNumber(count / 1_000_000)}m`;
}

function formatCompactNumber(value: number): string {
	const formatted = value >= 10 ? value.toFixed(0) : value.toFixed(1);
	return formatted.replace(/\.0$/, "");
}

function parseWriteSavedPlanFileToolParams(params: unknown): WriteSavedPlanFileToolParams {
	return parseWriteSavedPlanFileToolParamsForName(params, WRITE_SAVED_PLAN_FILE_TOOL_NAME);
}

function parseWriteSavedPlanFileToolParamsForName(
	params: unknown,
	toolName: string,
): WriteSavedPlanFileToolParams {
	if (!isRecord(params)) {
		throw new Error(`${toolName} parameters must be an object.`);
	}
	if ("slug" in params) {
		throw new Error(
			`${toolName} derives \`slug\` from content through its selected model; do not pass \`slug\`.`,
		);
	}

	const content = params.content;
	const summary = params.summary;
	if (typeof content !== "string") {
		throw new Error(`${toolName} requires string parameter \`content\`.`);
	}
	if (summary !== undefined && typeof summary !== "string") {
		throw new Error(`${toolName} parameter \`summary\` must be a string when provided.`);
	}

	if (summary === undefined) {
		return { content };
	}
	return { content, summary };
}

function buildSavedPlanFileParams(
	params: WriteSavedPlanFileToolParams,
	slug: string,
): { slug: string; content: string; summary?: string } {
	if (params.summary === undefined) {
		return { slug, content: params.content };
	}
	return { slug, content: params.content, summary: params.summary };
}

function formatSavedPlanFileEvidenceWithSlugModel(
	evidence: SavedPlanFileEvidence,
	slugEvidence: SavedPlanContentSlugEvidence,
): string {
	return `${formatSavedPlanFileEvidence(evidence)}\nSlug model: ${slugEvidence.provider}/${slugEvidence.model}`;
}

function formatSteeringBlock(steering: string): string {
	const trimmedSteering = steering.trim();
	if (!trimmedSteering) {
		return "User steering for this planning request: (none)";
	}

	return `User steering for this planning request:\n\n\`\`\`text\n${trimmedSteering}\n\`\`\``;
}

export function registerSavedPlanCommandsAndTools(
	pi: BranchContextPiCommandApi,
	options: BranchContextExtensionOptions = {},
): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: WRITE_PLAN_COMMAND_NAME,
		commandDefinition: {
			description: "Write and save a reviewed implementation plan in the local plan store.",
			handler: async (args, ctx) => handleWritePlanCommand(pi, args, ctx),
		},
	});

	pi.registerTool(buildWriteSavedPlanFileTool(pi, options));
}
