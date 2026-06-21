import { buildSkillInvocationPrompt, invokeRepoSkillPromptTurn } from "./skill-expansion.ts";
import { truncateDisplayLine } from "./terminal-presentation.ts";
import type {
	CommandContext,
	CustomMessage,
	RenderComponent,
	RenderTheme,
} from "./handoff/runtime-types.ts";
import { definePiSurfaceParity } from "./parity.ts";

export const CODE_WORKFLOWS_COMMAND_NAME = "code-workflows";
export const GH_CI_DEBUG_COMMAND_NAME = "gh-ci-debug";
export const CODE_WORKFLOWS_MESSAGE_TYPE = "code-workflows-selection";

export const codeWorkflowsParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: CODE_WORKFLOWS_COMMAND_NAME,
		workflow: "Select rare code workflow prompts without starting a model turn",
		parity: "FULL",
		cli: "none needed; routes are skill references",
		skill: "code-workflows",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "code-workflows",
		notes:
			"The command is a Pi picker/prompt insertion convenience over portable skills and references.",
	},
	{
		kind: "command",
		surface: GH_CI_DEBUG_COMMAND_NAME,
		workflow: "Start the gh-ci-debug code workflow directly from a top-level Pi command",
		parity: "FULL",
		cli: "none needed; invokes the portable code-workflows gh-ci-debug playbook",
		skill: "code-workflows",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "code-workflows",
		notes:
			"This is a turn-saving Pi command for the gh-ci-debug route; non-Pi agents use the code-workflows skill with the gh-ci-debug route.",
	},
] as const);

interface AutocompleteItem {
	value: string;
	label?: string;
	description?: string;
}

interface RegisteredCommand {
	description?: string;
	argumentHint?: string;
	getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
	handler(args: string, ctx: CommandContext): Promise<void> | void;
}

interface CodeWorkflowsExtensionAPI {
	registerCommand(name: string, command: RegisteredCommand): void;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	getCommands?(): readonly {
		name: string;
		source: string;
		sourceInfo: { path: string; baseDir?: string };
	}[];
	sendMessage?(message: CustomMessage): void;
	sendUserMessage(content: string): Promise<void> | void;
}

type MessageRenderer = (
	message: CustomMessage,
	options: { expanded: boolean },
	theme: RenderTheme,
) => RenderComponent;

interface WorkflowRoute {
	route: string;
	aliases: readonly string[];
	reference: string;
	summary: string;
	menuVisibility: "visible" | "explicit-only";
}

interface SelectedWorkflowDetails {
	route: string;
	reference: string;
	prompt: string;
}

const CODE_WORKFLOWS_SKILL_NAME = "code-workflows";
const GH_CI_DEBUG_ROUTE = "gh-ci-debug";

const ROUTES = [
	{
		route: "delete-stack",
		aliases: ["gt-delete-stack"],
		reference: "skills/code-workflows/references/delete-stack.md",
		summary: "delete a Graphite subtree with slot/PR/remote cleanup",
		menuVisibility: "visible",
	},
	{
		route: "stackify-branch",
		aliases: ["gt-stackify-branch"],
		reference: "skills/code-workflows/references/gt-stackify-branch.md",
		summary: "split one branch into a clean Graphite stack",
		menuVisibility: "visible",
	},
	{
		route: "stacker-agent",
		aliases: ["stacker"],
		reference: "skills/code-workflows/references/stacker-agent.md",
		summary: "serial multi-slice implementation coordinator",
		menuVisibility: "visible",
	},
	{
		route: "parity-review",
		aliases: ["cross-harness-parity"],
		reference: "skills/code-workflows/references/parity-review.md",
		summary: "review Pi command changes for cross-harness parity",
		menuVisibility: "visible",
	},
	{
		route: "gh-ci-debug",
		aliases: ["ci-debug"],
		reference: "skills/code-workflows/references/gh-ci-debug.md",
		summary: "diagnose a failing GitHub Actions run or PR check",
		menuVisibility: "explicit-only",
	},
] as const satisfies readonly WorkflowRoute[];

export default function codeWorkflowsExtension(pi: CodeWorkflowsExtensionAPI): void {
	pi.registerMessageRenderer?.(CODE_WORKFLOWS_MESSAGE_TYPE, renderCodeWorkflowMessage);
	pi.registerCommand(CODE_WORKFLOWS_COMMAND_NAME, {
		description: "Select a rare code workflow without starting a model turn",
		getArgumentCompletions: completeWorkflowRoute,
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			await showCodeWorkflowSelector(pi, ctx, args);
		},
	});
	pi.registerCommand(GH_CI_DEBUG_COMMAND_NAME, {
		description: "Diagnose a failing GitHub Actions run or PR check",
		argumentHint: "[run URL, PR URL/number, or branch context]",
		handler: async (args, ctx) => {
			await invokeGhCiDebugWorkflow(pi, ctx, args);
		},
	});
}

