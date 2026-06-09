import { Text, type Component } from "@earendil-works/pi-tui";
import { formatPlannedBranchUpAndImplFollowUpFlow, runPlannedBranchUpAndImplLaunch } from "@asdl/ccc/planned-branch-up-and-impl";
import {
	PLAN_BRANCH_NAMESPACE,
	PLANNED_BRANCH_OUTPUT_MESSAGE_TYPE,
	buildImplPlannedBranchPrompt,
	createPlannedBranchFromFile as createPlannedBranchFromFilePrimitive,
	derivePlanContentSlug,
	deriveTargetBranch,
	formatLoadedAttachedPlanEvidence,
	formatPlanBranchEvidence,
	loadPlannedBranchPlan,
	type BranchCreationMethod,
	type LoadedAttachedPlan,
	type PlanContentSlugEvidence,
	type PlannedBranchEvidence,
	type PlannedBranchOutputDetails,
} from "@asdl/planned-branch";
import {
	WRITE_SAVED_PLAN_FILE_TOOL_NAME,
	formatSavedPlanFileEvidence,
	resolveSelectedSavedPlanFile as resolveSelectedSavedPlanFilePrimitive,
	writeSavedPlanFile as writeSavedPlanFilePrimitive,
	type ExecOptions,
	type SavedPlanFileEvidence,
	type SelectedSavedPlanFile,
} from "@asdl/plans";
import type { ExecResult } from "./command-runtime.ts";
import { formatErrorMessage, isRecord } from "./cmux/primitives.ts";
import { GRILL_ASK_TOOL_NAME } from "./grill-ui.ts";
import { deriveSavedPlanContentSlug, type SavedPlanContentSlugEvidence } from "./planned-branch/saved-plan-content-slug.ts";

export type { ExecResult } from "./command-runtime.ts";
export {
	PLAN_BRANCH_NAMESPACE,
	createPlannedBranchFromFile,
	deriveTargetBranch,
	validateTargetBranchName,
} from "@asdl/planned-branch";
export {
	buildRepoPlanStoreKey,
	defaultPlanStoreRoot,
	encodeBranchForPlanPath,
	findLatestSavedPlanFile,
	formatSavedPlanFileEvidence,
	isPathInside,
	normalizePlanFilePath,
	normalizeRepoOriginUrl,
	resolvePlanStoreDirectory,
	sanitizePlanPathSegment,
	validatePlanSlug,
	writeSavedPlanFile,
} from "@asdl/plans";
export type { BranchCreationMethod, CreatePlannedBranchFromFileParams } from "@asdl/planned-branch";
export type {
	LatestSavedPlanFileEvidence,
	PlanStoreDirectoryEvidence,
	RepoIdentitySource,
	SavedPlanFileEvidence,
	SavedPlanFileParams,
	PlanStoreOptions,
} from "@asdl/plans";

const WRITE_PLAN_COMMAND_NAME = "plans:write";
const WRITE_GRILLED_PLAN_COMMAND_NAME = "plans:grill-and-write";
const CREATE_PLANNED_BRANCH_COMMAND_NAME = "planned-branch:create";
const UP_AND_IMPL_COMMAND_NAME = "planned-branch:up-and-impl";
const IMPL_PLANNED_BRANCH_COMMAND_NAME = "planned-branch:impl";
const WRITE_PLAN_TOOL_STATUS_KEY = "plans:write";
const PLANNED_BRANCH_STATUS_KEY = "planned-branch:create";
const UP_AND_IMPL_STATUS_KEY = "planned-branch:up-and-impl";
const IMPL_PLANNED_BRANCH_STATUS_KEY = "planned-branch:impl";

type NotifyLevel = "info" | "warning" | "error";

interface TextContent {
	type: "text";
	text: string;
}

type CustomMessageContent = string | TextContent[];

interface CustomMessage {
	customType: string;
	content: CustomMessageContent;
	display: boolean;
	details?: unknown;
}

interface ToolResult {
	content: TextContent[];
	details?: unknown;
}

type ToolUpdateHandler = (update: Partial<ToolResult>) => void;

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

type SessionHistoryEntry = unknown;

interface SessionManagerLike {
	getBranch?(): SessionHistoryEntry[];
	getEntries?(): SessionHistoryEntry[];
	getSessionFile?(): string | undefined;
}

interface NewSessionResult {
	cancelled: boolean;
}

