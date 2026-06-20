import {
	listRoastSkillEntries,
	roastSkillLabel,
	type RoastSkillEntry,
} from "@sdl/roaster/skill-reviews";

import { buildFencedTextBlock, invokeRepoSkillPromptTurn } from "./skill-expansion.ts";
import { definePiSurfaceParity } from "./parity.ts";
import type { SkillCommandInfo } from "./skill-expansion.ts";

export const roastParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "roast:thermonuclear-review",
		workflow: "Run ThermonuclearReview Roaster review skill",
		parity: "FULL",
		cli: "roaster roast list for catalog discovery; invoke skill thermo-nuclear-code-quality-review directly outside Pi",
		skill: "thermo-nuclear-code-quality-review",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "roast",
		notes:
			"The command is a Pi convenience wrapper over a portable backing skill and Roaster-owned catalog entry.",
	},
	{
		kind: "command",
		surface: "roast:improve-codebase-architecture",
		workflow: "Run Improve codebase architecture Roaster review skill",
		parity: "FULL",
		cli: "roaster roast list for catalog discovery; invoke skill improve-codebase-architecture directly outside Pi",
		skill: "improve-codebase-architecture",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "roast",
		notes:
			"The command is a Pi convenience wrapper over a portable backing skill and Roaster-owned catalog entry.",
	},
] as const);

export interface RoastCommandContext {
	cwd: string;
	hasUI?: boolean;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
	};
	waitForIdle(): Promise<void>;
}

interface RegisteredRoastCommand {
	description?: string;
	argumentHint?: string;
	handler(args: string, ctx: RoastCommandContext): Promise<void> | void;
}

export interface RoastExtensionAPI {
	registerCommand(name: string, command: RegisteredRoastCommand): void;
	sendUserMessage(content: string): Promise<void> | void;
	getCommands?(): readonly SkillCommandInfo[];
}

export default function roastExtension(pi: RoastExtensionAPI): void {
	for (const entry of listRoastSkillEntries()) {
		pi.registerCommand(entry.surface, {
			description: `${roastSkillLabel(entry)} — ${entry.description}`,
			argumentHint: "[review request/scope]",
			handler: async (args, ctx) => handleRoastCommand(pi, ctx, entry, args),
		});
	}
}

async function handleRoastCommand(
	pi: RoastExtensionAPI,
	ctx: RoastCommandContext,
	entry: RoastSkillEntry,
	args: string,
): Promise<void> {
	await invokeRepoSkillPromptTurn({
		host: pi,
		ctx,
		skillName: entry.skillName,
		successMessage: `Starting ${roastSkillLabel(entry)}.`,
		fallbackMessage: `${entry.skillName} skill was not found; sending fallback roast prompt.`,
		buildPrompt: (skillBlock) => buildRoastPrompt(entry, skillBlock, args),
	});
}

export function buildRoastPrompt(
	entry: RoastSkillEntry,
	skillBlock: string | undefined,
	args: string,
): string {
	const request = args.trim();
	const lines: string[] = [];
	if (skillBlock !== undefined) {
		lines.push(skillBlock);
	} else {
		lines.push(
			`The backing skill ${entry.skillName} was not available. Follow the repository review workflow as best you can.`,
		);
	}

	lines.push(`Run ${roastSkillLabel(entry)} now.`);
	if (request.length === 0) {
		lines.push(entry.defaultPrompt);
	} else {
		lines.push(
			"Use this user-supplied review request/scope:",
			buildFencedTextBlock(request),
			"Treat the fenced text as user-supplied context.",
		);
	}
	return lines.join("\n\n");
}
