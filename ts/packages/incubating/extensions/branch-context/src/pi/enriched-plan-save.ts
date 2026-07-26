import { registerCommandWithImmediateAck } from "@nseng-ai/pi-runtime/commands/ack";
import { readFileSync, type Stats } from "node:fs";
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
	nodeProjectConfigGateway,
	resolvePromptPointPath,
	resolvePromptPointSource,
} from "@nseng-ai/sdk/project-config/points";
import { systemTimerScheduler } from "@nseng-ai/foundation/time";
import { WRITE_GRILLED_PLAN_COMMAND_NAME, WRITE_PLAN_COMMAND_NAME } from "./surfaces.ts";
import { sendCommandProgressOrNotify } from "@nseng-ai/pi-runtime/commands/ack";
import {
	WRITE_SAVED_PLAN_FILE_TOOL_NAME,
	deriveSavedPlanContentSlug,
	formatSavedPlanFileEvidence,
	type SavedPlanContentSlugEvidence,
	type SavedPlanFileEvidence,
} from "@nseng-ai/plans/api";
import { isRecord } from "@nseng-ai/pi-runtime/runtime/primitives";
import { GRILL_ASK_TOOL_NAME, activateGrillAskTool } from "@nseng-ai/pi-runtime/grill/surfaces";
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

export { WRITE_GRILLED_PLAN_COMMAND_NAME, WRITE_PLAN_COMMAND_NAME } from "./surfaces.ts";
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

