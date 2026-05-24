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
export type { BrmemPlanBranchEvidence, CreateBrmemPlanBranchParams } from "./brmem-plans/plan-branch.ts";

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
2. Produce a detailed Markdown implementation plan.
3. Write the completed plan to a temporary Markdown file outside the repository.
4. Read or otherwise inspect the completed temp file.
5. Choose a semantic slug from the final plan content.
6. Optionally choose and pass an explicit target branch name when needed by repo policy; otherwise omit branchName and let the tool use the slug.
7. Call create_brmem_plan_branch_from_file to create the implementation branch and store the plan in Branch Memory.
8. Report the branch, start point, Branch Memory namespace, key, ref, commit, source file, and summary when present.

Canonical storage contract:
- Branch Memory namespace: ${PLAN_BRANCH_NAMESPACE}
- Entry key: <semantic-slug>.md
- Branch target: a plain Git branch created for implementation, defaulting to the slug unless branchName is provided
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

After writing the temp file, read or otherwise inspect the completed file before choosing the slug. Choose the slug from the final plan content, not from the original command text alone.

When the plan is ready, call create_brmem_plan_branch_from_file with:
- slug: the semantic slug, without \`.md\`
- filePath: absolute path to the temp Markdown file
- branchName: optional explicit target branch name, only when needed
- summary: one-sentence summary of the plan

Exact tool call shape:
\`\`\`json
{
  "slug": "semantic-kebab-case-slug",
  "filePath": "/absolute/path/to/temp-plan.md",
  "branchName": "optional/target-branch-name",
  "summary": "One-sentence summary of the plan."
}
\`\`\`

If branchName is not needed, omit it from the tool call rather than passing an empty string.

If branch creation or Branch Memory storage fails, stop and surface the error. Do not retry with a different slug or branch name unless the error clearly asks for a corrected value and the corrected value still reflects the final plan content. The tool may report partial failure after creating the branch; if so, report the partial state exactly.`;
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
			"Create a plain Git implementation branch and store a reviewed temp Markdown plan in Branch Memory namespace `brmem-plans` with key `<slug>.md` for that target branch. Use only after writing and reviewing the final temp plan file and choosing a semantic slug from its content. No checked-in plan file is created.",
		promptSnippet:
			"Create an implementation branch and store a reviewed temp Markdown plan in Branch Memory namespace `brmem-plans`.",
		promptGuidelines: [
			"Use create_brmem_plan_branch_from_file only for `/create-brmem-plan-branch` workflows after creating and reviewing a temp plan file.",
			"create_brmem_plan_branch_from_file stores plans in Branch Memory namespace `brmem-plans` with key `<slug>.md` for the target branch; do not create a checked-in plan file.",
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
