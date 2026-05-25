import {
	PLAN_BRANCH_NAMESPACE,
	createBrmemPlanBranchFromFile as createBrmemPlanBranchFromFilePrimitive,
	type BrmemPlanBranchEvidence,
} from "./brmem-plans/plan-branch.ts";
import type { ExecOptions } from "./brmem-plans/plan-persistence.ts";
import {
	formatSourceBranchPlanFileEvidence,
	writeSourceBranchPlanFile as writeSourceBranchPlanFilePrimitive,
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
	encodeBranchForPlanPath,
	formatSourceBranchPlanFileEvidence,
	normalizeRepoOriginUrl,
	sanitizePlanPathSegment,
	writeSourceBranchPlanFile,
} from "./brmem-plans/source-plan-file.ts";
export type {
	RepoIdentitySource,
	SourceBranchPlanFileEvidence,
	SourceBranchPlanFileOptions,
	SourceBranchPlanFileParams,
} from "./brmem-plans/source-plan-file.ts";

const CREATE_BRMEM_PLAN_BRANCH_COMMAND_NAME = "create-brmem-plan-branch";
const CREATE_PLAN_FILE_COMMAND_NAME = "create-plan-file";
const CREATE_BRMEM_PLAN_BRANCH_TOOL_NAME = "create_brmem_plan_branch_from_file";
const WRITE_SOURCE_BRANCH_PLAN_FILE_TOOL_NAME = "write_source_branch_plan_file";

type NotifyLevel = "info" | "warning" | "error" | "success";

type TextContent = {
	type: "text";
	text: string;
};

type ToolResult = {
	content: TextContent[];
	details?: unknown;
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
	};
	waitForIdle(): Promise<void>;
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
	sendUserMessage(content: string): void;
};