interface ReplacedSessionContext extends CommandContext {
	sendMessage(message: CustomMessage, options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" }): Promise<void> | void;
	sendUserMessage(content: string): Promise<void> | void;
}

interface NewSessionOptions {
	parentSession?: string;
	setup?(sessionManager: SessionManagerLike): Promise<void> | void;
	withSession?(ctx: ReplacedSessionContext): Promise<void> | void;
}

export interface PlannedBranchExtensionOptions {
	plannedBranchDefaultCreation?: BranchCreationMethod;
	plannedBranchPrefix?: string;
	planStoreRoot?: string;
}

export interface CreatePlannedBranchArgs {
	help: boolean;
	dryRun: boolean;
	yes: boolean;
	branchName?: string;
	branchCreation?: BranchCreationMethod;
	filePath?: string;
}

export interface CreatePlannedBranchPreview {
	mode: "latest" | "explicit" | "session";
	slug: string;
	savedPlanFileStem: string;
	filePath: string;
	fileName: string;
	targetBranch: string;
	slugEvidence: PlanContentSlugEvidence;
	branchCreation: BranchCreationMethod;
	namespace: string;
	key: string;
	repoRoot?: string;
	repoKey?: string;
	repoIdentitySource?: string;
	sourceBranch?: string;
	branchKey?: string;
	modifiedTimeMs?: number;
	summary?: string;
}

export interface ToolContext {
	cwd: string;
	hasUI?: boolean;
	ui?: {
		setStatus?(key: string, value: string | undefined): void;
	};
}

export interface ToolRenderResultOptions {
	isPartial: boolean;
}

export interface ToolDefinition {
	name: string;
	label?: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: Record<string, unknown>;
	execute(
		toolCallId: string,
		params: unknown,
		signal: AbortSignal | undefined,
		onUpdate: ToolUpdateHandler | undefined,
		ctx: ToolContext,
	): Promise<ToolResult> | ToolResult;
	renderCall?(args: unknown, theme: unknown, context: unknown): Component;
	renderResult?(result: ToolResult, options: ToolRenderResultOptions, theme: unknown, context: unknown): Component;
}

export interface CommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
		confirm?(title: string, message?: string): Promise<boolean>;
	};
	waitForIdle(): Promise<void>;
	newSession(options?: NewSessionOptions): Promise<NewSessionResult>;
	sessionManager?: SessionManagerLike;
}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	registerTool(definition: ToolDefinition): void;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	sendMessage?(message: CustomMessage, options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" }): void;
	sendUserMessage(content: string): void;
}

export const CREATE_PLANNED_BRANCH_USAGE = `Usage: /planned-branch:create [options] [absolute-or-home-plan-file.md]

Create a planned branch from a saved plan. The branch slug and attached-plan key are derived from the plan content by a tiny Pi model, then the plan is attached to the branch in Branch Memory.

Options:
  --dry-run          Show the selected plan and target branch without mutating.
  --yes, -y          Compatibility no-op; resolved planned branches create without confirmation.
  --graphite         Create the target branch with Graphite.
  --plain-git        Create the target branch with plain Git.
  --branch <name>    Use an explicit target branch name.
  --help, -h         Show this help.

With no file path, the command prefers the most recent saved plan created in the current session, then falls back to the newest .md file in the current repo/source branch local plan store directory.
An explicit file path may be absolute or current-user home-relative with ~ or ~/; a leading @ is accepted and stripped, and the normalized result must be absolute with a .md filename.
The saved-plan filename is only a locator. If the model cannot derive and validate a content slug, the command fails without falling back to the filename.`;

export const UP_AND_IMPL_USAGE = `Usage: /planned-branch:up-and-impl [options] [absolute-or-home-plan-file.md]

Create a planned branch, attach the saved plan, check out that branch with git, start a new Pi session, and launch /planned-branch:impl for the attached plan in that new session.

Options:
  --dry-run          Show the selected plan and follow-up flow without mutating.
  --yes, -y          Compatibility no-op; resolved planned branches create without confirmation.
  --graphite         Create the target branch with Graphite.
  --plain-git        Create the target branch with plain Git.
  --branch <name>    Use an explicit target branch name.
  --help, -h         Show this help.

This command intentionally models the manual flow: /planned-branch:create, git checkout <branch>, /new, then /planned-branch:impl <key> in the new Pi session.`;

const WRITE_PLAN_PROMPT_NAME = "plans-write";
const WRITE_PLAN_PROMPT_RESOLVE_TIMEOUT_MS = 10_000;

