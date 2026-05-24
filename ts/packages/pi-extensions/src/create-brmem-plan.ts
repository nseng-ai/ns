import {
	PLAN_NAMESPACE,
	persistBrmemPlan as persistBrmemPlanPrimitive,
	type ExecOptions,
} from "./brmem-plans/plan-persistence.ts";
import type { ExecResult } from "./command-runtime.ts";

export type { ExecResult } from "./command-runtime.ts";
export { isPathInside, normalizePlanFilePath, validatePlanSlug } from "./brmem-plans/plan-persistence.ts";

const COMMAND_NAME = "create-brmem-plan";
const TOOL_NAME = "persist_brmem_plan";

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

export function buildCreateBrmemPlanPrompt(steering: string): string {
	const trimmedSteering = steering.trim();
	const steeringBlock = trimmedSteering
		? `User steering for this planning request:\n\n\`\`\`text\n${trimmedSteering}\n\`\`\``
		: "User steering for this planning request: (none)";

	return `This is a /create-brmem-plan request. Create a detailed implementation plan and persist it into Branch Memory.

${steeringBlock}

Workflow:
1. Inspect the codebase and documentation as needed for the requested work.
2. Produce a detailed Markdown implementation plan.
3. Write the completed plan to a temporary Markdown file outside the repository.
4. Read or otherwise inspect the completed temp file.
5. Choose a semantic slug from the final plan content.
6. Call persist_brmem_plan to store the plan in Branch Memory.
7. Report the persisted Branch Memory namespace, key, branch, ref, and commit.

Durable storage contract:
- Branch Memory namespace: ${PLAN_NAMESPACE}
- Entry key: <semantic-slug>.md
- Branch: current Git branch, as resolved by brmem
- Overwrite behavior: refuse if the entry already exists
- Working-tree behavior: no checked-in plan file is created

Do not create a checked-in plan file. The plan file you create before persistence must live outside the repository, preferably under the OS temp directory.

Slug rules:
- The command did not provide a slug; you must generate the final slug.
- Use kebab-case.
- Use 3–7 words.
- Make it specific to the work described by the final plan.
- Do not use dates or random IDs.
- Do not use generic-only slugs such as plan, task, implementation-plan, or work-plan.

After writing the temp file, read or otherwise inspect the completed file before choosing the slug. Choose the slug from the final plan content, not from the original command text alone.

When the plan is ready, call persist_brmem_plan with:
- slug: the semantic slug, without \`.md\`
- filePath: absolute path to the temp Markdown file
- summary: one-sentence summary of the plan

Exact tool call shape:
\`\`\`json
{
  "slug": "semantic-kebab-case-slug",
  "filePath": "/absolute/path/to/temp-plan.md",
  "summary": "One-sentence summary of the plan."
}
\`\`\`

If persistence fails, stop and surface the error. Do not retry with a different slug unless the error clearly asks for a corrected slug and the corrected slug still reflects the final plan content.`;
}

export default function createBrmemPlanExtension(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Create a detailed implementation plan and persist it in branch-scoped Branch Memory.",
		handler: async (args, ctx) => handleCreateBrmemPlanCommand(pi, args, ctx),
	});

	pi.registerTool(buildPersistBrmemPlanTool(pi));
}

async function handleCreateBrmemPlanCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();
	const steering = args.trim();
	if (ctx.hasUI) {
		ctx.ui.notify("Starting brmem-backed planning turn…", "info");
	}
	pi.sendUserMessage(buildCreateBrmemPlanPrompt(steering));
}

function buildPersistBrmemPlanTool(pi: ExtensionAPI): ToolDefinition {
	return {
		name: TOOL_NAME,
		label: "Persist brmem Plan",
		description:
			"Persist a completed temp Markdown plan into branch-scoped Branch Memory under namespace `plans`. Use only after you have written and reviewed the final plan file and chosen a semantic slug from its content. Refuses to overwrite existing plans.",
		promptSnippet: "Persist a reviewed temp Markdown plan into Branch Memory namespace `plans`.",
		promptGuidelines: [
			"Use persist_brmem_plan only for `/create-brmem-plan` workflows after creating and reviewing a temp plan file.",
		],
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				slug: {
					type: "string",
					description: "Semantic kebab-case slug without the .md suffix.",
				},
				filePath: {
					type: "string",
					description: "Absolute path to the completed temporary Markdown plan file.",
				},
				summary: {
					type: "string",
					description: "One-sentence summary of the plan.",
				},
			},
			required: ["slug", "filePath"],
		},
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const persisted = await persistBrmemPlanPrimitive(pi, params, { cwd: ctx.cwd, signal });
			return {
				content: [{ type: "text", text: persisted.content }],
				details: persisted.details,
			};
		},
	};
}
