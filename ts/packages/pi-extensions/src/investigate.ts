import {
	formatDispatchRunnerSubagentResult,
	dispatchRunnerSubagentDetails,
} from "./dispatch-runner-subagent.ts";
import { loadPiAgentDefinition, type PiAgentDefinition } from "./pi-agent-definition.ts";
import { definePiSurfaceParity } from "./parity.ts";
import { renderInvestigationResultMessage } from "./investigate-renderer.ts";
import { PI_INVESTIGATOR_CHILD_TOOL_NAMES } from "./investigator-policy.ts";
import type { CuratedRunnerSubagentContextAudit } from "./runner-subagent/curated-context.ts";
import { runFinalTextSubagent } from "./runner-subagent/dispatch-preparation.ts";
import type { RunnerSubagentPi, RunnerSubagentResult } from "./runner-subagent.ts";
import { buildConciseTitle } from "./runner-subagent/title.ts";
import type { CommandContext, ExtensionAPI } from "./handoff/runtime-types.ts";

export const INVESTIGATE_COMMAND_NAME = "investigate";
const INVESTIGATOR_AGENT_NAME = "investigator";
export const INVESTIGATE_RESULT_MESSAGE_TYPE = "investigate-result";
export { PI_INVESTIGATOR_CHILD_TOOL_NAMES } from "./investigator-policy.ts";

const WIDGET_KEY = INVESTIGATE_COMMAND_NAME;
const INVESTIGATION_TITLE_PREFIX = "Investigation: ";
const MAX_TITLE_CHARS = 80;
const MAX_TITLE_WORDS = 10;
const USAGE = "Usage: /investigate <prompt>";

export const investigateParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: INVESTIGATE_COMMAND_NAME,
		workflow: "Run a thorough read-only investigator subagent and return an evidence-backed report",
		parity: "PARTIAL",
		trackedGap:
			"Claude Code has /investigate via a project skill and custom subagent, but there is no agent-neutral CLI surface yet; child-tool policies intentionally differ by host.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "investigate",
		notes:
			"Pi and Claude Code both expose /investigate, but there is no standalone non-harness command yet. Pi uses a no-Bash read-only child-tool allowlist; Claude Code keeps diagnostic Bash/Glob under its subagent contract.",
	},
] as const);

export type InvestigateExtensionAPI = RunnerSubagentPi &
	Pick<
		ExtensionAPI,
		"exec" | "getThinkingLevel" | "registerCommand" | "registerMessageRenderer" | "sendMessage"
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
		description:
			"Run a thorough read-only investigator subagent and return an evidence-backed report",
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

	const loadDefinition = extensionOptions.loadAgentDefinition ?? loadPiAgentDefinition;
	const definition = loadDefinition(INVESTIGATOR_AGENT_NAME, extensionOptions.cwd ?? ctx.cwd);
	if (definition.toolName !== INVESTIGATE_COMMAND_NAME) {
		throw new Error(
			`Investigator agent definition ${definition.filePath} declares toolName "${definition.toolName}"; expected "${INVESTIGATE_COMMAND_NAME}".`,
		);
	}

	const title = buildInvestigationTitle(prompt);
	const { result, curatedContext } = await runFinalTextSubagent({
		pi,
		ctx,
		definition,
		title,
		prompt,
		widgetKey: WIDGET_KEY,
		tools: PI_INVESTIGATOR_CHILD_TOOL_NAMES,
	});
	emitInvestigationResult({ pi, ctx, result, curatedContext: curatedContext.audit });
}

export function buildInvestigationTitle(prompt: string): string {
	return `${INVESTIGATION_TITLE_PREFIX}${buildConciseTitle(prompt, {
		maxWords: MAX_TITLE_WORDS,
		maxChars: MAX_TITLE_CHARS - INVESTIGATION_TITLE_PREFIX.length,
	})}`;
}

interface EmitInvestigationResultInput {
	pi: Pick<InvestigateExtensionAPI, "sendMessage">;
	ctx: CommandContext;
	result: RunnerSubagentResult;
	curatedContext: CuratedRunnerSubagentContextAudit;
}

function emitInvestigationResult({
	pi,
	ctx,
	result,
	curatedContext,
}: EmitInvestigationResultInput): void {
	const content = formatInvestigationResultContent(result);
	const details = dispatchRunnerSubagentDetails(result, { curatedContext });
	if (pi.sendMessage !== undefined) {
		pi.sendMessage({
			customType: INVESTIGATE_RESULT_MESSAGE_TYPE,
			content,
			display: true,
			details,
		});
		return;
	}

	if (result.status === "final-text" && ctx.ui.setEditorText !== undefined) {
		ctx.ui.setEditorText(content);
		ctx.ui.notify("Investigation report inserted into the editor.", "info");
		return;
	}

	ctx.ui.notify(content, result.status === "final-text" ? "info" : "error");
}

function formatInvestigationResultContent(result: RunnerSubagentResult): string {
	if (result.status === "final-text") return result.finalText;
	return formatDispatchRunnerSubagentResult(result);
}
