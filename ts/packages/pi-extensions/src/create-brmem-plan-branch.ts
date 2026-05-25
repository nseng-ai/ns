import {
	PLAN_BRANCH_NAMESPACE,
	createBrmemPlanBranchFromFile as createBrmemPlanBranchFromFilePrimitive,
	type BrmemPlanBranchEvidence,
} from "./brmem-plans/plan-branch.ts";
import type { ExecOptions } from "./brmem-plans/plan-persistence.ts";
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

const COMMAND_NAME = "create-brmem-plan-branch";
const TOOL_NAME = "create_brmem_plan_branch_from_file";

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

export function buildCreateBrmemPlanBranchPrompt(steering: string): string {
	const trimmedSteering = steering.trim();
	const steeringBlock = trimmedSteering
		? `User steering for this planning request:\n\n\`\`\`text\n${trimmedSteering}\n\`\`\``
		: "User steering for this planning request: (none)";

	return `This is a /create-brmem-plan-branch request. Create a detailed implementation plan, store it in Branch Memory, and create the target branch for implementation.

${steeringBlock}

Workflow:
1. Inspect the repository and documentation as needed for the requested work.
2. Resolve repo/user Markdown policy when available:

   \`\`\`text
   brmem exec resolve-prompt create-brmem-plan-branch --format json
   \`\`\`

   If resolution succeeds, read the returned \`data.path\`. Treat that file as policy guidance only: follow its branch naming and branch creation instructions when choosing tool arguments, but do not run mutation commands yourself. If no policy is available, continue with the default branch creation method, \`plain-git\`.
3. Produce a detailed Markdown implementation plan.
4. Write the completed plan to a temporary Markdown file outside the repository.
5. Read or otherwise inspect the completed temp file.
6. Choose a semantic slug from the final plan content.
7. Optionally choose and pass an explicit target branch name when needed by repo policy; otherwise omit branchName and let the tool use the slug.
8. Pass branchCreation only when policy specifies a backend. Use \`branchCreation: "graphite"\` only when the resolved policy explicitly says to; omitted branchCreation defaults to \`plain-git\`.
9. Call create_brmem_plan_branch_from_file to create the implementation branch and store the plan in Branch Memory.
10. Report the branch, branch creation method, start point, Branch Memory namespace, key, ref, commit, source file, and summary when present.

Canonical storage contract:
- Branch Memory namespace: ${PLAN_BRANCH_NAMESPACE}
- Entry key: <semantic-slug>.md
- Branch target: created by the tool using the branchCreation backend requested by Markdown policy, defaulting to plain-git unless branchCreation is provided
- Branch Memory write: stored for the target branch with an explicit --branch <target-branch>
- Working-tree behavior: no checked-in plan file is created

Do not create a checked-in plan file. The plan file you create before persistence must live outside the repository, preferably under the OS temp directory.

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
- Never manually run git branch, gt create, gt track, brmem check, or brmem put for this workflow; the tool owns all mutations.

After writing the temp file, read or otherwise inspect the completed file before choosing the slug. Choose the slug from the final plan content, not from the original command text alone.

When the plan is ready, call create_brmem_plan_branch_from_file with:
- slug: the semantic slug, without \`.md\`
- filePath: absolute path to the temp Markdown file
- branchName: optional explicit target branch name, only when needed
- branchCreation: optional branch creation backend requested by Markdown policy (\`plain-git\` or \`graphite\`)
- summary: one-sentence summary of the plan

Exact tool call shape:
\`\`\`json
{
  "slug": "semantic-kebab-case-slug",
  "filePath": "/absolute/path/to/temp-plan.md",
  "branchName": "optional/target-branch-name",
  "branchCreation": "plain-git-or-graphite-when-policy-requests-it",
  "summary": "One-sentence summary of the plan."
}
\`\`\`

If branchName or branchCreation is not needed, omit it from the tool call rather than passing an empty string.

If branch creation or Branch Memory storage fails, stop and surface the error. Do not retry with a different slug, branch name, or backend unless the error clearly asks for a corrected value and the corrected value still reflects the final plan content and Markdown policy. The tool may report partial failure after creating the branch; if so, report the partial state exactly.`;
}

export default function createBrmemPlanBranchExtension(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Create an implementation plan, store it in Branch Memory, and create the target branch.",
		handler: async (args, ctx) => handleCreateBrmemPlanBranchCommand(pi, args, ctx),
	});

	pi.registerTool(buildCreateBrmemPlanBranchTool(pi));
}

async function handleCreateBrmemPlanBranchCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();
	const steering = args.trim();
	if (ctx.hasUI) {
		ctx.ui.notify("Starting brmem plan-branch planning turn…", "info");
	}
	pi.sendUserMessage(buildCreateBrmemPlanBranchPrompt(steering));
}

function buildCreateBrmemPlanBranchTool(pi: ExtensionAPI): ToolDefinition {
	return {
		name: TOOL_NAME,
		label: "Create brmem Plan Branch",
		description:
			"Create an implementation branch and store a reviewed temp Markdown plan in Branch Memory namespace `brmem-plans` with key `<slug>.md` for that target branch. Branch creation defaults to plain Git, or may use Graphite when Markdown policy explicitly requests `branchCreation: \"graphite\"`. Use only after writing and reviewing the final temp plan file and choosing a semantic slug from its content. No checked-in plan file is created.",
		promptSnippet:
			"Create an implementation branch and store a reviewed temp Markdown plan in Branch Memory namespace `brmem-plans`.",
		promptGuidelines: [
			"Use create_brmem_plan_branch_from_file only for `/create-brmem-plan-branch` workflows after creating and reviewing a temp plan file.",
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
					description: "Absolute path to the completed temporary Markdown plan file outside the repository.",
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
