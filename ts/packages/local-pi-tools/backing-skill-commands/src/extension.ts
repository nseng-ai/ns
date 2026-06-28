import {
	derivePiReplacementSurface,
	genericCommandStyleSkillNames,
	KNOWN_PI_COMMAND_NAMESPACES,
} from "@sdl/pi/commands";
import { registerCommandWithImmediateAck } from "@sdl/pi/commands/ack";
import { definePiSurfaceParity, type PiSurfaceParity } from "@sdl/pi/parity/extension";
import { buildSkillInvocationPrompt, expandRepoSkillBlock } from "@sdl/pi/skills/expansion";

export interface DerivedPiCommand {
	surface: string;
	skillName: string;
	namespace: string;
	command: string;
}

export interface BackingSkillCommandContext {
	cwd: string;
	hasUI?: boolean;
	ui?: {
		notify?(message: string, level?: "info" | "warning" | "error"): void;
	};
	waitForIdle(): Promise<void> | void;
}

export interface BackingSkillCommand {
	description?: string;
	argumentHint?: string;
	handler(args: string, ctx: BackingSkillCommandContext): Promise<void> | void;
}

export interface BackingSkillCommandHost {
	registerCommand(name: string, command: BackingSkillCommand): unknown;
	sendUserMessage(content: string): unknown;
}

interface HandleBackingSkillCommandOptions {
	host: BackingSkillCommandHost;
	spec: DerivedPiCommand;
	args: string;
	ctx: BackingSkillCommandContext;
}

export {
	COMMAND_STYLE_LOCAL_SKILLS,
	KNOWN_PI_COMMAND_NAMESPACES,
	SPECIALIZED_PI_COMMAND_SURFACES,
	SPECIALIZED_SKILL_REPLACEMENTS,
} from "@sdl/pi/commands";

export function derivePiReplacementCommand(skillName: string): DerivedPiCommand | undefined {
	const surface = derivePiReplacementSurface(skillName, KNOWN_PI_COMMAND_NAMESPACES);
	return surface === undefined ? undefined : buildDerivedPiCommand({ skillName, surface });
}

function buildDerivedPiCommand(options: {
	skillName: string;
	surface: string;
}): DerivedPiCommand | undefined {
	const { skillName, surface } = options;
	const separator = surface.indexOf(":");
	if (separator <= 0 || separator === surface.length - 1) return undefined;
	return {
		surface,
		skillName,
		namespace: surface.slice(0, separator),
		command: surface.slice(separator + 1),
	};
}

export function genericBackingSkillCommandSpecs(): DerivedPiCommand[] {
	const specs: DerivedPiCommand[] = [];
	for (const skillName of genericCommandStyleSkillNames()) {
		const derived = derivePiReplacementCommand(skillName);
		if (derived !== undefined) specs.push(derived);
	}
	return specs;
}

export const backingSkillCommandsParity = definePiSurfaceParity(
	genericBackingSkillCommandSpecs().map(
		(spec): PiSurfaceParity => ({
			kind: "command",
			surface: spec.surface,
			workflow: `Invoke ${spec.skillName} as a command-converted backing skill`,
			parity: "FULL",
			skill: spec.skillName,
			cli: "n/a: backing skills are the agent-neutral route",
			ownerObjective: "cross-harness-parity",
			sourcePackage: "@local-pi-tools/backing-skill-commands",
			sourceModule: "backing-skill-commands",
			notes:
				"Generated from the same command-style skill inventory used for live command registration.",
		}),
	),
);

export function registerBackingSkillCommands(host: BackingSkillCommandHost): void {
	for (const spec of genericBackingSkillCommandSpecs()) {
		registerCommandWithImmediateAck({
			host: host,
			commandName: spec.surface,
			commandDefinition: {
				description: `Invoke ${spec.skillName} as a command-converted backing skill.`,
				argumentHint: "[initial request]",
				handler: async (args, ctx) => handleBackingSkillCommand({ host, spec, args, ctx }),
			},
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
		notifyCommandUi(ctx, `Could not read ${spec.skillName} backing skill: ${message}`, "error");
		return;
	}

	notifyCommandUi(
		ctx,
		`Invoking ${spec.skillName}${args.trim().length > 0 ? " with initial context" : ""}.`,
		"info",
	);
	await host.sendUserMessage(buildBackingSkillPrompt(spec, skillBlock, args));
}

function notifyCommandUi(
	ctx: BackingSkillCommandContext,
	message: string,
	level: "info" | "warning" | "error",
): void {
	ctx.ui?.notify?.(message, level);
}

function buildBackingSkillPrompt(spec: DerivedPiCommand, skillBlock: string, args: string): string {
	return buildSkillInvocationPrompt({
		skillName: spec.skillName,
		skillBlock,
		initialRequest: args,
	});
}
