import { lstat, readFile } from "node:fs/promises";
import * as path from "node:path";

import { Text } from "@earendil-works/pi-tui";
import { formatErrorMessage } from "@asdl/core/primitives";
import {
	WRITE_SAVED_PLAN_FILE_TOOL_NAME,
	deriveSavedPlanContentSlug,
	formatSavedPlanFileEvidence,
	type SavedPlanContentSlugEvidence,
	type SavedPlanFileEvidence,
} from "@asdl/plans";
import { isRecord } from "../cmux/primitives.ts";
import { GRILL_ASK_TOOL_NAME } from "../grill-ui.ts";
import { resolveBranchContextOperations, resolvePlanStoreRootOption } from "./options.ts";
import type {
	BranchContextExtensionOptions,
	CommandContext,
	ExtensionAPI,
	ToolContext,
	ToolDefinition,
	ToolResult,
	ToolUpdateHandler,
} from "./host-types.ts";

export const WRITE_PLAN_COMMAND_NAME = "enriched-plan:save";
export const WRITE_GRILLED_PLAN_COMMAND_NAME = "enriched-plan:grill-and-save";
const WRITE_PLAN_TOOL_STATUS_KEY = "enriched-plan:save";

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

const WRITE_PLAN_PROMPT_NAME = "plans-write";
const WRITE_PLAN_GIT_ROOT_TIMEOUT_MS = 10_000;

export const DEFAULT_WRITE_PLAN_PROMPT_BODY = `Plan audience and context contract:
- Treat the saved Markdown plan as the only planning context available to a completely fresh downstream implementation session.
- Make the plan self-contained. Do not rely on this conversation, hidden context, tool transcripts, or "as discussed" references.
- Embed all relevant context discovered during planning, including user goals, constraints, current behavior, important files/symbols/tests/docs, decisions made, rationale, rejected alternatives, assumptions, risks, and proportional validation guidance.
- Prefer concrete file paths, symbol names, command names, expected outcomes, and implementation order over vague instructions.
- If you inspected evidence during planning, summarize the discovered facts in the plan so the downstream agent does not need to rediscover them unless verification is required.

External research/context contract:
- If planning used anything outside the repository — web searches, external docs, GitHub issues/PRs, API docs, CLIs hitting remote services, local files outside the repo, or other non-repo resources — include the relevant findings inline in the saved plan.
- Do not merely link to external resources. Summarize the concrete facts, constraints, examples, decisions, and caveats the downstream agent needs.
- Include source/provenance where useful: URL, command, document name, issue/PR number, accessed date/time if known, and why it mattered.
- If external findings may become stale, mark what should be revalidated during implementation.
- Do not include secrets, credentials, private tokens, or unnecessary sensitive data.

<!-- PLAN-VERIFICATION-WORKSTREAM:START refactor-execution-strategy-guidance -->
Refactor execution strategy:
- If the implementation includes same-shape edits across multiple files, explicitly choose an execution mode in the plan.
- For TypeScript symbol/API refactors, call out the \`ts-morph-refactor\` skill when it fits; use \`ts-morph-analyze\` for AST inspection before designing broad TypeScript changes.
- Prefer deterministic AST/codemod tooling for purely syntactic refactors when a suitable repo or installed skill tool exists.
- For 1-4 files or semantic doc/spec changes, prefer reading affected sections and making precise edits; do not recommend opaque ad hoc \`text.replace()\` scripts for semantic changes.
- For 5+ file-local edits, especially mixed code/docs/tests or prose-aware refactors, recommend \`refactor-swarm\`.
- Require a final grep or equivalent stale-terminology check when changing names/concepts.
<!-- PLAN-VERIFICATION-WORKSTREAM:END refactor-execution-strategy-guidance -->

Recommended saved plan sections:
- Goal and user-visible outcome.
- Planning context and discovered facts, including relevant repository state.
- External/off-repo research context, or a note that none was used when that helps remove ambiguity.
- Files, symbols, commands, and tests likely to change.
- Step-by-step implementation approach.
- Validation guidance and expected results. Do not over-specify routine test/check scope as a planning decision; leave ordinary validation coverage to the implementing agent's project policy and changed-file judgment.
- Risks, assumptions, edge cases, and open questions.

Workflow:
1. Inspect the repository, documentation, and current conversation context as needed for the requested work.
2. Produce a detailed Markdown implementation plan.
3. Review the final Markdown plan content for completeness.
4. Call write_saved_plan_file with the full Markdown content and optional one-sentence summary; do not generate or pass a slug.
5. Report the saved plan evidence: file path, repo key, repo root, repo identity source, source branch, branch path segment, slug, slug model, and summary when present.
6. Stop after reporting the saved plan evidence. Do not create a branch, write Branch Memory, or call any branch-context command/tool.

Local plan store contract:
- Path convention: ~/.asdl/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md
- <repo>: for github.com origins, gh--<owner>--<repo> from sanitized GitHub owner and repo path segments; for non-GitHub or origin-less repos, one sanitized path segment from the normalized remote.origin.url or real repo root path
- <encoded-source-branch>: current branch at plan-file creation time encoded as one filesystem-safe path segment; branch slashes become --- (for example, branch-contexts/add-widget becomes branch-contexts---add-widget)
- <slug>: semantic kebab-case saved-plan filename slug without .md; this is a local plan-store locator, not necessarily the later implementation branch slug
- Existing saved plan file: write_saved_plan_file refuses to overwrite it; do not manually choose a replacement slug.
- Working-tree behavior: no checked-in plan file is created.

Saved-plan filename slug rules:
- write_saved_plan_file derives the final saved-plan filename slug from the final plan content through the Codex-backed slug model.
- Do not generate, guess, or pass a slug yourself.
- The derived slug is kebab-case, 3–7 words, specific to the work described by the final plan, and rejects dates, random IDs, and generic-only slugs.

When the plan is ready, call write_saved_plan_file with:
- content: the complete reviewed Markdown plan content
- summary: optional one-sentence summary of the plan

Exact tool call shape:
\`\`\`json
{
  "content": "# Plan\\n...",
  "summary": "One-sentence summary of the plan."
}
\`\`\`

If summary is not useful, omit it from the tool call rather than passing an empty string. Do not create target branches or write Branch Memory in this workflow.`;

