import { chooseActiveObjectiveSlug, type CommandContext, type ExtensionAPI, type ObjectiveSelectionSpec } from "./objective.ts";
import { expandSkillBlock } from "./skill-expansion.ts";

const PROTO_OBJECTIVE_IMPL_COMMAND_NAME = "proto:objective-impl";
const PROTO_OBJECTIVE_IMPL_SKILL_NAME = "proto-objective-impl";

const PROTO_OBJECTIVE_IMPL_SELECTION: ObjectiveSelectionSpec = {
	statusKey: PROTO_OBJECTIVE_IMPL_COMMAND_NAME,
	selectionTitle: "Select an active Objective for prototype implementation",
	compactDiffSuggestion: true,
};

const PROTO_OBJECTIVE_IMPL_DESCRIPTION =
	"Pick an active Objective or accept an explicit slug/path, then invoke the prototype Objective implementation skill.";

const PROTO_OBJECTIVE_IMPL_FALLBACK_PROMPT =
	"The proto-objective-impl skill was not found among loaded Pi skills. Run the prototype Objective implementation workflow for exactly one explicit Objective selected below. Require an upfront preview and explicit human confirmation before material action. Do not use hidden run ledgers, task files, private queues, Branch Memory state, or alternate Objective stores. Do not change canonical /objective:* behavior, Objective lifecycle states, Objective file schema, or docs/objective-system.md. Do not submit PRs unless PR submission is included in the confirmed preview scope.";

export function buildProtoObjectiveImplPrompt(skillBlock: string | undefined, objective: string): string {
	return `${skillBlock ?? PROTO_OBJECTIVE_IMPL_FALLBACK_PROMPT}

Run proto-objective-impl for this explicitly selected Objective slug or path:

\`\`\`text
${objective}
\`\`\`

Treat this as an explicit user selection. Do not auto-select a different Objective.`;
}

async function invokeProtoObjectiveImplSkill(
	pi: ExtensionAPI,
	ctx: CommandContext,
	objective: string,
): Promise<void> {
	await ctx.waitForIdle();

	const skill = await expandSkillBlock(pi, PROTO_OBJECTIVE_IMPL_SKILL_NAME);
	if (ctx.hasUI) {
		ctx.ui.notify(
			skill
				? `Invoking ${PROTO_OBJECTIVE_IMPL_COMMAND_NAME} for ${objective}.`
				: `${PROTO_OBJECTIVE_IMPL_SKILL_NAME} skill was not found; using fallback prompt.`,
			skill ? "info" : "warning",
		);
	}

	pi.sendUserMessage(buildProtoObjectiveImplPrompt(skill?.block, objective));
}

async function handleProtoObjectiveImplCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	const explicitObjective = args.trim();
	try {
		if (explicitObjective) {
			await invokeProtoObjectiveImplSkill(pi, ctx, explicitObjective);
			return;
		}

		const slug = await chooseActiveObjectiveSlug(pi, ctx, PROTO_OBJECTIVE_IMPL_SELECTION);
		if (!slug) {
			return;
		}

		await invokeProtoObjectiveImplSkill(pi, ctx, slug);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (ctx.hasUI) {
			ctx.ui.notify(message, "error");
		}
	}
}

export default function protoExtension(pi: ExtensionAPI): void {
	pi.registerCommand(PROTO_OBJECTIVE_IMPL_COMMAND_NAME, {
		description: PROTO_OBJECTIVE_IMPL_DESCRIPTION,
		handler: async (args, ctx) => handleProtoObjectiveImplCommand(pi, args, ctx),
	});
}