export const DEFAULT_WRITE_PLAN_PROMPT_BODY = `Plan audience and context contract:
- Treat the saved Markdown plan as the only planning context available to a completely fresh downstream implementation session.
- Make the plan self-contained. Do not rely on this conversation, hidden context, tool transcripts, or "as discussed" references.
- Embed all relevant context discovered during planning, including user goals, constraints, current behavior, important files/symbols/tests/docs, decisions made, rationale, rejected alternatives, assumptions, risks, and validation commands.
- Prefer concrete file paths, symbol names, command names, expected outcomes, and implementation order over vague instructions.
- If you inspected evidence during planning, summarize the discovered facts in the plan so the downstream agent does not need to rediscover them unless verification is required.

External research/context contract:
- If planning used anything outside the repository — web searches, external docs, GitHub issues/PRs, API docs, CLIs hitting remote services, local files outside the repo, or other non-repo resources — include the relevant findings inline in the saved plan.
- Do not merely link to external resources. Summarize the concrete facts, constraints, examples, decisions, and caveats the downstream agent needs.
- Include source/provenance where useful: URL, command, document name, issue/PR number, accessed date/time if known, and why it mattered.
- If external findings may become stale, mark what should be revalidated during implementation.
- Do not include secrets, credentials, private tokens, or unnecessary sensitive data.

Recommended saved plan sections:
- Goal and user-visible outcome.
- Planning context and discovered facts, including relevant repository state.
- External/off-repo research context, or a note that none was used when that helps remove ambiguity.
- Files, symbols, commands, and tests likely to change.
- Step-by-step implementation approach.
- Validation commands and expected results.
- Risks, assumptions, edge cases, and open questions.

Workflow:
1. Inspect the repository, documentation, and current conversation context as needed for the requested work.
2. Produce a detailed Markdown implementation plan.
3. Review the final Markdown plan content for completeness.
4. Call write_saved_plan_file with the full Markdown content and optional one-sentence summary; do not generate or pass a slug.
5. Report the saved plan evidence: file path, repo key, repo root, repo identity source, source branch, branch path segment, slug, slug model, and summary when present.
6. Stop after reporting the saved plan evidence. Do not create a branch, write Branch Memory, or call any planned-branch command/tool.

Local plan store contract:
- Path convention: ~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<slug>.md
- <repo>: for github.com origins, gh--<owner>--<repo> from sanitized GitHub owner and repo path segments; for non-GitHub or origin-less repos, one sanitized path segment from the normalized remote.origin.url or real repo root path
- <encoded-source-branch>: current branch at plan-file creation time encoded as one filesystem-safe path segment; branch slashes become --- (for example, planned-branches/add-widget becomes planned-branches---add-widget)
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

interface ResolvedAsdlPrompt {
	name: string;
	content: string;
	provenance: {
		source: string;
		repo_prompt_path: string;
		prompt_path?: string | null | undefined;
		default_name?: string | null | undefined;
	};
}

type WritePlanPromptBodyResolution =
	| { type: "resolved"; body: string }
	| { type: "fallback"; body: string; warning: string };

export function buildWritePlanPrompt(steering: string, promptBody = DEFAULT_WRITE_PLAN_PROMPT_BODY): string {
	return `This is a /plans:write request. Write a detailed implementation plan and save it in the local plan store.

${formatSteeringBlock(steering)}

${promptBody}`;
}

export function buildWriteGrilledPlanPrompt(steering: string): string {
	return `This is a /plans:grill-and-write request. Write a detailed implementation plan and save it in the local plan store after structured requirements grilling.

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
- If material requirements remain unresolved after the budget, stop, report blockers, and do not save. Material requirements include command surface, storage behavior, user-visible semantics, validation scope, and compatibility expectations.
- If only non-blocking assumptions remain, fold them into the normal saved plan sections and proceed.
- Do not include a full Q&A transcript or special Q&A section in the saved plan.

