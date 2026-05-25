import { stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";

import {
	PLAN_BRANCH_NAMESPACE,
	createBrmemPlanBranchFromFile as createBrmemPlanBranchFromFilePrimitive,
	deriveTargetBranch,
	type BranchCreationMethod,
	type BrmemPlanBranchEvidence,
} from "./brmem-plans/plan-branch.ts";
import { isPathInside, normalizePlanFilePath, validatePlanSlug, type ExecOptions } from "./brmem-plans/plan-persistence.ts";
import {
	findLatestSourceBranchPlanFile,
	formatSourceBranchPlanFileEvidence,
	resolvePlanStoreDirectory,
	writeSourceBranchPlanFile as writeSourceBranchPlanFilePrimitive,
	type LatestSourceBranchPlanFileEvidence,
	type PlanStoreDirectoryEvidence,
	type SourceBranchPlanFileEvidence,
} from "./brmem-plans/source-plan-file.ts";
import type { ExecResult } from "./command-runtime.ts";

export type { ExecResult } from "./command-runtime.ts";
export { isPathInside, normalizePlanFilePath, validatePlanSlug } from "./brmem-plans/plan-persistence.ts";
export {
	PLAN_BRANCH_NAMESPACE,
	createBrmemPlanBranchFromFile,
	deriveTargetBranch,
	validateTargetBranchName,
} from "./brmem-plans/plan-branch.ts";
export type { BranchCreationMethod, BrmemPlanBranchEvidence, CreateBrmemPlanBranchParams } from "./brmem-plans/plan-branch.ts";
export {
	buildRepoArchiveKey,
	defaultPlanArchiveRoot,
	defaultPlanStoreRoot,
	encodeBranchForPlanPath,
	findLatestSourceBranchPlanFile,
	formatSourceBranchPlanFileEvidence,
	normalizeRepoOriginUrl,
	resolvePlanStoreDirectory,
	resolveSourceBranchPlanArchiveDirectory,
	sanitizePlanPathSegment,
	writeSourceBranchPlanFile,
} from "./brmem-plans/source-plan-file.ts";
export type {
	LatestSourceBranchPlanFileEvidence,
	PlanStoreDirectoryEvidence,
	RepoIdentitySource,
	SourceBranchPlanArchiveDirectoryEvidence,
	SourceBranchPlanFileEvidence,
	SourceBranchPlanFileOptions,
	SourceBranchPlanFileParams,
} from "./brmem-plans/source-plan-file.ts";

const WRITE_PLAN_COMMAND_NAME = "write-plan";
const CREATE_PLANNED_BRANCH_COMMAND_NAME = "create-planned-branch";
const IMPL_PLANNED_BRANCH_COMMAND_NAME = "impl-planned-branch";
const WRITE_SOURCE_BRANCH_PLAN_FILE_TOOL_NAME = "write_source_branch_plan_file";
const PLANNED_BRANCH_MESSAGE_TYPE = "planned-branch-output";
const PLANNED_BRANCH_STATUS_KEY = "create-planned-branch";

const BRMEM_PLAN_IMPL_SKILL_COMMAND = "/skill:brmem-plan-impl";

type NotifyLevel = "info" | "warning" | "error";

type TextContent = {
	type: "text";
	text: string;
};

type CustomMessageContent = string | TextContent[];

type CustomMessage = {
	customType: string;
	content: CustomMessageContent;
	display: boolean;
	details?: unknown;
};

type ToolResult = {
	content: TextContent[];
	details?: unknown;
};

type SessionHistoryEntry = unknown;

type SessionManagerLike = {
	getBranch?(): SessionHistoryEntry[];
	getEntries?(): SessionHistoryEntry[];
};

export type CreateBrmemPlanBranchExtensionOptions = {
	plannedBranchDefaultCreation?: BranchCreationMethod;
	plannedBranchPrefix?: string;
	planStoreRoot?: string;
	/** @deprecated Use plannedBranchDefaultCreation. */
	latestPlanBranchDefaultCreation?: BranchCreationMethod;
	/** @deprecated Use planStoreRoot. */
	sourcePlanArchiveRoot?: string;
};

export type CreatePlannedBranchArgs = {
	help: boolean;
	dryRun: boolean;
	yes: boolean;
	branchName?: string;
	branchCreation?: BranchCreationMethod;
	filePath?: string;
};

export type CreatePlannedBranchPreview = {
	mode: "latest" | "explicit" | "session";
	slug: string;
	filePath: string;
	fileName: string;
	targetBranch: string;
	branchCreation: BranchCreationMethod;
	namespace: string;
	key: string;
	repoRoot?: string;
	repoKey?: string;
	repoIdentitySource?: string;
	sourceBranch?: string;
	branchKey?: string;
	modifiedTimeMs?: number;
};

export type ToolContext = {
	cwd: string;
};

export type ToolDefinition = {
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
		onUpdate: ((update: Partial<ToolResult>) => void) | undefined,
		ctx: ToolContext,
	): Promise<ToolResult> | ToolResult;
};