type WritePlanPromptBodyResolution =
	| { type: "resolved"; body: string }
	| { type: "fallback"; body: string; warning: string };

export function buildWritePlanPrompt(
	steering: string,
	promptBody = DEFAULT_WRITE_PLAN_PROMPT_BODY,
): string {
	return `This is a /enriched-plan:save request. Write a detailed implementation plan and save it in the local plan store.

${formatSteeringBlock(steering)}

${promptBody}`;
}

export function buildWriteGrilledPlanPrompt(steering: string): string {
	return `This is a /enriched-plan:grill-and-save request. Write a detailed implementation plan and save it in the local plan store after structured requirements grilling.

${formatSteeringBlock(steering)}

Plan audience and target inference:
- Treat the saved Markdown plan as self-contained context for a completely fresh downstream implementation session.
- User steering may be empty. Infer the planning target from explicit steering, nearby conversation/session context, and repository evidence, such as a just-produced objective summary or prototype plan.
- Inspect repository evidence before asking. Do not ask questions answerable from local files, docs, or commands.

Structured grilling contract:
- Use ${GRILL_ASK_TOOL_NAME} for every user-facing grilling question.
- Ask exactly one question per ${GRILL_ASK_TOOL_NAME} call.
- Each question must include 2–5 affirmative, mutually exclusive options and a recommendation with concise rationale.
- Use an adaptive 3–7 high-leverage question budget. Stop early when requirements are resolved; exceed that budget only if the user explicitly asks to continue.
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
- If the plan includes same-shape edits across multiple files, explicitly choose an execution strategy: \`ts-morph-refactor\`/\`ts-morph-analyze\` for fitting TypeScript AST work, precise edits for 1-4 files or semantic docs/specs, and \`refactor-swarm\` for 5+ file-local prose-aware or mixed code/docs/tests edits.
<!-- PLAN-VERIFICATION-WORKSTREAM:END refactor-execution-strategy-guidance -->
- Review the final Markdown plan for completeness, then call write_saved_plan_file with the complete content and optional one-sentence summary; do not generate or pass a slug.
- Report saved plan evidence and stop. Do not create a branch or write Branch Memory.`;
}

async function resolveWritePlanPromptBody(
	pi: ExtensionAPI,
	cwd: string,
): Promise<WritePlanPromptBodyResolution> {
	const repoRoot = await resolveGitRoot(pi, cwd);
	if (repoRoot.type === "failed") {
		return fallbackWritePlanPromptBody(repoRoot.reason);
	}

	try {
		return await readRepoWritePlanPromptBody(repoRoot.path);
	} catch (error) {
		return fallbackWritePlanPromptBody(
			`repo prompt ${repoPromptPath(repoRoot.path)} could not be read: ${formatErrorMessage(error)}`,
		);
	}
}

function fallbackWritePlanPromptBody(reason: string): WritePlanPromptBodyResolution {
	return {
		type: "fallback",
		body: DEFAULT_WRITE_PLAN_PROMPT_BODY,
		warning: `Falling back to built-in /enriched-plan:save prompt body because ${reason}`,
	};
}

async function resolveGitRoot(
	pi: ExtensionAPI,
	cwd: string,
): Promise<{ type: "resolved"; path: string } | { type: "failed"; reason: string }> {
	try {
		const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], {
			cwd,
			timeout: WRITE_PLAN_GIT_ROOT_TIMEOUT_MS,
		});
		if (result.killed || result.code !== 0) {
			const details = result.stderr.trim() || result.stdout.trim() || "no output";
			return {
				type: "failed",
				reason: `git root discovery failed with exit code ${result.code}: ${details}`,
			};
		}
		const root = result.stdout.trim();
		if (root.length === 0) {
			return { type: "failed", reason: "git root discovery returned an empty path" };
		}
		return { type: "resolved", path: root };
	} catch (error) {
		return { type: "failed", reason: `git root discovery failed: ${formatErrorMessage(error)}` };
	}
}

