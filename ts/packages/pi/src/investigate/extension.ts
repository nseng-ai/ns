import {
	composePiAgentPrompt,
	loadPiAgentDefinition,
	type PiAgentDefinition,
} from "../runtime/agent-definition.ts";
import { definePiSurfaceParity } from "../parity/extension.ts";
import { renderInvestigationResultMessage } from "./renderer.ts";
import { buildConciseTitle } from "../runner-subagents/title.ts";
import type { CommandContext, ExtensionAPI } from "../handoff/runtime-types.ts";

export const INVESTIGATE_COMMAND_NAME = "investigate";
const INVESTIGATOR_AGENT_NAME = "investigator";
export const INVESTIGATE_RESULT_MESSAGE_TYPE = "investigate-result";

const INVESTIGATION_TITLE_PREFIX = "Investigation: ";
const MAX_TITLE_CHARS = 80;
const MAX_TITLE_WORDS = 10;
const USAGE = "Usage: /investigate <prompt>";
const REMOVED_SUBAGENT_FLAG_PATTERN = /(^|\s)--(?:subagent|fork)(?=\s|$)/u;

export const investigateParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: INVESTIGATE_COMMAND_NAME,
		workflow:
			"Run a thorough read-only investigation in the parent session and return an evidence-backed report",
		parity: "PARTIAL",
		trackedGap:
			"Claude Code has /investigate via a project skill and custom subagent, but Pi keeps /investigate in-process; there is no agent-neutral CLI surface yet.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi",
		sourceModule: "investigate",
		notes:
			"Pi and Claude Code both expose /investigate, but there is no standalone non-harness command yet. Pi keeps /investigate in-process in the parent session and does not expose an out-of-process investigator subagent mode.",
	},
] as const);

export type InvestigateExtensionAPI = Pick<
	ExtensionAPI,
	"registerCommand" | "registerMessageRenderer" | "sendUserMessage"
>;

export interface InvestigateExtensionOptions {
	cwd?: string;
	loadAgentDefinition?: (agentName: string, cwd: string) => PiAgentDefinition;
}

interface RunInvestigateCommandInput {
	pi: InvestigateExtensionAPI;
	ctx: CommandContext;
	args: string;
	extensionOptions?: InvestigateExtensionOptions;
}

export default function investigateExtension(
	pi: InvestigateExtensionAPI,
	options: InvestigateExtensionOptions = {},
): void {
	pi.registerMessageRenderer?.(INVESTIGATE_RESULT_MESSAGE_TYPE, renderInvestigationResultMessage);
	pi.registerCommand(INVESTIGATE_COMMAND_NAME, {
		description: "Run a thorough read-only investigation in this session",
		argumentHint: "<investigation prompt>",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			await runInvestigateCommand({ pi, ctx, args, extensionOptions: options });
		},
	});
}

async function runInvestigateCommand({
	pi,
	ctx,
	args,
	extensionOptions = {},
}: RunInvestigateCommandInput): Promise<void> {
	const prompt = args.trim();
	if (prompt.length === 0) {
		ctx.ui.notify(USAGE, "error");
		return;
	}
	if (REMOVED_SUBAGENT_FLAG_PATTERN.test(prompt)) {
		ctx.ui.notify(
			"/investigate no longer supports out-of-process subagent mode; rerun without --subagent/--fork.",
			"error",
		);
		return;
	}

	const loadDefinition = extensionOptions.loadAgentDefinition ?? loadPiAgentDefinition;
	const definition = loadDefinition(INVESTIGATOR_AGENT_NAME, extensionOptions.cwd ?? ctx.cwd);
	if (definition.toolName !== INVESTIGATE_COMMAND_NAME) {
		throw new Error(
			`Investigator agent definition ${definition.filePath} declares toolName "${definition.toolName}"; expected "${INVESTIGATE_COMMAND_NAME}".`,
		);
	}

	runInlineInvestigation({
		pi,
		ctx,
		definition,
		title: buildInvestigationTitle(prompt),
		prompt,
	});
}

interface RunInlineInvestigationInput {
	pi: Pick<InvestigateExtensionAPI, "sendUserMessage">;
	ctx: CommandContext;
	definition: PiAgentDefinition;
	title: string;
	prompt: string;
}

function runInlineInvestigation({
	pi,
	ctx,
	definition,
	prompt,
	title,
}: RunInlineInvestigationInput): void {
	if (pi.sendUserMessage === undefined) {
		ctx.ui.notify("This Pi host cannot run /investigate in-process.", "error");
		return;
	}
	pi.sendUserMessage(composePiAgentPrompt(definition, { title, prompt }));
	ctx.ui.notify("Investigating in the current session.", "info");
}

export function buildInvestigationTitle(prompt: string): string {
	return `${INVESTIGATION_TITLE_PREFIX}${buildConciseTitle(prompt, {
		maxWords: MAX_TITLE_WORDS,
		maxChars: MAX_TITLE_CHARS - INVESTIGATION_TITLE_PREFIX.length,
	})}`;
}
