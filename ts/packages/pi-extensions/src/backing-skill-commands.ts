import {
	derivePiReplacementSurface,
	genericCommandStyleSkillNames,
	KNOWN_PI_COMMAND_NAMESPACES,
} from "@sdl/pi-command-surfaces";
import { withImmediateCommandAck } from "@sdl/pi-extension-runtime/command-ack";

import type { PiCommandContext, PiCommandHost } from "./pi-command-host.ts";
import { buildSkillInvocationPrompt, expandRepoSkillBlock } from "./skill-expansion.ts";

export interface DerivedPiCommand {
	surface: string;
	skillName: string;
	namespace: string;
	command: string;
}

interface HandleBackingSkillCommandOptions {
	host: PiCommandHost;
	spec: DerivedPiCommand;
	args: string;
	ctx: PiCommandContext;
}

export {
	COMMAND_STYLE_LOCAL_SKILLS,
	KNOWN_PI_COMMAND_NAMESPACES,
	SPECIALIZED_PI_COMMAND_SURFACES,
	SPECIALIZED_SKILL_REPLACEMENTS,
} from "@sdl/pi-command-surfaces";

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

export function registerBackingSkillCommands(host: PiCommandHost): void {
	const commandHost = withImmediateCommandAck(host);
	for (const spec of genericBackingSkillCommandSpecs()) {
		commandHost.registerCommand(spec.surface, {
			description: `Invoke ${spec.skillName} as a command-converted backing skill.`,
			argumentHint: "[initial request]",
			handler: async (args, ctx) =>
				handleBackingSkillCommand({ host: commandHost, spec, args, ctx }),
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

	notify(
		ctx,
		`Invoking ${spec.skillName}${args.trim().length > 0 ? " with initial context" : ""}.`,
		"info",
	);
	await host.sendUserMessage(buildBackingSkillPrompt(spec, skillBlock, args));
}

function buildBackingSkillPrompt(spec: DerivedPiCommand, skillBlock: string, args: string): string {
	return buildSkillInvocationPrompt({
		skillName: spec.skillName,
		skillBlock,
		initialRequest: args,
	});
}

function notify(ctx: PiCommandContext, message: string, level: "info" | "warning" | "error"): void {
	if (ctx.hasUI !== false) {
		ctx.ui.notify(message, level);
	}
}