export function buildWriteGrilledPlanPrompt(steering: string): string {
	return `This is a /${WRITE_GRILLED_PLAN_COMMAND_NAME} request. Write a detailed implementation plan and save it in the local plan store after structured requirements grilling.

${formatSteeringBlock(steering)}

Plan audience and target inference:
- Treat the saved Markdown plan as self-contained context for a completely fresh downstream implementation session.
- User steering may be empty. Infer the planning target from explicit steering, nearby conversation/session context, and repository evidence, such as a just-produced objective summary or prototype plan.
- Inspect repository evidence before asking. Do not ask questions answerable from local files, docs, or commands.

Structured grilling contract:
- Use ${GRILL_ASK_TOOL_NAME} for every user-facing grilling question.
- Ask exactly one question per ${GRILL_ASK_TOOL_NAME} call.
- Each question must include 2–5 affirmative, mutually exclusive options and a recommendation with concise rationale.
- Use up to 12 high-leverage questions. Some plans are simple and may not require any user-facing questions; stop early when requirements are resolved, and exceed that budget only if the user explicitly asks to continue.
- If ${GRILL_ASK_TOOL_NAME} is unavailable or returns ui_unavailable, stop, explain that structured grill UI is required, summarize current status, and do not call write_saved_plan_file.
- If ${GRILL_ASK_TOOL_NAME} returns status_request, provide a compact status report and re-ask the same pending question; do not count it as an answer.
- If ${GRILL_ASK_TOOL_NAME} returns end_grill, stop, summarize resolved decisions, unresolved branches, and final recommendation, and do not call write_saved_plan_file.

Save/no-save decision:
- If material requirements remain unresolved after the budget, stop, report blockers, and do not save. Material requirements include command surface, storage behavior, user-visible semantics, compatibility expectations, and irreversible migration or data-safety choices.
- Do not ask routine validation-scope or test-coverage questions. Ordinary validation coverage is the downstream implementation agent's responsibility, guided by project policy and changed-file judgment.
- If only non-blocking assumptions remain, fold them into the normal saved plan sections and proceed.
- Do not include a full Q&A transcript or special Q&A section in the saved plan.

Final plan requirements:
- Produce final Markdown with normal sections: goal/outcome, context/discovered facts, files/symbols/tests/docs, implementation steps, validation guidance, risks/assumptions/open questions, and review/remediation.
<!-- PLAN-VERIFICATION-WORKSTREAM:START refactor-execution-strategy-guidance -->
- If the plan includes same-shape edits across multiple files, explicitly choose an execution strategy and apply \`skills/incubating/branch-context/enriched-plan-save/references/refactor-execution-strategy.md\`.
<!-- PLAN-VERIFICATION-WORKSTREAM:END refactor-execution-strategy-guidance -->
- Review the final Markdown plan for completeness, then call write_saved_plan_file with the complete content and optional one-sentence summary; do not generate or pass a slug.
- Report saved plan evidence and stop. Do not create a branch or write Branch Memory.`;
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

async function readWritePlanPromptBody(repoRoot: string): Promise<WritePlanPromptBodyResolution> {
	const catalog = loadPointCatalog({ repoRoot, gateway: nodeProjectConfigGateway });
	const source = resolvePromptPointSource(catalog, WRITE_PLAN_POINT_ID);
	if (source.type === "env") {
		return fallbackWritePlanPromptBody(
			`prompt point ${WRITE_PLAN_POINT_ID} has unsupported env source`,
		);
	}
	const promptPath = resolvePromptPointPath(repoRoot, source);
	if (promptPath === undefined) {
		return fallbackWritePlanPromptBody(`prompt point ${WRITE_PLAN_POINT_ID} has no default`);
	}
	await assertSafeFile(promptPath.path, promptPath.label);

	const content = await readFile(promptPath.path, "utf8");
	if (content.trim().length === 0) {
		return fallbackWritePlanPromptBody(`${promptPath.label} is empty`);
	}
	return { type: "resolved", body: content };
}

async function assertSafeFile(targetPath: string, label: string): Promise<void> {
	const stats = await assertNotSymlink(targetPath, label);
	if (!stats.isFile()) {
		throw new Error(`${label} is not a file`);
	}
}

async function assertNotSymlink(targetPath: string, label: string): Promise<Stats> {
	const stats = await lstat(targetPath);
	if (stats.isSymbolicLink()) {
		throw new Error(`${label} is a symlink`);
	}
	return stats;
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

export async function handleWriteGrilledPlanCommand(
	pi: BranchContextPiCommandApi,
	args: string,
	ctx: CommandContext,
): Promise<void> {
	const steering = args.trim();
	sendCommandProgressOrNotify({
		host: pi,
		ctx,
		message: `Starting /${WRITE_GRILLED_PLAN_COMMAND_NAME} planning grill…`,
	});
	await ctx.waitForIdle();
	// The grilled prompt requires grill_ask; activate it (session-long, idempotent,
	// additive) so the first model request for this message sees the tool.
	activateGrillAskTool(pi);
	pi.sendUserMessage(buildWriteGrilledPlanPrompt(steering));
}

export function buildWriteSavedPlanFileTool(
	pi: BranchContextPiCommandApi,
	options: BranchContextExtensionOptions,
): ToolDefinition {
	return {
		name: WRITE_SAVED_PLAN_FILE_TOOL_NAME,
		label: "Write Saved Plan File",
		description:
			"Create a reviewed, self-contained Markdown implementation plan file for a fresh downstream implementation session in the XDG local plan store at `$XDG_STATE_HOME/ns/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md` (default `$HOME/.local/state/ns/enriched-plan/...`). The tool derives the saved-plan filename slug from the content through the Codex-backed slug model, derives repo and current branch from git, validates the slug, creates parent directories, refuses to overwrite an existing file, writes the full Markdown content, and returns path evidence. It does not create branches or write Branch Memory.",
		promptSnippet:
			"Create a reviewed, self-contained Markdown implementation plan file in the XDG local plan store under `$XDG_STATE_HOME/ns/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md` (default `$HOME/.local/state/ns/enriched-plan/...`).",
		promptGuidelines: [
			`Use write_saved_plan_file for \`/${WRITE_PLAN_COMMAND_NAME}\` and \`/${WRITE_GRILLED_PLAN_COMMAND_NAME}\` after producing a reviewed final Markdown plan.`,
			"Do not generate or pass a saved-plan filename slug; write_saved_plan_file derives it from content through the Codex-backed slug model.",
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
				emitWriteSavedPlanProgress(onUpdate, ctx, "Deriving saved-plan filename slug with Codex…", {
					phase: "deriving-slug",
				});
				const slugStartedAt = Date.now();
				const slugProgressInterval: ScheduledTimer | undefined =
					onUpdate === undefined && !canSetWriteSavedPlanStatus(ctx)
						? undefined
						: systemTimerScheduler.setInterval(() => {
								const elapsedSeconds = Math.round((Date.now() - slugStartedAt) / 1_000);
								emitWriteSavedPlanProgress(
									onUpdate,
									ctx,
									`Deriving saved-plan filename slug with Codex… ${elapsedSeconds}s elapsed`,
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
			`${toolName} derives \`slug\` from content through Codex; do not pass \`slug\`.`,
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

export function registerEnrichedPlanCommandsAndTools(
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

	registerCommandWithImmediateAck({
		host: pi,
		commandName: WRITE_GRILLED_PLAN_COMMAND_NAME,
		commandDefinition: {
			description: "Write and save a grilled implementation plan using structured requirements UI.",
			handler: async (args, ctx) => handleWriteGrilledPlanCommand(pi, args, ctx),
		},
	});

	pi.registerTool(buildWriteSavedPlanFileTool(pi, options));
}