async function readRepoWritePlanPromptBody(
	repoRoot: string,
): Promise<WritePlanPromptBodyResolution> {
	const asdlPath = path.join(repoRoot, ".asdl");
	const promptDir = path.join(asdlPath, "prompts");
	const promptPath = repoPromptPath(repoRoot);
	await assertSafeDirectory(asdlPath, ".asdl");
	await assertSafeDirectory(promptDir, ".asdl/prompts");
	await assertSafeFile(promptPath, `.asdl/prompts/${WRITE_PLAN_PROMPT_NAME}.md`);

	const content = await readFile(promptPath, "utf8");
	if (content.trim().length === 0) {
		return fallbackWritePlanPromptBody(`repo prompt ${promptPath} is empty`);
	}
	return { type: "resolved", body: content };
}

async function assertSafeDirectory(targetPath: string, label: string): Promise<void> {
	const stats = await lstat(targetPath);
	if (stats.isSymbolicLink()) {
		throw new Error(`${label} is a symlink`);
	}
	if (!stats.isDirectory()) {
		throw new Error(`${label} is not a directory`);
	}
}

async function assertSafeFile(targetPath: string, label: string): Promise<void> {
	const stats = await lstat(targetPath);
	if (stats.isSymbolicLink()) {
		throw new Error(`${label} is a symlink`);
	}
	if (!stats.isFile()) {
		throw new Error(`${label} is not a file`);
	}
}

function repoPromptPath(repoRoot: string): string {
	return path.join(repoRoot, ".asdl", "prompts", `${WRITE_PLAN_PROMPT_NAME}.md`);
}

export async function handleWritePlanCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: CommandContext,
): Promise<void> {
	await ctx.waitForIdle();
	const steering = args.trim();
	if (ctx.hasUI) {
		ctx.ui.notify("Starting /enriched-plan:save planning turn…", "info");
	}
	const promptBody = await resolveWritePlanPromptBody(pi, ctx.cwd);
	if (promptBody.type === "fallback" && ctx.hasUI) {
		ctx.ui.notify(promptBody.warning, "warning");
	}
	pi.sendUserMessage(buildWritePlanPrompt(steering, promptBody.body));
}

export async function handleWriteGrilledPlanCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: CommandContext,
): Promise<void> {
	await ctx.waitForIdle();
	const steering = args.trim();
	if (ctx.hasUI) {
		ctx.ui.notify("Starting /enriched-plan:grill-and-save planning grill…", "info");
	}
	pi.sendUserMessage(buildWriteGrilledPlanPrompt(steering));
}

export function buildWriteSavedPlanFileTool(
	pi: ExtensionAPI,
	options: BranchContextExtensionOptions,
): ToolDefinition {
	return {
		name: WRITE_SAVED_PLAN_FILE_TOOL_NAME,
		label: "Write Saved Plan File",
		description:
			"Create a reviewed, self-contained Markdown implementation plan file for a fresh downstream implementation session in the local plan store at `~/.asdl/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md`. The tool derives the saved-plan filename slug from the content through the Codex-backed slug model, derives repo and current branch from git, validates the slug, creates parent directories, refuses to overwrite an existing file, writes the full Markdown content, and returns path evidence. It does not create branches or write Branch Memory.",
		promptSnippet:
			"Create a reviewed, self-contained Markdown implementation plan file in the local plan store under `~/.asdl/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md`.",
		promptGuidelines: [
			"Use write_saved_plan_file for `/enriched-plan:save` and `/enriched-plan:grill-and-save` after producing a reviewed final Markdown plan.",
			"Do not generate or pass a saved-plan filename slug; write_saved_plan_file derives it from content through the Codex-backed slug model.",
			"write_saved_plan_file writes the local plan store under `~/.asdl/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md`; it does not create branches or write Branch Memory.",
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
				const slugProgressInterval: ReturnType<typeof setInterval> | undefined =
					onUpdate === undefined && !canSetWriteSavedPlanStatus(ctx)
						? undefined
						: setInterval(() => {
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
						...(signal === undefined ? {} : { signal }),
					});
				} finally {
					if (slugProgressInterval !== undefined) {
						clearInterval(slugProgressInterval);
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
				const evidence = await operations.writeSavedPlanFile(
					pi,
					buildSavedPlanFileParams(toolParams, slugEvidence.slug),
					{
						cwd: ctx.cwd,
						signal,
						planStoreRoot: resolvePlanStoreRootOption(options),
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
	pi: ExtensionAPI,
	options: BranchContextExtensionOptions = {},
): void {
	pi.registerCommand(WRITE_PLAN_COMMAND_NAME, {
		description: "Write and save a reviewed implementation plan in the local plan store.",
		handler: async (args, ctx) => handleWritePlanCommand(pi, args, ctx),
	});

	pi.registerCommand(WRITE_GRILLED_PLAN_COMMAND_NAME, {
		description: "Write and save a grilled implementation plan using structured requirements UI.",
		handler: async (args, ctx) => handleWriteGrilledPlanCommand(pi, args, ctx),
	});

	pi.registerTool(buildWriteSavedPlanFileTool(pi, options));
}