export type CommandContext = {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
		confirm?(title: string, message?: string): Promise<boolean>;
	};
	waitForIdle(): Promise<void>;
	sessionManager?: SessionManagerLike;
};

export type ExtensionAPI = {
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
};

export const CREATE_PLANNED_BRANCH_USAGE = `Usage: /create-planned-branch [options] [absolute-plan-file.md]

Create a planned branch from a saved plan, then attach that plan to the branch in Branch Memory.

Options:
  --dry-run          Show the selected plan and target branch without mutating.
  --yes, -y          Compatibility no-op; resolved planned branches create without confirmation.
  --graphite         Create the target branch with Graphite.
  --plain-git        Create the target branch with plain Git.
  --branch <name>    Use an explicit target branch name.
  --help, -h         Show this help.

With no file path, the command prefers the most recent valid saved plan created in the current session, then falls back to the newest .md file in the current repo/source branch local plan store directory.
An explicit file path must be absolute; a leading @ is accepted and stripped.`;

export function buildWritePlanPrompt(steering: string): string {
	return `This is a /write-plan request. Write a detailed implementation plan and save it in the local plan store.

${formatSteeringBlock(steering)}

Workflow:
1. Inspect the repository, documentation, and current conversation context as needed for the requested work.
2. Produce a detailed Markdown implementation plan.
3. Review the final Markdown plan content and choose a semantic kebab-case slug from that final content.
4. Call write_source_branch_plan_file with the slug, full Markdown content, and optional one-sentence summary.
5. Report the saved plan evidence: file path, repo key, repo root, repo identity source, source branch, branch path segment, slug, and summary when present.
6. Stop after reporting the saved plan evidence. Do not create a branch, write Branch Memory, or call any plan-branch tool.

Local plan store contract:
- Path convention: ~/.asdl/plans/<repo>/<encoded-source-branch>/<slug>.md
- <repo>: for github.com origins, gh--<owner>--<repo> from sanitized GitHub owner and repo path segments; for non-GitHub or origin-less repos, one sanitized path segment from the normalized remote.origin.url or real repo root path
- <encoded-source-branch>: current branch at plan-file creation time encoded as one filesystem-safe path segment; branch slashes become --- (for example, brmem-plans/add-widget becomes brmem-plans---add-widget)
- <slug>: semantic kebab-case slug without .md
- Existing saved plan file: write_source_branch_plan_file refuses to overwrite it; choose a different semantic slug that still reflects the final plan content.
- Working-tree behavior: no checked-in plan file is created.

Slug rules:
- The command did not provide a slug; you must generate the final slug.
- Use kebab-case.
- Use 3–7 words.
- Make it specific to the work described by the final plan.
- Do not use dates or random IDs.
- Do not use generic-only slugs such as plan, task, implementation-plan, or work-plan.

When the plan is ready, call write_source_branch_plan_file with:
- slug: the semantic slug, without .md
- content: the complete reviewed Markdown plan content
- summary: optional one-sentence summary of the plan

Exact tool call shape:
\`\`\`json
{
  "slug": "semantic-kebab-case-slug",
  "content": "# Plan\\n...",
  "summary": "One-sentence summary of the plan."
}
\`\`\`

If summary is not useful, omit it from the tool call rather than passing an empty string. Do not create target branches or write Branch Memory in this workflow.`;
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
	options: CreateBrmemPlanBranchExtensionOptions = {},
): Promise<CreatePlannedBranchPreview> {
	const selected = await resolveSelectedSavedPlanFile(pi, args, ctx, options);
	const branchCreation = args.branchCreation ?? resolvePlannedBranchDefaultCreation(options);
	const targetBranch = derivePlannedTargetBranch(args, selected.slug, options);
	const base = {
		slug: selected.slug,
		filePath: selected.filePath,
		fileName: selected.fileName,
		targetBranch,
		branchCreation,
		namespace: PLAN_BRANCH_NAMESPACE,
		key: `${selected.slug}.md`,
	};

	if (selected.mode === "explicit") {
		return { ...base, mode: "explicit" };
	}

	return {
		...base,
		mode: selected.mode,
		repoRoot: selected.repoRoot,
		repoKey: selected.repoKey,
		repoIdentitySource: selected.repoIdentitySource,
		sourceBranch: selected.sourceBranch,
		branchKey: selected.branchKey,
		modifiedTimeMs: selected.modifiedTimeMs,
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
	lines.push(`Slug: ${preview.slug}`);
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

export default function createBrmemPlanBranchExtension(
	pi: ExtensionAPI,
	options: CreateBrmemPlanBranchExtensionOptions = {},
): void {
	pi.registerCommand(WRITE_PLAN_COMMAND_NAME, {
		description: "Write and save a reviewed implementation plan in the local plan store.",
		handler: async (args, ctx) => handleWritePlanCommand(pi, args, ctx),
	});

	pi.registerCommand(CREATE_PLANNED_BRANCH_COMMAND_NAME, {
		description: "Create a planned branch from a saved plan, then attach the plan in Branch Memory.",
		handler: async (args, ctx) => handleCreatePlannedBranchCommand(pi, args, ctx, options),
	});

	pi.registerCommand(IMPL_PLANNED_BRANCH_COMMAND_NAME, {
		description: "Implement from the attached planned-branch plan.",
		handler: async (args, ctx) => handleImplPlannedBranchCommand(pi, args, ctx),
	});

	pi.registerTool(buildWriteSourceBranchPlanFileTool(pi, options));
}

async function handleWritePlanCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();
	const steering = args.trim();
	if (ctx.hasUI) {
		ctx.ui.notify("Starting /write-plan planning turn…", "info");
	}
	pi.sendUserMessage(buildWritePlanPrompt(steering));
}

async function handleImplPlannedBranchCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();
	const trimmedArgs = args.trim();
	if (ctx.hasUI) {
		ctx.ui.notify("Starting implementation from the attached plan…", "info");
	}
	const command = trimmedArgs.length > 0 ? `${BRMEM_PLAN_IMPL_SKILL_COMMAND} ${trimmedArgs}` : BRMEM_PLAN_IMPL_SKILL_COMMAND;
	pi.sendUserMessage(command);
}

async function handleCreatePlannedBranchCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: CommandContext,
	options: CreateBrmemPlanBranchExtensionOptions,
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
		presentPlannedBranchFailure(pi, ctx, "Failed to resolve saved plan file.", error);
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
		const params: { slug: string; filePath: string; branchCreation: BranchCreationMethod; branchName?: string } = {
			slug: preview.slug,
			filePath: preview.filePath,
			branchCreation: preview.branchCreation,
		};
		if (preview.targetBranch !== preview.slug) {
			params.branchName = preview.targetBranch;
		}

		const evidence = await createBrmemPlanBranchFromFilePrimitive(pi, params, { cwd: ctx.cwd });
		presentPlannedBranchMessage(pi, ctx, formatPlanBranchEvidence(evidence), { status: "success", preview, evidence }, "info");
	} catch (error) {
		presentPlannedBranchFailure(pi, ctx, "Failed to create planned branch and attach the plan.", error, preview);
	} finally {
		ctx.ui.setStatus(PLANNED_BRANCH_STATUS_KEY, undefined);
	}
}

function buildWriteSourceBranchPlanFileTool(pi: ExtensionAPI, options: CreateBrmemPlanBranchExtensionOptions): ToolDefinition {
	return {
		name: WRITE_SOURCE_BRANCH_PLAN_FILE_TOOL_NAME,
		label: "Write Saved Plan File",
		description:
			"Create a reviewed Markdown implementation plan file in the local plan store at `~/.asdl/plans/<repo>/<encoded-source-branch>/<slug>.md`. The tool derives repo and current branch from git, validates the slug, creates parent directories, refuses to overwrite an existing file, writes the full Markdown content, and returns path evidence. It does not create branches or write Branch Memory.",
		promptSnippet:
			"Create a reviewed Markdown implementation plan file in the local plan store under `~/.asdl/plans/<repo>/<encoded-source-branch>/<slug>.md`.",
		promptGuidelines: [
			"Use write_source_branch_plan_file for `/write-plan` after producing a reviewed final Markdown plan.",
			"write_source_branch_plan_file writes the local plan store under `~/.asdl/plans/<repo>/<encoded-source-branch>/<slug>.md`; it does not create branches or write Branch Memory.",
			"If write_source_branch_plan_file reports that the saved plan file already exists, choose a different semantic slug that still reflects the final plan content; never overwrite the existing file.",
		],
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				slug: {
					type: "string",
					description: "Semantic kebab-case slug without the .md suffix.",
				},
				content: {
					type: "string",
					description: "Full reviewed Markdown plan content to write.",
				},
				summary: {
					type: "string",
					description: "Optional one-sentence summary of the plan.",
				},
			},
			required: ["slug", "content"],
		},
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const evidence = await writeSourceBranchPlanFilePrimitive(pi, params, {
				cwd: ctx.cwd,
				signal,
				planStoreRoot: resolvePlanStoreRootOption(options),
			});
			return {
				content: [{ type: "text", text: formatSourceBranchPlanFileEvidence(evidence) }],
				details: evidence,
			};
		},
	};
}

