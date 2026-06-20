import {
	listRoastSkillEntries,
	roastSkillLabel,
	type RoastSkillEntry,
} from "@sdl/roaster/skill-reviews";

import { buildFencedTextBlock, invokeRepoSkillPromptTurn } from "./skill-expansion.ts";
import { definePiSurfaceParity, type FullPiSurfaceParity } from "./parity.ts";
import type {
	BackingSkillCommandContext,
	BackingSkillCommandHost,
} from "./backing-skill-commands.ts";
import type { SkillCommandInfo } from "./skill-expansion.ts";

export const roastParity = definePiSurfaceParity(listRoastSkillEntries().map(roastParityRecord));

export interface RoastExtensionAPI extends BackingSkillCommandHost {
	getCommands?(): readonly SkillCommandInfo[];
}

interface HandleRoastCommandOptions {
	readonly pi: RoastExtensionAPI;
	readonly ctx: BackingSkillCommandContext;
	readonly entry: RoastSkillEntry;
	readonly args: string;
}

export default function roastExtension(pi: RoastExtensionAPI): void {
	for (const entry of listRoastSkillEntries()) {
		pi.registerCommand(entry.surface, {
			description: `${roastSkillLabel(entry)} — ${entry.description}`,
			argumentHint: "[review request/scope]",
			handler: async (args, ctx) => handleRoastCommand({ pi, ctx, entry, args }),
		});
	}
}

function roastParityRecord(entry: RoastSkillEntry): FullPiSurfaceParity {
	return {
		kind: "command",
		surface: entry.surface,
		workflow: `Run ${roastSkillLabel(entry)} Roaster review skill`,
		parity: "FULL",
		cli: `roaster roast list for catalog discovery; invoke skill ${entry.skillName} directly outside Pi`,
		skill: entry.skillName,
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "roast",
		notes:
			"The command is a Pi convenience wrapper over a portable backing skill and Roaster-owned catalog entry.",
	};
}

async function handleRoastCommand(options: HandleRoastCommandOptions): Promise<void> {
	const { pi, ctx, entry, args } = options;
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