export function buildCreatePlanFilePrompt(steering: string): string {
	return `This is a /create-plan-file request. Create a detailed implementation plan and write only the source-branch plan archive file.

${formatSteeringBlock(steering)}

Workflow:
1. Inspect the repository, documentation, and current conversation context as needed for the requested work.
2. Produce a detailed Markdown implementation plan.
3. Review the final Markdown plan content and choose a semantic kebab-case slug from that final content.
4. Call write_source_branch_plan_file with the slug, full Markdown content, and optional one-sentence summary.
5. Report the created file path, repo key, repo root, repo identity source, source branch, branch path segment, slug, and summary when present.
6. Stop. Do not create an implementation branch and do not call any Branch Memory plan-branch tool.

Canonical source-branch archive contract:
- Path convention: ~/.asdl/plans/<repo>/<source-branch>/<slug>.md
- <repo>: for github.com origins, gh--<owner>--<repo> from sanitized GitHub owner and repo path segments; for non-GitHub or origin-less repos, one sanitized path segment from the normalized remote.origin.url or real repo root path
- <source-branch>: current branch at plan-file creation time encoded as one filesystem-safe path segment; branch slashes become --- (for example, brmem-plans/add-widget becomes brmem-plans---add-widget)
- <slug>: semantic kebab-case slug without .md
- Existing archive file: write_source_branch_plan_file refuses to overwrite it; choose a different semantic slug that still reflects the final plan content.
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

export function buildCreateBrmemPlanBranchPrompt(steering: string): string {
	return `This is a /create-brmem-plan-branch request. Create a detailed implementation plan, archive it for the source branch, store it in Branch Memory, and create the target branch for implementation.

${formatSteeringBlock(steering)}

Workflow:
1. Inspect the repository, documentation, and current conversation context as needed for the requested work.
2. Resolve repo/user Markdown policy when available:

   \`\`\`text
   brmem exec resolve-prompt create-brmem-plan-branch --format json
   \`\`\`

   If resolution succeeds, read the returned \`data.path\`. Treat that file as policy guidance only: follow its branch naming and branch creation instructions when choosing tool arguments, but do not run mutation commands yourself. If no policy is available, continue with the default branch creation method, \`plain-git\`.
3. Produce a detailed Markdown implementation plan.
4. Review the final Markdown plan content and choose a semantic kebab-case slug from that final content.
5. Call write_source_branch_plan_file with the slug, full Markdown content, and optional one-sentence summary. This creates the stable source-branch archive file outside the repository.
6. Call create_brmem_plan_branch_from_file using the same slug, the filePath returned by write_source_branch_plan_file, optional branchName only when needed, optional branchCreation only when policy requests it, and the same optional summary.
7. Report both source-branch plan archive evidence and target branch + Branch Memory evidence.

Canonical source-branch archive contract:
- Path convention: ~/.asdl/plans/<repo>/<source-branch>/<slug>.md
- <repo>: for github.com origins, gh--<owner>--<repo> from sanitized GitHub owner and repo path segments; for non-GitHub or origin-less repos, one sanitized path segment from the normalized remote.origin.url or real repo root path
- <source-branch>: current branch at plan-file creation time encoded as one filesystem-safe path segment; branch slashes become --- (for example, brmem-plans/add-widget becomes brmem-plans---add-widget)
- <slug>: semantic kebab-case slug without .md
- Existing archive file: write_source_branch_plan_file refuses to overwrite it; choose a different semantic slug that still reflects the final plan content.
- Working-tree behavior: no checked-in plan file is created.

Canonical target storage contract:
- Branch Memory namespace: ${PLAN_BRANCH_NAMESPACE}
- Entry key: <semantic-slug>.md
- Source file for Branch Memory: the archive file path returned by write_source_branch_plan_file
- Branch target: created by create_brmem_plan_branch_from_file using the branchCreation backend requested by Markdown policy, defaulting to plain-git unless branchCreation is provided
- Branch Memory write: stored for the target branch with an explicit --branch <target-branch>
- Working-tree behavior: no checked-in plan file is created

Slug rules:
- The command did not provide a slug; you must generate the final slug.
- Use kebab-case.
- Use 3–7 words.
- Make it specific to the work described by the final plan.
- Do not use dates or random IDs.
- Do not use generic-only slugs such as plan, task, implementation-plan, or work-plan.

Branch-name rules:
- Omit branchName unless user steering or repository policy requires an explicit name.
- If branchName is provided, it must be the exact local branch name to create for implementation.
- branchName may include a semantic prefix such as brmem-plans/... when that is the repo convention.
- The Branch Memory key remains <semantic-slug>.md even when branchName differs from the slug.

Branch-creation rules:
- Omit branchCreation unless Markdown policy requests a backend.
- If policy requests plain Git, pass \`branchCreation: "plain-git"\` or omit branchCreation.
- If policy requests Graphite, pass \`branchCreation: "graphite"\`.
- Never manually run git branch, gt create, gt track, brmem check, or brmem put for this workflow; the tools own all mutations.

When the source archive plan is ready, call write_source_branch_plan_file with:
- slug: the semantic slug, without .md
- content: the complete reviewed Markdown plan content
- summary: optional one-sentence summary of the plan

Then call create_brmem_plan_branch_from_file with:
- slug: the same semantic slug, without .md
- filePath: the absolute filePath returned by write_source_branch_plan_file
- branchName: optional explicit target branch name, only when needed
- branchCreation: optional branch creation backend requested by Markdown policy (\`plain-git\` or \`graphite\`)
- summary: the same optional one-sentence summary of the plan

Exact write_source_branch_plan_file tool call shape:
\`\`\`json
{
  "slug": "semantic-kebab-case-slug",
  "content": "# Plan\\n...",
  "summary": "One-sentence summary of the plan."
}
\`\`\`

Exact create_brmem_plan_branch_from_file tool call shape:
\`\`\`json
{
  "slug": "semantic-kebab-case-slug",
  "filePath": "/absolute/path/returned/by/write_source_branch_plan_file.md",
  "branchName": "optional/target-branch-name",
  "branchCreation": "plain-git-or-graphite-when-policy-requests-it",
  "summary": "One-sentence summary of the plan."
}
\`\`\`

If branchName, branchCreation, or summary is not needed, omit it from the relevant tool call rather than passing an empty string.

If branch creation or Branch Memory storage fails, stop and surface the error. Do not retry with a different slug, branch name, or backend unless the error clearly asks for a corrected value and the corrected value still reflects the final plan content and Markdown policy. The create_brmem_plan_branch_from_file tool may report partial failure after creating the branch; if so, report the partial state exactly.`;
}

export default function createBrmemPlanBranchExtension(pi: ExtensionAPI): void {
	pi.registerCommand(CREATE_BRMEM_PLAN_BRANCH_COMMAND_NAME, {
		description: "Create an implementation plan, archive it, store it in Branch Memory, and create the target branch.",
		handler: async (args, ctx) => handleCreateBrmemPlanBranchCommand(pi, args, ctx),
	});

	pi.registerCommand(CREATE_PLAN_FILE_COMMAND_NAME, {
		description: "Create a reviewed implementation plan file in the local source-branch archive.",
		handler: async (args, ctx) => handleCreatePlanFileCommand(pi, args, ctx),
	});

	pi.registerTool(buildWriteSourceBranchPlanFileTool(pi));
	pi.registerTool(buildCreateBrmemPlanBranchTool(pi));
}

async function handleCreatePlanFileCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();
	const steering = args.trim();
	if (ctx.hasUI) {
		ctx.ui.notify("Starting source plan-file planning turn…", "info");
	}
	pi.sendUserMessage(buildCreatePlanFilePrompt(steering));
}

async function handleCreateBrmemPlanBranchCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();
	const steering = args.trim();
	if (ctx.hasUI) {
		ctx.ui.notify("Starting brmem plan-branch planning turn…", "info");
	}
	pi.sendUserMessage(buildCreateBrmemPlanBranchPrompt(steering));
}

function buildWriteSourceBranchPlanFileTool(pi: ExtensionAPI): ToolDefinition {
	return {
		name: WRITE_SOURCE_BRANCH_PLAN_FILE_TOOL_NAME,
		label: "Write Source Branch Plan File",
		description:
			"Create a reviewed Markdown implementation plan file in the local source-branch plan archive at `~/.asdl/plans/<repo>/<encoded-source-branch>/<slug>.md`. The tool derives repo and current branch from git, validates the slug, creates parent directories, refuses to overwrite an existing file, writes the full Markdown content, and returns path evidence. It does not create branches or write Branch Memory.",
		promptSnippet:
			"Create a reviewed Markdown implementation plan file in the local source-branch archive under `~/.asdl/plans/<repo>/<source-branch>/<slug>.md`.",
		promptGuidelines: [
			"Use write_source_branch_plan_file for `/create-plan-file` and `/create-brmem-plan-branch` after producing a reviewed final Markdown plan.",
			"write_source_branch_plan_file writes the local source-branch archive under `~/.asdl/plans/<repo>/<source-branch>/<slug>.md`; it does not create branches or write Branch Memory.",
			"If write_source_branch_plan_file reports that the archive file already exists, choose a different semantic slug that still reflects the final plan content; never overwrite the existing file.",
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
			const evidence = await writeSourceBranchPlanFilePrimitive(pi, params, { cwd: ctx.cwd, signal });
			return {
				content: [{ type: "text", text: formatSourceBranchPlanFileEvidence(evidence) }],
				details: evidence,
			};
		},
	};
}

function buildCreateBrmemPlanBranchTool(pi: ExtensionAPI): ToolDefinition {
	return {
		name: CREATE_BRMEM_PLAN_BRANCH_TOOL_NAME,
		label: "Create brmem Plan Branch",
		description:
			"Create an implementation branch and store a reviewed source plan file outside the repository in Branch Memory namespace `brmem-plans` with key `<slug>.md` for that target branch. Branch creation defaults to plain Git, or may use Graphite when Markdown policy explicitly requests `branchCreation: \"graphite\"`. Use only after creating the source-branch archive with write_source_branch_plan_file and choosing a semantic slug from the final plan content. No checked-in plan file is created.",
		promptSnippet:
			"Create an implementation branch and store a reviewed source plan file in Branch Memory namespace `brmem-plans`.",
		promptGuidelines: [
			"Use create_brmem_plan_branch_from_file only for `/create-brmem-plan-branch` workflows after write_source_branch_plan_file has created the source-branch plan archive.",
			"Pass create_brmem_plan_branch_from_file the filePath returned by write_source_branch_plan_file; the Branch Memory key remains `<slug>.md`.",
			"If Markdown policy specifies a branch creation backend, pass branchCreation accordingly; use `branchCreation: \"graphite\"` only when policy explicitly says to.",
			"create_brmem_plan_branch_from_file stores plans in Branch Memory namespace `brmem-plans` with key `<slug>.md` for the target branch; do not create a checked-in plan file.",
			"Do not manually run `git branch`, `gt create`, `gt track`, `brmem check`, or `brmem put` for this workflow.",
		],
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				slug: {
					type: "string",
					description: "Semantic kebab-case slug without the .md suffix; also used as the default branch name.",
				},
				filePath: {
					type: "string",
					description: "Absolute path to the completed reviewed source plan file outside the repository.",
				},
				branchName: {
					type: "string",
					description:
						"Optional explicit local target branch name to create for implementation. Omit to use slug as the branch name.",
				},
				branchCreation: {
					type: "string",
					enum: ["plain-git", "graphite"],
					description:
						"Optional branch creation backend requested by Markdown policy. Defaults to plain-git. Use graphite only when repo/user policy explicitly says to.",
				},
				summary: {
					type: "string",
					description: "Optional one-sentence summary of the plan.",
				},
			},
			required: ["slug", "filePath"],
		},
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const evidence = await createBrmemPlanBranchFromFilePrimitive(pi, params, { cwd: ctx.cwd, signal });
			return {
				content: [{ type: "text", text: formatPlanBranchEvidence(evidence) }],
				details: evidence,
			};
		},
	};
}

export function formatPlanBranchEvidence(evidence: BrmemPlanBranchEvidence): string {
	const lines = [
		"Created Branch Memory plan branch.",
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