type SelectedSavedPlanFile =
	| {
			mode: "explicit";
			slug: string;
			filePath: string;
			fileName: string;
	  }
	| (LatestSourceBranchPlanFileEvidence & { mode: "latest" })
	| (LatestSourceBranchPlanFileEvidence & { mode: "session" });

type PlannedBranchMessageDetails = {
	status: "usage" | "dry-run" | "success" | "failure";
	preview?: CreatePlannedBranchPreview;
	evidence?: BrmemPlanBranchEvidence;
	error?: string;
};

async function resolveSelectedSavedPlanFile(
	pi: ExtensionAPI,
	args: CreatePlannedBranchArgs,
	ctx: CommandContext,
	options: CreateBrmemPlanBranchExtensionOptions,
): Promise<SelectedSavedPlanFile> {
	if (args.filePath === undefined) {
		const sessionEvidence = await findLatestSavedPlanFileFromSessionHistory(pi, ctx, options);
		if (sessionEvidence !== undefined) {
			return sessionEvidence;
		}

		const evidence = await findLatestSourceBranchPlanFile(pi, {
			cwd: ctx.cwd,
			planStoreRoot: resolvePlanStoreRootOption(options),
		});
		return { ...evidence, mode: "latest" };
	}

	const filePath = normalizePlanFilePath(args.filePath);
	if (!isAbsolute(filePath)) {
		throw new Error(`Plan file path must be absolute for /create-planned-branch; got ${filePath || "(empty)"}.`);
	}

	const fileName = basename(filePath);
	if (!fileName.endsWith(".md")) {
		throw new Error(`Plan file must use a .md filename; got ${fileName || "(empty)"}.`);
	}

	const slug = fileName.slice(0, -".md".length);
	const slugError = validatePlanSlug(slug);
	if (slugError !== undefined) {
		throw new Error(`Invalid plan slug derived from filename ${JSON.stringify(fileName)}: ${slugError}`);
	}

	return { mode: "explicit", slug, filePath, fileName };
}

async function findLatestSavedPlanFileFromSessionHistory(
	pi: ExtensionAPI,
	ctx: CommandContext,
	options: CreateBrmemPlanBranchExtensionOptions,
): Promise<(LatestSourceBranchPlanFileEvidence & { mode: "session" }) | undefined> {
	const entries = ctx.sessionManager?.getBranch?.();
	if (entries === undefined) {
		return undefined;
	}

	const directory = await resolvePlanStoreDirectory(pi, {
		cwd: ctx.cwd,
		planStoreRoot: resolvePlanStoreRootOption(options),
	});

	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		const evidence = extractSourcePlanEvidenceFromSessionEntry(entry);
		if (evidence === undefined) {
			continue;
		}

		const candidate = await validateSessionSavedPlanCandidate(evidence, directory);
		if (candidate !== undefined) {
			return { ...candidate, mode: "session" };
		}
	}

	return undefined;
}