Final plan requirements:
- Produce final Markdown with normal sections: goal/outcome, context/discovered facts, files/symbols/tests/docs, implementation steps, validation, risks/assumptions/open questions, and review/remediation.
- Review the final Markdown plan for completeness, then call write_saved_plan_file with the complete content and optional one-sentence summary; do not generate or pass a slug.
- Report saved plan evidence and stop. Do not create a branch or write Branch Memory.`;
}

async function resolveWritePlanPromptBody(pi: ExtensionAPI, cwd: string): Promise<WritePlanPromptBodyResolution> {
	try {
		const result = await pi.exec(
			"asdl",
			["exec", "resolve-prompt", WRITE_PLAN_PROMPT_NAME, "--format", "json"],
			{ cwd, timeout: WRITE_PLAN_PROMPT_RESOLVE_TIMEOUT_MS },
		);
		if (result.code !== 0) {
			return fallbackWritePlanPromptBody(
				`asdl exec resolve-prompt failed with exit code ${result.code}: ${result.stderr ?? result.stdout ?? "(no output)"}`,
			);
		}

		const resolved = parseResolvePromptJson(result.stdout, WRITE_PLAN_PROMPT_NAME);
		if (resolved === undefined) {
			return fallbackWritePlanPromptBody("asdl exec resolve-prompt returned malformed JSON output.");
		}
		if (resolved.content.trim().length === 0) {
			return fallbackWritePlanPromptBody("asdl exec resolve-prompt returned empty prompt content.");
		}

		return { type: "resolved", body: resolved.content };
	} catch (error) {
		return fallbackWritePlanPromptBody(`asdl exec resolve-prompt failed: ${formatErrorMessage(error)}`);
	}
}

function fallbackWritePlanPromptBody(reason: string): WritePlanPromptBodyResolution {
	return {
		type: "fallback",
		body: DEFAULT_WRITE_PLAN_PROMPT_BODY,
		warning: `Falling back to built-in /plans:write prompt body because ${reason}`,
	};
}

function parseResolvePromptJson(stdout: string, expectedName: string): ResolvedAsdlPrompt | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return undefined;
	}

	if (!isRecord(parsed) || !isRecord(parsed.data)) {
		return undefined;
	}

	const data = parsed.data;
	const provenance = data.provenance;
	if (typeof data.name !== "string" || data.name !== expectedName || typeof data.content !== "string" || !isRecord(provenance)) {
		return undefined;
	}
	if (typeof provenance.source !== "string" || typeof provenance.repo_prompt_path !== "string") {
		return undefined;
	}
	const promptPath = provenance.prompt_path;
	const defaultName = provenance.default_name;
	if (!isOptionalString(promptPath) || !isOptionalString(defaultName)) {
		return undefined;
	}

	return {
		name: data.name,
		content: data.content,
		provenance: {
			source: provenance.source,
			repo_prompt_path: provenance.repo_prompt_path,
			prompt_path: promptPath,
			default_name: defaultName,
		},
	};
}

function isOptionalString(value: unknown): value is string | null | undefined {
	return value === undefined || value === null || typeof value === "string";
}

class CreatePlannedBranchUsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CreatePlannedBranchUsageError";
	}
}

export function parseCreatePlannedBranchArgs(rawArgs: string): CreatePlannedBranchArgs {
	const parsed: CreatePlannedBranchArgs = { help: false, dryRun: false, yes: false };
	const tokens = rawArgs
		.trim()
		.split(/\s+/)
		.filter((token) => token.length > 0);
	const positional: string[] = [];

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === undefined) {
			continue;
		}

		if (token === "--help" || token === "-h") {
			parsed.help = true;
			continue;
		}
		if (token === "--dry-run") {
			parsed.dryRun = true;
			continue;
		}
		if (token === "--yes" || token === "-y") {
			parsed.yes = true;
			continue;
		}
		if (token === "--graphite") {
			setBranchCreation(parsed, "graphite");
			continue;
		}
		if (token === "--plain-git") {
			setBranchCreation(parsed, "plain-git");
			continue;
		}
		if (token === "--branch") {
			const value = tokens[index + 1];
			if (value === undefined || value.startsWith("-")) {
				throw new CreatePlannedBranchUsageError("Missing value for --branch.");
			}
			parsed.branchName = value;
			index += 1;
			continue;
		}
		if (token.startsWith("--branch=")) {
			const value = token.slice("--branch=".length);
			if (value.length === 0) {
				throw new CreatePlannedBranchUsageError("Missing value for --branch.");
			}
			parsed.branchName = value;
			continue;
		}
		if (token.startsWith("-")) {
			throw new CreatePlannedBranchUsageError(`Unknown flag: ${token}`);
		}

		positional.push(token);
	}

	if (positional.length > 1) {
		throw new CreatePlannedBranchUsageError("Expected at most one plan file path.");
	}
	const filePath = positional[0];
	if (filePath !== undefined) {
		parsed.filePath = filePath;
	}

	return parsed;
}

function setBranchCreation(args: CreatePlannedBranchArgs, branchCreation: BranchCreationMethod): void {
	if (args.branchCreation !== undefined && args.branchCreation !== branchCreation) {
		throw new CreatePlannedBranchUsageError("Cannot pass both --graphite and --plain-git.");
	}
	args.branchCreation = branchCreation;
}

export async function resolveCreatePlannedBranchPreview(
	pi: ExtensionAPI,
	args: CreatePlannedBranchArgs,
	ctx: CommandContext,
	options: PlannedBranchExtensionOptions = {},
): Promise<CreatePlannedBranchPreview> {
	const selected = await resolveSelectedSavedPlanFile(pi, args, ctx, options);
	const selectedFile = selectedSavedPlanFileInfo(selected);
	ctx.ui.setStatus(PLANNED_BRANCH_STATUS_KEY, "deriving branch slug from plan content…");
	const slugEvidence = await derivePlanContentSlug(pi, { filePath: selectedFile.filePath, cwd: ctx.cwd });
	const branchCreation = args.branchCreation ?? resolvePlannedBranchDefaultCreation(options);
	const targetBranch = derivePlannedTargetBranch(args, slugEvidence.slug, options);
	const base = {
		slug: slugEvidence.slug,
		savedPlanFileStem: selected.savedPlanFileStem,
		filePath: selectedFile.filePath,
		fileName: selectedFile.fileName,
		targetBranch,
		branchCreation,
		slugEvidence,
		namespace: PLAN_BRANCH_NAMESPACE,
		key: `${slugEvidence.slug}.md`,
	};

	if (selected.type === "explicit") {
		return { ...base, mode: "explicit" };
	}

	return {
		...base,
		mode: selected.type,
		repoRoot: selected.plan.repoRoot,
		repoKey: selected.plan.repoKey,
		repoIdentitySource: selected.plan.repoIdentitySource,
		sourceBranch: selected.plan.sourceBranch,
		branchKey: selected.plan.branchKey,
		modifiedTimeMs: selected.plan.modifiedTimeMs,
		...(selected.type === "session" && selected.plan.summary !== undefined ? { summary: selected.plan.summary } : {}),
	};
}

export function formatCreatePlannedBranchPreview(preview: CreatePlannedBranchPreview): string {
	const lines = [
		preview.mode === "explicit"
			? "Explicit saved plan file:"
			: preview.mode === "session"
				? "Saved plan from current session:"
				: "Latest saved plan from local plan store:",
	];
	lines.push(`Path: ${preview.filePath}`);
	lines.push(`Saved-plan file stem: ${preview.savedPlanFileStem}`);
	lines.push(`Content-derived slug: ${preview.slug}`);
	lines.push(`Slug model: ${preview.slugEvidence.provider}/${preview.slugEvidence.model}`);
	if (preview.mode !== "explicit") {
		lines.push(`Repo key: ${preview.repoKey}`);
		lines.push(`Repo root: ${preview.repoRoot}`);
		lines.push(`Repo identity source: ${preview.repoIdentitySource}`);
		lines.push(`Source branch: ${preview.sourceBranch}`);
		lines.push(`Branch path segment: ${preview.branchKey}`);
		if (preview.modifiedTimeMs !== undefined) {
			lines.push(`Modified: ${new Date(preview.modifiedTimeMs).toISOString()}`);
		}
	}
	lines.push("");
	lines.push("Target:");
	lines.push(`Branch: ${preview.targetBranch}`);
	lines.push(`Branch creation: ${preview.branchCreation}`);
	lines.push("Attach plan as:");
	lines.push(`Branch Memory namespace: ${preview.namespace}`);
	lines.push(`Branch Memory key: ${preview.key}`);
	return lines.join("\n");
}

export default function registerPlannedBranchExtension(
	pi: ExtensionAPI,
	options: PlannedBranchExtensionOptions = {},
): void {
	pi.registerCommand(WRITE_PLAN_COMMAND_NAME, {
		description: "Write and save a reviewed implementation plan in the local plan store.",
		handler: async (args, ctx) => handleWritePlanCommand(pi, args, ctx),
	});

	pi.registerCommand(WRITE_GRILLED_PLAN_COMMAND_NAME, {
		description: "Write and save a grilled implementation plan using structured requirements UI.",
		handler: async (args, ctx) => handleWriteGrilledPlanCommand(pi, args, ctx),
	});

	pi.registerCommand(CREATE_PLANNED_BRANCH_COMMAND_NAME, {
		description: "Create a planned branch using a content-derived slug, then attach the saved plan in Branch Memory.",
		handler: async (args, ctx) => handleCreatePlannedBranchCommand(pi, args, ctx, options),
	});

	pi.registerCommand(UP_AND_IMPL_COMMAND_NAME, {
		description: "Create a planned branch, check it out, and implement the attached plan in a new Pi session.",
		handler: async (args, ctx) => handleUpAndImplCommand(pi, args, ctx, options),
	});

	pi.registerCommand(IMPL_PLANNED_BRANCH_COMMAND_NAME, {
		description: "Implement from the attached or latest saved planned-branch plan.",
		handler: async (args, ctx) => handleImplPlannedBranchCommand(pi, args, ctx, options),
	});

	pi.registerTool(buildWriteSavedPlanFileTool(pi, options));
}

async function handleWritePlanCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();
	const steering = args.trim();
	if (ctx.hasUI) {
		ctx.ui.notify("Starting /plans:write planning turn…", "info");
	}
	const promptBody = await resolveWritePlanPromptBody(pi, ctx.cwd);
	if (promptBody.type === "fallback" && ctx.hasUI) {
		ctx.ui.notify(promptBody.warning, "warning");
	}
	pi.sendUserMessage(buildWritePlanPrompt(steering, promptBody.body));
}

async function handleWriteGrilledPlanCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();
	const steering = args.trim();
	if (ctx.hasUI) {
		ctx.ui.notify("Starting /plans:grill-and-write planning grill…", "info");
	}
	pi.sendUserMessage(buildWriteGrilledPlanPrompt(steering));
}

async function handleImplPlannedBranchCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: CommandContext,
	options: PlannedBranchExtensionOptions,
): Promise<void> {
	await ctx.waitForIdle();
	const trimmedArgs = args.trim();
	if (ctx.hasUI) {
		ctx.ui.notify("Loading attached planned-branch plan…", "info");
	}

	ctx.ui.setStatus(IMPL_PLANNED_BRANCH_STATUS_KEY, "loading attached plan…");
	try {
		const params = trimmedArgs.length > 0 ? { requestedKey: trimmedArgs } : {};
		const plan = await loadPlannedBranchPlan(pi, params, {
			cwd: ctx.cwd,
			planStoreRoot: resolvePlanStoreRootOption(options),
			sessionEntries: ctx.sessionManager?.getBranch?.() ?? [],
		});
		presentPlannedBranchMessage(pi, ctx, formatLoadedAttachedPlanEvidence(plan), { status: "success", loadedPlan: plan }, "info");
		pi.sendUserMessage(buildImplPlannedBranchPrompt(plan));
	} catch (error) {
		presentPlannedBranchFailure(pi, ctx, "Failed to load planned-branch plan.", error);
	} finally {
		ctx.ui.setStatus(IMPL_PLANNED_BRANCH_STATUS_KEY, undefined);
	}
}

async function handleCreatePlannedBranchCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: CommandContext,
	options: PlannedBranchExtensionOptions,
): Promise<void> {
	await ctx.waitForIdle();

	let args: CreatePlannedBranchArgs;
	try {
		args = parseCreatePlannedBranchArgs(rawArgs);
	} catch (error) {
		if (error instanceof CreatePlannedBranchUsageError) {
			presentPlannedBranchMessage(pi, ctx, `Usage error: ${error.message}\n\n${CREATE_PLANNED_BRANCH_USAGE}`, { status: "usage" }, "error");
			return;
		}
		throw error;
	}

	if (args.help) {
		presentPlannedBranchMessage(pi, ctx, CREATE_PLANNED_BRANCH_USAGE, { status: "usage" }, "info");
		return;
	}

	let preview: CreatePlannedBranchPreview;
	ctx.ui.setStatus(PLANNED_BRANCH_STATUS_KEY, "finding saved plan…");
	try {
		preview = await resolveCreatePlannedBranchPreview(pi, args, ctx, options);
	} catch (error) {
		presentPlannedBranchFailure(pi, ctx, "Failed to resolve saved plan file or derive branch slug.", error);
		return;
	} finally {
		ctx.ui.setStatus(PLANNED_BRANCH_STATUS_KEY, undefined);
	}

	if (args.dryRun) {
		const previewText = formatCreatePlannedBranchPreview(preview);
		presentPlannedBranchMessage(
			pi,
			ctx,
			`Dry run: no branch was created and no plan was attached.\n\n${previewText}`,
			{ status: "dry-run", preview },
			"info",
		);
		return;
	}

	ctx.ui.setStatus(PLANNED_BRANCH_STATUS_KEY, "creating branch and attaching plan…");
	try {
		const evidence = await createPlannedBranchFromPreview(pi, preview, ctx);
		presentPlannedBranchMessage(pi, ctx, formatPlanBranchEvidence(evidence), { status: "success", preview, evidence }, "info");
	} catch (error) {
		presentPlannedBranchFailure(pi, ctx, "Failed to create planned branch and attach the plan.", error, preview);
	} finally {
		ctx.ui.setStatus(PLANNED_BRANCH_STATUS_KEY, undefined);
	}
}

async function handleUpAndImplCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: CommandContext,
	options: PlannedBranchExtensionOptions,
): Promise<void> {
	await ctx.waitForIdle();

	let args: CreatePlannedBranchArgs;
	try {
		args = parseCreatePlannedBranchArgs(rawArgs);
	} catch (error) {
		if (error instanceof CreatePlannedBranchUsageError) {
			presentPlannedBranchMessage(pi, ctx, `Usage error: ${error.message}\n\n${UP_AND_IMPL_USAGE}`, { status: "usage" }, "error");
			return;
		}
		throw error;
	}

	if (args.help) {
		presentPlannedBranchMessage(pi, ctx, UP_AND_IMPL_USAGE, { status: "usage" }, "info");
		return;
	}

	let preview: CreatePlannedBranchPreview;
	ctx.ui.setStatus(UP_AND_IMPL_STATUS_KEY, "finding saved plan…");
	try {
		preview = await resolveCreatePlannedBranchPreview(pi, args, ctx, options);
	} catch (error) {
		presentPlannedBranchFailure(pi, ctx, "Failed to resolve saved plan file or derive branch slug.", error);
		return;
	} finally {
		ctx.ui.setStatus(UP_AND_IMPL_STATUS_KEY, undefined);
	}

	if (args.dryRun) {
		const previewText = formatCreatePlannedBranchPreview(preview);
		presentPlannedBranchMessage(
			pi,
			ctx,
			`Dry run: no branch was created, no checkout happened, no new session was started, and no implementation prompt was sent.\n\n${previewText}\n\nNew-session implementation flow:\n${formatPlannedBranchUpAndImplFollowUpFlow(preview.targetBranch, preview.key)}`,
			{ status: "dry-run", preview },
			"info",
		);
		return;
	}

	ctx.ui.setStatus(UP_AND_IMPL_STATUS_KEY, "creating branch and attaching plan…");
	let evidence: PlannedBranchEvidence;
	try {
		evidence = await createPlannedBranchFromPreview(pi, preview, ctx);
	} catch (error) {
		ctx.ui.setStatus(UP_AND_IMPL_STATUS_KEY, undefined);
		presentPlannedBranchFailure(pi, ctx, "Failed to create planned branch and attach the plan.", error, preview);
		return;
	}

	presentPlannedBranchMessage(pi, ctx, formatPlanBranchEvidence(evidence), { status: "success", preview, evidence }, "info");

	const launchResult = await runPlannedBranchUpAndImplLaunch({ host: pi, ctx, statusKey: UP_AND_IMPL_STATUS_KEY, evidence });
	if (launchResult.type === "launched") {
		return;
	}
	if (launchResult.type === "cancelled") {
		presentPlannedBranchMessage(pi, ctx, launchResult.message, { status: "cancelled", preview, evidence }, "warning");
		return;
	}

	const title =
		launchResult.phase === "checkout"
			? "Created planned branch and attached the plan, but failed to check out the planned branch."
			: "Created planned branch, attached the plan, and checked out the planned branch, but failed to start the implementation session.";
	presentPlannedBranchFailure(pi, ctx, title, launchResult.message, preview);
}

async function createPlannedBranchFromPreview(
	pi: ExtensionAPI,
	preview: CreatePlannedBranchPreview,
	ctx: CommandContext,
): Promise<PlannedBranchEvidence> {
	const params: { slug: string; filePath: string; branchCreation: BranchCreationMethod; branchName?: string; summary?: string } = {
		slug: preview.slug,
		filePath: preview.filePath,
		branchCreation: preview.branchCreation,
	};
	if (preview.targetBranch !== preview.slug) {
		params.branchName = preview.targetBranch;
	}
	if (preview.summary !== undefined) {
		params.summary = preview.summary;
	}

	return createPlannedBranchFromFilePrimitive(pi, params, { cwd: ctx.cwd });
}

function buildWriteSavedPlanFileTool(pi: ExtensionAPI, options: PlannedBranchExtensionOptions): ToolDefinition {
	return {
		name: WRITE_SAVED_PLAN_FILE_TOOL_NAME,
		label: "Write Saved Plan File",
		description:
			"Create a reviewed, self-contained Markdown implementation plan file for a fresh downstream implementation session in the local plan store at `~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<slug>.md`. The tool derives the saved-plan filename slug from the content through the Codex-backed slug model, derives repo and current branch from git, validates the slug, creates parent directories, refuses to overwrite an existing file, writes the full Markdown content, and returns path evidence. It does not create branches or write Branch Memory.",
		promptSnippet:
			"Create a reviewed, self-contained Markdown implementation plan file in the local plan store under `~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<slug>.md`.",
		promptGuidelines: [
			"Use write_saved_plan_file for `/plans:write` and `/plans:grill-and-write` after producing a reviewed final Markdown plan.",
			"Do not generate or pass a saved-plan filename slug; write_saved_plan_file derives it from content through the Codex-backed slug model.",
			"write_saved_plan_file writes the local plan store under `~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<slug>.md`; it does not create branches or write Branch Memory.",
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
			try {
				emitWriteSourcePlanProgress(onUpdate, ctx, "Validating saved plan input…", { phase: "validating" });
				const toolParams = parseWriteSavedPlanFileToolParams(params);
				emitWriteSourcePlanProgress(onUpdate, ctx, "Deriving saved-plan filename slug with Codex…", { phase: "deriving-slug" });
				const slugStartedAt = Date.now();
				const slugProgressInterval: ReturnType<typeof setInterval> | undefined =
					onUpdate === undefined && !canSetWriteSourcePlanStatus(ctx)
						? undefined
						: setInterval(() => {
								const elapsedSeconds = Math.round((Date.now() - slugStartedAt) / 1_000);
								emitWriteSourcePlanProgress(
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
				emitWriteSourcePlanProgress(
					onUpdate,
					ctx,
					`Derived slug ${slugEvidence.slug}; resolving repo/branch and writing plan file…`,
					{ phase: "writing-file", slug: slugEvidence.slug },
				);
				emitWriteSourcePlanProgress(onUpdate, ctx, "Writing plan file…", { phase: "writing-file", slug: slugEvidence.slug });
				const evidence = await writeSavedPlanFilePrimitive(pi, buildSavedPlanFileParams(toolParams, slugEvidence.slug), {
					cwd: ctx.cwd,
					signal,
					planStoreRoot: resolvePlanStoreRootOption(options),
				});
				const details: WriteSavedPlanFileToolDetails = { ...evidence, slugEvidence };
				return {
					content: [{ type: "text", text: formatSavedPlanFileEvidenceWithSlugModel(evidence, slugEvidence) }],
					details,
				};
			} finally {
				setWriteSourcePlanStatus(ctx, undefined);
			}
		},
		renderCall(args, _theme, context) {
			return new Text(formatWriteSavedPlanFileCall(args, context), 0, 0);
		},
		renderResult(result, { isPartial }) {
			const text = formatToolResultText(result);
			if (isPartial) {
				return new Text(`Saving planned-branch plan…\n${text}`, 0, 0);
			}
			return new Text(text, 0, 0);
		},
	};
}

function emitWriteSourcePlanProgress(
	onUpdate: ToolUpdateHandler | undefined,
	ctx: ToolContext,
	text: string,
	details: WriteSavedPlanFileProgressDetails,
): void {
	onUpdate?.({ content: [{ type: "text", text }], details });
	setWriteSourcePlanStatus(ctx, text);
}

function setWriteSourcePlanStatus(ctx: ToolContext, value: string | undefined): void {
	if (ctx.hasUI === false) {
		return;
	}
	ctx.ui?.setStatus?.(WRITE_PLAN_TOOL_STATUS_KEY, value);
}

function canSetWriteSourcePlanStatus(ctx: ToolContext): boolean {
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

function parseWriteSavedPlanFileToolParamsForName(params: unknown, toolName: string): WriteSavedPlanFileToolParams {
	if (!isRecord(params)) {
		throw new Error(`${toolName} parameters must be an object.`);
	}
	if ("slug" in params) {
		throw new Error(`${toolName} derives \`slug\` from content through Codex; do not pass \`slug\`.`);
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