export async function showCodeWorkflowSelector(
	pi: Pick<CodeWorkflowsExtensionAPI, "sendMessage">,
	ctx: CommandContext,
	args: string,
): Promise<WorkflowRoute | undefined> {
	const requestedRoute = args.trim();
	if (requestedRoute !== "" && requestedRoute !== "list" && requestedRoute !== "menu") {
		const resolvedRoute = resolveWorkflowRoute(requestedRoute);
		if (resolvedRoute === undefined) {
			ctx.ui.notify(`Unknown code workflow: ${requestedRoute}\n\n${formatWorkflowMenu()}`, "error");
			return undefined;
		}
		emitWorkflowSelection(pi, ctx, resolvedRoute);
		return resolvedRoute;
	}

	if (!ctx.hasUI || ctx.ui.select === undefined) {
		ctx.ui.notify(formatWorkflowMenu(), "info");
		return undefined;
	}

	const labelToRoute = new Map(
		menuWorkflowRoutes().map((route) => [formatWorkflowLabel(route), route]),
	);
	const selectedLabel = await ctx.ui.select("Select code workflow", [...labelToRoute.keys()]);
	if (selectedLabel === undefined) {
		ctx.ui.notify("Code workflow selection cancelled.", "info");
		return undefined;
	}

	const route = labelToRoute.get(selectedLabel);
	if (route === undefined) {
		ctx.ui.notify("Selected workflow was not recognized.", "error");
		return undefined;
	}

	emitWorkflowSelection(pi, ctx, route);
	return route;
}

export function completeWorkflowRoute(prefix: string): AutocompleteItem[] | null {
	const normalizedPrefix = prefix.trim().toLowerCase();
	const completions = ROUTES.flatMap((route) => [route.route, ...route.aliases])
		.filter((value) => value.startsWith(normalizedPrefix))
		.map((value) => ({ value, label: value }));
	return completions.length > 0 ? completions : null;
}

export function resolveWorkflowRoute(input: string): WorkflowRoute | undefined {
	const normalized = input.trim().toLowerCase();
	return ROUTES.find(
		(route) => route.route === normalized || route.aliases.some((alias) => alias === normalized),
	);
}

export function formatWorkflowMenu(): string {
	return [
		"Available code workflows:",
		...menuWorkflowRoutes().map((route) => `- ${route.route} — ${route.summary}`),
	].join("\n");
}

export async function invokeGhCiDebugWorkflow(
	pi: CodeWorkflowsExtensionAPI,
	ctx: CommandContext,
	args: string,
): Promise<void> {
	await invokeRepoSkillPromptTurn({
		host: pi,
		ctx,
		skillName: CODE_WORKFLOWS_SKILL_NAME,
		successMessage: `Invoking ${GH_CI_DEBUG_COMMAND_NAME}.`,
		fallbackMessage: `Could not load ${CODE_WORKFLOWS_SKILL_NAME} backing skill; invoking ${GH_CI_DEBUG_COMMAND_NAME} by name.`,
		buildPrompt: (skillBlock) => buildGhCiDebugPrompt(skillBlock, args),
	});
}

export function buildGhCiDebugPrompt(skillBlock: string | undefined, args: string): string {
	return buildSkillInvocationPrompt({
		skillName: CODE_WORKFLOWS_SKILL_NAME,
		route: GH_CI_DEBUG_ROUTE,
		initialRequest: args,
		...(skillBlock === undefined ? {} : { skillBlock }),
	});
}

export function formatWorkflowSelection(
	route: WorkflowRoute,
	options: { editorUpdated?: boolean } = {},
): string {
	const prompt = buildWorkflowPrompt(route);
	const nextStep =
		options.editorUpdated === true
			? "The prompt has been placed in the editor. Press Enter when ready to run it."
			: "To run this workflow, send this prompt when ready:";
	return [
		"## code-workflows",
		"",
		`Selected route: \`${route.route}\``,
		`Reference: \`${route.reference}\``,
		"",
		"No model turn was started.",
		nextStep,
		"",
		"```text",
		prompt,
		"```",
	].join("\n");
}

export function renderCodeWorkflowMessage(
	message: CustomMessage,
	_options: { expanded: boolean },
	theme: RenderTheme,
): RenderComponent {
	const content = typeof message.content === "string" ? message.content : String(message.content);
	return {
		render(width: number): string[] {
			return content
				.split("\n")
				.map((line, index) => styleWorkflowLine(truncateDisplayLine(line, width), index, theme));
		},
		invalidate(): void {},
	};
}

function menuWorkflowRoutes(): WorkflowRoute[] {
	return ROUTES.filter((route) => route.menuVisibility === "visible");
}

function emitWorkflowSelection(
	pi: Pick<CodeWorkflowsExtensionAPI, "sendMessage">,
	ctx: CommandContext,
	route: WorkflowRoute,
): void {
	const prompt = buildWorkflowPrompt(route);
	const editorUpdated = ctx.ui.setEditorText !== undefined;
	ctx.ui.setEditorText?.(prompt);
	const content = formatWorkflowSelection(route, { editorUpdated });
	const details: SelectedWorkflowDetails = {
		route: route.route,
		reference: route.reference,
		prompt,
	};
	if (pi.sendMessage !== undefined) {
		pi.sendMessage({
			customType: CODE_WORKFLOWS_MESSAGE_TYPE,
			content,
			display: true,
			details,
		});
		return;
	}

	ctx.ui.notify(content, "info");
}

function buildWorkflowPrompt(route: WorkflowRoute): string {
	return `Use code-workflows ${route.route}`;
}

function formatWorkflowLabel(route: WorkflowRoute): string {
	return `${route.route} — ${route.summary}`;
}

function styleWorkflowLine(line: string, index: number, theme: RenderTheme): string {
	if (line.length === 0) return line;
	if (index === 0 || line.startsWith("Selected route:")) {
		return theme.fg("accent", theme.bold !== undefined ? theme.bold(line) : line);
	}
	if (line.startsWith("Reference:") || line === "No model turn was started.") {
		return theme.fg("muted", line);
	}
	return line;
}