function extractSourcePlanEvidenceFromSessionEntry(entry: unknown): SourceBranchPlanFileEvidence | undefined {
	if (!isRecord(entry) || entry.type !== "message") {
		return undefined;
	}

	const message = entry.message;
	if (!isRecord(message) || message.role !== "toolResult") {
		return undefined;
	}
	if (message.toolName !== WRITE_SOURCE_BRANCH_PLAN_FILE_TOOL_NAME || message.isError === true) {
		return undefined;
	}

	const details = message.details;
	if (!isRecord(details)) {
		return undefined;
	}

	const slug = details.slug;
	const repoRoot = details.repoRoot;
	const repoKey = details.repoKey;
	const repoIdentitySource = details.repoIdentitySource;
	const sourceBranch = details.sourceBranch;
	const branchKey = details.branchKey;
	const filePath = details.filePath;
	if (
		typeof slug !== "string" ||
		typeof repoRoot !== "string" ||
		typeof repoKey !== "string" ||
		typeof sourceBranch !== "string" ||
		typeof branchKey !== "string" ||
		typeof filePath !== "string"
	) {
		return undefined;
	}
	if (repoIdentitySource !== "origin-url" && repoIdentitySource !== "repo-root") {
		return undefined;
	}

	const evidence: SourceBranchPlanFileEvidence = {
		slug,
		repoRoot,
		repoKey,
		repoIdentitySource,
		sourceBranch,
		branchKey,
		filePath,
	};
	const summary = details.summary;
	if (summary === undefined) {
		return evidence;
	}
	if (typeof summary !== "string") {
		return undefined;
	}
	return { ...evidence, summary };
}

async function validateSessionSavedPlanCandidate(
	evidence: SourceBranchPlanFileEvidence,
	directory: PlanStoreDirectoryEvidence,
): Promise<LatestSourceBranchPlanFileEvidence | undefined> {
	if (validatePlanSlug(evidence.slug) !== undefined) {
		return undefined;
	}
	if (!isAbsolute(evidence.filePath) || !evidence.filePath.endsWith(".md")) {
		return undefined;
	}

	const fileName = basename(evidence.filePath);
	if (fileName !== `${evidence.slug}.md`) {
		return undefined;
	}
	if (!isPathInside(directory.directoryPath, evidence.filePath)) {
		return undefined;
	}
	if (
		evidence.repoRoot !== directory.repoRoot ||
		evidence.repoKey !== directory.repoKey ||
		evidence.repoIdentitySource !== directory.repoIdentitySource ||
		evidence.sourceBranch !== directory.sourceBranch ||
		evidence.branchKey !== directory.branchKey
	) {
		return undefined;
	}

	let fileStat: Awaited<ReturnType<typeof stat>>;
	try {
		fileStat = await stat(evidence.filePath);
	} catch {
		return undefined;
	}
	if (!fileStat.isFile()) {
		return undefined;
	}

	return {
		...directory,
		slug: evidence.slug,
		filePath: evidence.filePath,
		fileName,
		modifiedTimeMs: fileStat.mtimeMs,
	};
}

function resolvePlannedBranchDefaultCreation(options: CreateBrmemPlanBranchExtensionOptions): BranchCreationMethod {
	return options.plannedBranchDefaultCreation ?? options.latestPlanBranchDefaultCreation ?? "plain-git";
}

function resolvePlanStoreRootOption(options: CreateBrmemPlanBranchExtensionOptions): string | undefined {
	return options.planStoreRoot ?? options.sourcePlanArchiveRoot;
}

function derivePlannedTargetBranch(
	args: CreatePlannedBranchArgs,
	slug: string,
	options: CreateBrmemPlanBranchExtensionOptions,
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
			customType: PLANNED_BRANCH_MESSAGE_TYPE,
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

export function formatPlanBranchEvidence(evidence: BrmemPlanBranchEvidence): string {
	const lines = [
		"Created planned branch and attached plan.",
		`Branch: ${evidence.branch}`,
		`Branch creation: ${evidence.branchCreation}`,
		`Start point: ${evidence.startPoint}`,
		`Namespace: ${evidence.namespace}`,
		`Key: ${evidence.key}`,
		`Ref: ${evidence.refName}`,
		`Commit: ${evidence.commit}`,
		`Source file: ${evidence.sourceFile}`,
	];
	if (evidence.summary !== undefined) {
		lines.push(`Summary: ${evidence.summary}`);
	}
	return lines.join("\n");
}

function formatSteeringBlock(steering: string): string {
	const trimmedSteering = steering.trim();
	if (!trimmedSteering) {
		return "User steering for this planning request: (none)";
	}

	return `User steering for this planning request:\n\n\`\`\`text\n${trimmedSteering}\n\`\`\``;
}