interface PlannedBranchMessageDetails extends PlannedBranchOutputDetails {
	preview?: CreatePlannedBranchPreview;
	loadedPlan?: LoadedAttachedPlan;
}

async function resolveSelectedSavedPlanFile(
	pi: ExtensionAPI,
	args: CreatePlannedBranchArgs,
	ctx: CommandContext,
	options: PlannedBranchExtensionOptions,
): Promise<SelectedSavedPlanFile> {
	return resolveSelectedSavedPlanFilePrimitive(pi, {
		cwd: ctx.cwd,
		planStoreRoot: resolvePlanStoreRootOption(options),
		explicitPath: args.filePath,
		sessionEntries: ctx.sessionManager?.getBranch?.() ?? [],
		shouldFallbackToLatest: true,
	});
}

function selectedSavedPlanFileInfo(selected: SelectedSavedPlanFile): { filePath: string; fileName: string } {
	if (selected.type === "explicit") {
		return { filePath: selected.filePath, fileName: selected.fileName };
	}
	return { filePath: selected.plan.filePath, fileName: selected.plan.fileName };
}

function resolvePlannedBranchDefaultCreation(options: PlannedBranchExtensionOptions): BranchCreationMethod {
	return options.plannedBranchDefaultCreation ?? "plain-git";
}

