import { truncateDisplayLine } from "./terminal-presentation.ts";
import type { CommandContext, CustomMessage, RenderComponent, RenderTheme } from "./handoff/runtime-types.ts";

export const INTERNAL_CODE_WORKFLOWS_COMMAND_NAME = "internal-code-workflows";
export const INTERNAL_CODE_WORKFLOWS_MESSAGE_TYPE = "internal-code-workflows-selection";

interface AutocompleteItem {
	value: string;
	label?: string;
	description?: string;
}

interface RegisteredCommand {
	description?: string;
	getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
	handler(args: string, ctx: CommandContext): Promise<void> | void;
}

interface InternalCodeWorkflowsExtensionAPI {
	registerCommand(name: string, command: RegisteredCommand): void;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(message: CustomMessage): void;
}

type MessageRenderer = (message: CustomMessage, options: { expanded: boolean }, theme: RenderTheme) => RenderComponent;

interface WorkflowRoute {
	route: string;
	aliases: readonly string[];
	reference: string;
	summary: string;
	directSkill?: string;
}

interface SelectedWorkflowDetails {
	route: string;
	reference: string;
	prompt: string;
	directSkill?: string;
}

const ROUTES = [
	{
		route: "delete-stack",
		aliases: ["gt-delete-stack", "internal-code-gt-delete-stack"],
		reference: "skills/internal-code-workflows/references/delete-stack.md",
		summary: "delete a Graphite subtree with slot/PR/remote cleanup",
	},
	{
		route: "stackify-branch",
		aliases: ["gt-stackify-branch", "internal-code-gt-stackify-branch"],
		reference: "skills/internal-code-workflows/references/gt-stackify-branch.md",
		summary: "split one branch into a clean Graphite stack",
	},
	{
		route: "stacker-agent",
		aliases: ["stacker", "internal-code-stacker-agent"],
		reference: "skills/internal-code-workflows/references/stacker-agent.md",
		summary: "serial multi-slice implementation coordinator",
	},
	{
		route: "parity-review",
		aliases: ["cross-harness-parity", "internal-code-parity-review"],
		reference: "skills/internal-code-workflows/references/parity-review.md",
		summary: "review Pi command/tool changes for cross-harness parity",
	},
	{
		route: "stack-address",
		aliases: ["pr-stack-address", "internal-pr-stack-address"],
		reference: "skills/internal-code-workflows/references/stack-address.md",
		summary: "address unresolved feedback across a Graphite PR stack",
		directSkill: "internal-pr-stack-address",
	},
	{
		route: "gh-ci-debug",
		aliases: ["ci-debug", "internal-code-gh-ci-debug"],
		reference: "skills/internal-code-workflows/references/gh-ci-debug.md",
		summary: "diagnose a failing GitHub Actions run or PR check",
	},
] as const satisfies readonly WorkflowRoute[];

export default function internalCodeWorkflowsExtension(pi: InternalCodeWorkflowsExtensionAPI): void {
	pi.registerMessageRenderer?.(INTERNAL_CODE_WORKFLOWS_MESSAGE_TYPE, renderInternalCodeWorkflowMessage);
	registerWorkflowCommand(pi, INTERNAL_CODE_WORKFLOWS_COMMAND_NAME);
	for (const route of ROUTES) {
		for (const commandName of getLegacyWorkflowCommandNames(route)) {
			registerWorkflowCommand(pi, commandName, route.route);
		}
	}
}

export async function showInternalCodeWorkflowSelector(
	pi: Pick<InternalCodeWorkflowsExtensionAPI, "sendMessage">,
	ctx: CommandContext,
	args: string,
): Promise<WorkflowRoute | undefined> {
	const requestedRoute = args.trim();
	if (requestedRoute !== "" && requestedRoute !== "list" && requestedRoute !== "menu") {
		const resolvedRoute = resolveWorkflowRoute(requestedRoute);
		if (resolvedRoute === undefined) {
			ctx.ui.notify(`Unknown internal code workflow: ${requestedRoute}\n\n${formatWorkflowMenu()}`, "error");
			return undefined;
		}
		emitWorkflowSelection(pi, ctx, resolvedRoute);
		return resolvedRoute;
	}

	if (!ctx.hasUI || ctx.ui.select === undefined) {
		ctx.ui.notify(formatWorkflowMenu(), "info");
		return undefined;
	}

	const labelToRoute = new Map(ROUTES.map((route) => [formatWorkflowLabel(route), route]));
	const selectedLabel = await ctx.ui.select("Select internal code workflow", [...labelToRoute.keys()]);
	if (selectedLabel === undefined) {
		ctx.ui.notify("Internal code workflow selection cancelled.", "info");
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
	return ROUTES.find((route) => route.route === normalized || route.aliases.some((alias) => alias === normalized));
}

export function formatWorkflowMenu(): string {
	return ["Available internal code workflows:", ...ROUTES.map((route) => `- ${route.route} — ${route.summary}`)].join("\n");
}

export function formatWorkflowSelection(route: WorkflowRoute, options: { editorUpdated?: boolean } = {}): string {
	const prompt = buildWorkflowPrompt(route);
	const nextStep = options.editorUpdated === true
		? "The prompt has been placed in the editor. Press Enter when ready to run it."
		: "To run this workflow, send this prompt when ready:";
	const targetLine = route.directSkill === undefined
		? `Reference: \`${route.reference}\``
		: `Skill: \`${route.directSkill}\``;
	return [
		"## internal-code-workflows",
		"",
		`Selected route: \`${route.route}\``,
		targetLine,
		"",
		"No model turn was started.",
		nextStep,
		"",
		"```text",
		prompt,
		"```",
	].join("\n");
}

export function renderInternalCodeWorkflowMessage(
	message: CustomMessage,
	_options: { expanded: boolean },
	theme: RenderTheme,
): RenderComponent {
	const content = typeof message.content === "string" ? message.content : String(message.content);
	return {
		render(width: number): string[] {
			return content.split("\n").map((line, index) => styleWorkflowLine(truncateDisplayLine(line, width), index, theme));
		},
		invalidate(): void {},
	};
}

function emitWorkflowSelection(
	pi: Pick<InternalCodeWorkflowsExtensionAPI, "sendMessage">,
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
		...(route.directSkill === undefined ? {} : { directSkill: route.directSkill }),
	};
	if (pi.sendMessage !== undefined) {
		pi.sendMessage({
			customType: INTERNAL_CODE_WORKFLOWS_MESSAGE_TYPE,
			content,
			display: true,
			details,
		});
		return;
	}

	ctx.ui.notify(content, "info");
}

function registerWorkflowCommand(pi: InternalCodeWorkflowsExtensionAPI, commandName: string, defaultRoute?: string): void {
	const isRouterCommand = defaultRoute === undefined;
	pi.registerCommand(commandName, {
		description: isRouterCommand
			? "Select a rare internal code workflow without starting a model turn"
			: `Select the ${defaultRoute} internal code workflow without starting a model turn`,
		...(isRouterCommand ? { getArgumentCompletions: completeWorkflowRoute } : {}),
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const requestedRoute = args.trim() === "" && defaultRoute !== undefined ? defaultRoute : args;
			await showInternalCodeWorkflowSelector(pi, ctx, requestedRoute);
		},
	});
}

function getLegacyWorkflowCommandNames(route: WorkflowRoute): string[] {
	return route.aliases.filter((alias) => alias.startsWith("internal-"));
}

function buildWorkflowPrompt(route: WorkflowRoute): string {
	return route.directSkill === undefined ? `Use internal-code-workflows ${route.route}` : `Use ${route.directSkill}`;
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
