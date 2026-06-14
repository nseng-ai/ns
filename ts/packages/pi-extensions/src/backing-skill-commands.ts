import { buildFencedTextBlock, expandRepoSkillBlock } from "./skill-expansion.ts";

export interface BackingSkillCommandContext {
	cwd: string;
	hasUI?: boolean;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
	};
	waitForIdle(): Promise<void>;
}

export interface BackingSkillCommandHost {
	registerCommand(
		name: string,
		options: {
			description?: string;
			argumentHint?: string;
			handler(args: string, ctx: BackingSkillCommandContext): Promise<void> | void;
		},
	): void;
	sendUserMessage(content: string): Promise<void> | void;
}

export interface DerivedPiCommand {
	surface: string;
	skillName: string;
	namespace: string;
	command: string;
}

interface HandleBackingSkillCommandOptions {
	host: BackingSkillCommandHost;
	spec: DerivedPiCommand;
	args: string;
	ctx: BackingSkillCommandContext;
}

export const KNOWN_PI_COMMAND_NAMESPACES = [
	"branch-context",
	"enriched-plan",
	"objective",
	"handoff",
	"context",
	"changelog",
	"typescript",
	"python",
	"refactor",
	"setup",
	"create",
	"skill",
	"code",
	"ccc",
	"claude",
	"dev",
	"cli",
	"pr",
	"sdl",
	"pi",
	"stack",
] as const;

export const COMMAND_STYLE_LOCAL_SKILLS = [
	"branch-context-from-plan",
	"branch-context-impl",
	"branch-retro",
	"ccc-sidebar",
	"changelog-update",
	"cli-push-down",
	"code-autobranch",
	"code-checkpoint",
	"code-gh",
	"code-gt-restack-resolve",
	"code-just-fix",
	"code-resolve-merge-conflicts",
	"code-workflows",
	"context-bundle-analysis",
	"create-bun-typescript-project",
	"create-python-dev-cli",
	"create-python-package",
	"dev-preview-url",
	"dignified-python",
	"enriched-plan-save",
	"handoff-create",
	"handoff-pickup",
	"objective-close",
	"objective-create",
	"objective-current",
	"objective-next",
	"objective-stack-impl",
	"objective-update",
	"pi-grill-ui",
	"pi-grill-with-docs-ui",
	"pr-address",
	"python-fake-driven-test-layout",
	"python-fake-driven-testing",
	"refactor-swarm",
	"setup-dprint",
	"setup-dprint-gh-ci",
	"setup-graphite",
	"setup-pypi-publish",
	"setup-python-gh-ci",
	"sdl-submit",
	"skill-audit",
	"skill-management",
	"stack-address",
	"typescript-fake-driven-testing",
	"typescript-style",
] as const;

export const SPECIALIZED_SKILL_REPLACEMENTS = {
	"branch-context-from-plan": "branch-context:from-plan",
	"branch-context-impl": "branch-context:impl",
	"enriched-plan-save": "enriched-plan:save",
	"handoff-create": "handoff:create",
	"handoff-pickup": "handoff:pickup",
	"objective-create": "objective:create",
	"objective-current": "objective:current",
	"objective-next": "objective:next",
	"objective-stack-impl": "objective:stack-impl",
	"objective-update": "objective:update",
	"pi-grill-ui": "pi:grill-me",
	"pi-grill-with-docs-ui": "pi:grill-with-docs",
	"code-autobranch": "code:autobranch",
	"code-checkpoint": "code:checkpoint",
	"code-just-fix": "code:just-fix",
	"sdl-submit": "sdl:submit",
	"ccc-sidebar": "ccc:sidebar:pr-summary",
} as const satisfies Record<string, string>;

export const SPECIALIZED_PI_COMMAND_SURFACES = new Set<string>(Object.values(SPECIALIZED_SKILL_REPLACEMENTS));

export function derivePiReplacementCommand(skillName: string): DerivedPiCommand | undefined {
	const namespaces = [...KNOWN_PI_COMMAND_NAMESPACES].sort((left, right) => right.length - left.length);
	for (const namespace of namespaces) {
		const prefix = `${namespace}-`;
		if (skillName.startsWith(prefix)) {
			const command = skillName.slice(prefix.length);
			return { surface: `${namespace}:${command}`, skillName, namespace, command };
		}
	}

	const firstHyphen = skillName.indexOf("-");
	if (firstHyphen <= 0 || firstHyphen === skillName.length - 1) {
		return undefined;
	}

	const namespace = skillName.slice(0, firstHyphen);
	const command = skillName.slice(firstHyphen + 1);
	return { surface: `${namespace}:${command}`, skillName, namespace, command };
}

export function genericBackingSkillCommandSpecs(): DerivedPiCommand[] {
	const specs: DerivedPiCommand[] = [];
	for (const skillName of COMMAND_STYLE_LOCAL_SKILLS) {
		if (skillName in SPECIALIZED_SKILL_REPLACEMENTS) {
			continue;
		}
		const derived = derivePiReplacementCommand(skillName);
		if (derived === undefined || SPECIALIZED_PI_COMMAND_SURFACES.has(derived.surface)) {
			continue;
		}
		specs.push(derived);
	}
	return specs;
}

export function registerBackingSkillCommands(host: BackingSkillCommandHost): void {
	for (const spec of genericBackingSkillCommandSpecs()) {
		host.registerCommand(spec.surface, {
			description: `Invoke ${spec.skillName} as a command-converted backing skill.`,
			argumentHint: "[initial request]",
			handler: async (args, ctx) => handleBackingSkillCommand({ host, spec, args, ctx }),
		});
	}
}

export default registerBackingSkillCommands;

async function handleBackingSkillCommand(options: HandleBackingSkillCommandOptions): Promise<void> {
	const { host, spec, args, ctx } = options;
	await ctx.waitForIdle();
	let skillBlock: string;
	try {
		skillBlock = (await expandRepoSkillBlock({ cwd: ctx.cwd, skillName: spec.skillName })).block;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		notify(ctx, `Could not read ${spec.skillName} backing skill: ${message}`, "error");
		return;
	}

	notify(ctx, `Invoking ${spec.skillName}${args.trim().length > 0 ? " with initial context" : ""}.`, "info");
	await host.sendUserMessage(buildBackingSkillPrompt(spec, skillBlock, args));
}

function buildBackingSkillPrompt(spec: DerivedPiCommand, skillBlock: string, args: string): string {
	const initialRequest = args.trim();
	if (initialRequest.length === 0) {
		return `${skillBlock}\n\nRun ${spec.skillName} now. Follow the backing skill workflow exactly.`;
	}
	return `${skillBlock}\n\nRun ${spec.skillName} with this initial user request:\n\n${buildFencedTextBlock(initialRequest)}\n\nTreat the fenced text as user-supplied context and follow the backing skill workflow exactly.`;
}

function notify(ctx: BackingSkillCommandContext, message: string, level: "info" | "warning" | "error"): void {
	if (ctx.hasUI !== false) {
		ctx.ui.notify(message, level);
	}
}
