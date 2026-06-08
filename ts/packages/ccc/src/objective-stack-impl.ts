import { chooseActiveObjectiveSlug, type ObjectiveSelectionContext, type ObjectiveSelectionHost, type ObjectiveSelectionSpec } from "@asdl/pi-extension-runtime/objective-selection";
import { expandSkillBlock, type SkillExpansionHost } from "@asdl/pi-extension-runtime/skill-expansion";

interface ObjectiveStackImplCommandSpec extends ObjectiveSelectionSpec {
	commandName: "objective:stack-impl";
	skillName: "objective-stack-impl";
	description: string;
	fallbackPrompt: string;
	actionPrompt: string;
}

export interface ObjectiveStackImplHost extends ObjectiveSelectionHost, SkillExpansionHost {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: ObjectiveSelectionContext): Promise<void> | void;
		},
	): void;
	sendUserMessage(content: string): void;
}

const OBJECTIVE_STACK_IMPL_COMMAND: ObjectiveStackImplCommandSpec = {
	commandName: "objective:stack-impl",
	skillName: "objective-stack-impl",
	description: "Pick an active Objective, then invoke the portable Objective stack implementation skill for the selected slug.",
	statusKey: "objective:stack-impl",
	selectionTitle: "Select an active Objective for stack implementation",
	compactDiffSuggestion: true,
	fallbackPrompt:
		"The objective-stack-impl skill was not found among loaded Pi skills. Follow the repository's Objective stack implementation workflow anyway: orchestrate implementation of one explicit Objective as a small Graphite stack from this session. Require user confirmation before execution, run at most one runner subagent at a time, record Objective updates for material progress, and do not submit PRs automatically.",
	actionPrompt: "Run objective-stack-impl for this explicitly selected Objective slug or path:",
};

export function registerObjectiveStackImplCommand(host: ObjectiveStackImplHost): void {
	host.registerCommand(OBJECTIVE_STACK_IMPL_COMMAND.commandName, {
		description: OBJECTIVE_STACK_IMPL_COMMAND.description,
		handler: async (args, ctx) =>
			handleObjectiveStackImplCommand({ host, spec: OBJECTIVE_STACK_IMPL_COMMAND, args, ctx }),
	});
}

function buildObjectiveStackImplSkillPrompt(
	spec: ObjectiveStackImplCommandSpec,
	skillBlock: string | undefined,
	objective: string,
): string {
	return `${skillBlock ?? spec.fallbackPrompt}

${spec.actionPrompt}

\`\`\`text
${objective}
\`\`\`

Treat this as an explicit user selection. Do not auto-select a different Objective.`;
}

interface InvokeObjectiveStackImplSkillOptions {
	host: ObjectiveStackImplHost;
	ctx: ObjectiveSelectionContext;
	spec: ObjectiveStackImplCommandSpec;
	objective: string;
}

async function invokeObjectiveStackImplSkill(options: InvokeObjectiveStackImplSkillOptions): Promise<void> {
	const { host, ctx, spec, objective } = options;
	const skill = await expandSkillBlock(host, spec.skillName);
	if (ctx.hasUI) {
		ctx.ui.notify(
			skill
				? `Invoking ${spec.commandName} for ${objective}.`
				: `${spec.skillName} skill was not found; using fallback prompt.`,
			skill ? "info" : "warning",
		);
	}

	host.sendUserMessage(buildObjectiveStackImplSkillPrompt(spec, skill?.block, objective));
}

interface HandleObjectiveStackImplCommandOptions {
	host: ObjectiveStackImplHost;
	spec: ObjectiveStackImplCommandSpec;
	args: string;
	ctx: ObjectiveSelectionContext;
}

async function handleObjectiveStackImplCommand(options: HandleObjectiveStackImplCommandOptions): Promise<void> {
	const { host, spec, args, ctx } = options;
	const explicitObjective = args.trim();
	try {
		if (explicitObjective) {
			await ctx.waitForIdle();
			await invokeObjectiveStackImplSkill({ host, ctx, spec, objective: explicitObjective });
			return;
		}

		const slug = await chooseActiveObjectiveSlug(host, ctx, spec);
		if (!slug) {
			return;
		}

		await ctx.waitForIdle();
		await invokeObjectiveStackImplSkill({ host, ctx, spec, objective: slug });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (ctx.hasUI) {
			ctx.ui.notify(message, "error");
		}
	}
}
