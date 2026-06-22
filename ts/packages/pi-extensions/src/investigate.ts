import type { ExecOptions, ExecResult } from "@sdl/core/exec";

import type { ThinkingLevel } from "./cmux/types.ts";
import {
	formatDispatchRunnerSubagentResult,
	dispatchRunnerSubagentDetails,
} from "./dispatch-runner-subagent.ts";
import {
	composePiAgentPrompt,
	loadPiAgentDefinition,
	type PiAgentDefinition,
} from "./pi-agent-definition.ts";
import { definePiSurfaceParity } from "./parity.ts";
import {
	buildCuratedRunnerSubagentContext,
	type CuratedRunnerSubagentContextAudit,
} from "./runner-subagent/curated-context.ts";
import { resolveRunnerSubagentLaunch } from "./runner-subagent/subagent-process.ts";
import {
	defaultRunnerSubagentLaunchMetadata,
	dispatchRunnerSubagent,
	type RunnerSubagentLaunchMetadata,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
	type RunnerSubagentUpdate,
} from "./runner-subagent.ts";
import { emptyRunnerSubagentActivity } from "./runner-subagent/activity.ts";
import {
	formatRunnerSubagentActivityWidgetLines,
	setRunnerSubagentWidget,
} from "./runner-subagent/widget.ts";
import { truncateDisplayLine } from "./terminal-presentation.ts";
import type {
	CommandContext,
	CustomMessage,
	RenderComponent,
	RenderTheme,
} from "./handoff/runtime-types.ts";

export const INVESTIGATE_COMMAND_NAME = "investigate";
export const INVESTIGATOR_AGENT_NAME = "investigator";
export const INVESTIGATE_RESULT_MESSAGE_TYPE = "investigate-result";
export const INVESTIGATOR_CHILD_TOOL_NAMES = ["read", "grep", "find", "ls", "bash"] as const;

const WIDGET_KEY = INVESTIGATE_COMMAND_NAME;
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
			"Claude Code has /investigate via a project skill and custom subagent, but there is no agent-neutral CLI surface yet.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "investigate",
		notes:
			"Pi and Claude Code both expose /investigate, but there is no standalone non-harness command yet.",
	},
] as const);

interface RegisteredCommand {
	description?: string;
	argumentHint?: string;
	handler(args: string, ctx: CommandContext): Promise<void> | void;
}

export interface InvestigateExtensionAPI extends RunnerSubagentPi {
	getThinkingLevel?: () => ThinkingLevel;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	registerCommand(name: string, command: RegisteredCommand): void;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(message: CustomMessage): void;
}

type MessageRenderer = (
	message: CustomMessage,
	options: { expanded: boolean },
	theme: RenderTheme,
) => RenderComponent;

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

export async function runInvestigateCommand({
	pi,
	ctx,
	args,
	extensionOptions = {},
}: RunInvestigateCommandInput): Promise<RunnerSubagentResult | undefined> {
	const prompt = args.trim();
	if (prompt.length === 0) {
		ctx.ui.notify(USAGE, "error");
		return undefined;
	}

	const loadDefinition = extensionOptions.loadAgentDefinition ?? loadPiAgentDefinition;
	const definition = loadDefinition(INVESTIGATOR_AGENT_NAME, extensionOptions.cwd ?? ctx.cwd);
	if (definition.toolName !== INVESTIGATE_COMMAND_NAME) {
		throw new Error(
			`Investigator agent definition ${definition.filePath} declares toolName "${definition.toolName}"; expected "${INVESTIGATE_COMMAND_NAME}".`,
		);
	}

	const title = buildInvestigationTitle(prompt);
	const curatedContext = await buildCuratedRunnerSubagentContext({
		title,
		prompt,
		cwd: ctx.cwd,
		execGit: (gitArgs, timeoutMs) =>
			pi.exec("git", [...gitArgs], { cwd: ctx.cwd, timeout: timeoutMs }),
	});
	const childPrompt = `${composePiAgentPrompt(definition, { title, prompt })}\n\n${curatedContext.markdown}`;
	const launch =
		resolveRunnerSubagentLaunch(pi, ctx, {
			prompt: childPrompt,
			returnMode: "final-text",
		}) ?? defaultRunnerSubagentLaunchMetadata();
	setRunnerSubagentWidget(
		ctx,
		WIDGET_KEY,
		formatRunnerSubagentActivityWidgetLines(initialInvestigationUpdate(title, launch)),
	);

	try {
		const result = await dispatchRunnerSubagent(pi, ctx, {
			title,
			prompt: childPrompt,
			returnMode: "final-text",
			preResolvedLaunch: launch,
			tools: INVESTIGATOR_CHILD_TOOL_NAMES,
			onProgress: (update) => {
				setRunnerSubagentWidget(ctx, WIDGET_KEY, formatRunnerSubagentActivityWidgetLines(update));
			},
		});
		emitInvestigationResult(pi, ctx, result, curatedContext.audit);
		return result;
	} finally {
		setRunnerSubagentWidget(ctx, WIDGET_KEY, undefined);
	}
}

export function buildInvestigationTitle(prompt: string): string {
	const words = prompt
		.replace(/\s+/gu, " ")
		.trim()
		.split(" ")
		.filter((word) => word.length > 0);
	const shortPrompt = words.slice(0, MAX_TITLE_WORDS).join(" ");
	const suffix = words.length > MAX_TITLE_WORDS ? "…" : "";
	const title = `Investigation: ${shortPrompt}${suffix}`;
	if (title.length <= MAX_TITLE_CHARS) return title;
	return `${title.slice(0, MAX_TITLE_CHARS - 1)}…`;
}

export function renderInvestigationResultMessage(
	message: CustomMessage,
	_options: { expanded: boolean },
	theme: RenderTheme,
): RenderComponent {
	const content = typeof message.content === "string" ? message.content : String(message.content);
	return {
		render(width: number): string[] {
			return content
				.split("\n")
				.map((line, index) =>
					styleInvestigationLine(truncateDisplayLine(line, width), index, theme),
				);
		},
		invalidate(): void {},
	};
}

function emitInvestigationResult(
	pi: Pick<InvestigateExtensionAPI, "sendMessage">,
	ctx: CommandContext,
	result: RunnerSubagentResult,
	curatedContext: CuratedRunnerSubagentContextAudit,
): void {
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

function initialInvestigationUpdate(
	title: string,
	launch: RunnerSubagentLaunchMetadata,
): RunnerSubagentUpdate {
	return {
		progress: {
			title,
			state: "starting",
			toolCount: 0,
			turnCount: 0,
			elapsedMs: 0,
			launch,
		},
		activity: emptyRunnerSubagentActivity(),
	};
}

function styleInvestigationLine(line: string, index: number, theme: RenderTheme): string {
	if (line.length === 0) return line;
	if (index === 0 || line.startsWith("## ")) {
		return theme.fg("accent", theme.bold !== undefined ? theme.bold(line) : line);
	}
	if (line.startsWith("Session file:") || line.startsWith("Status:")) {
		return theme.fg("muted", line);
	}
	return line;
}