function resolvePlanStoreRootOption(options: PlannedBranchExtensionOptions): string | undefined {
	return options.planStoreRoot;
}

function derivePlannedTargetBranch(
	args: CreatePlannedBranchArgs,
	slug: string,
	options: PlannedBranchExtensionOptions,
): string {
	if (args.branchName !== undefined) {
		return deriveTargetBranch(args.branchName, slug);
	}

	const prefix = options.plannedBranchPrefix?.trim();
	if (prefix !== undefined && prefix.length > 0) {
		return `${prefix}${slug}`;
	}

	return deriveTargetBranch(undefined, slug);
}

function presentPlannedBranchFailure(
	pi: ExtensionAPI,
	ctx: CommandContext,
	title: string,
	error: unknown,
	preview?: CreatePlannedBranchPreview,
): void {
	const message = error instanceof Error ? error.message : String(error);
	const details: PlannedBranchMessageDetails = { status: "failure", error: message };
	if (preview !== undefined) {
		details.preview = preview;
	}
	presentPlannedBranchMessage(pi, ctx, `${title}\n\n${message}`, details, "error");
}

function presentPlannedBranchMessage(
	pi: ExtensionAPI,
	ctx: CommandContext,
	content: string,
	details: PlannedBranchMessageDetails,
	level: NotifyLevel,
): void {
	if (pi.sendMessage) {
		pi.sendMessage({
			customType: PLANNED_BRANCH_OUTPUT_MESSAGE_TYPE,
			content,
			display: true,
			details,
		});
		return;
	}

	if (ctx.hasUI) {
		ctx.ui.notify(content, level);
		return;
	}

	if (level === "error") {
		console.error(content);
		return;
	}
	console.log(content);
}

function formatSteeringBlock(steering: string): string {
	const trimmedSteering = steering.trim();
	if (!trimmedSteering) {
		return "User steering for this planning request: (none)";
	}

	return `User steering for this planning request:\n\n\`\`\`text\n${trimmedSteering}\n\`\`\``;
}
