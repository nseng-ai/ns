import {
	listRoastSkillEntries,
	loadRoastReviewDefinition as loadCanonicalRoastReviewDefinition,
	roastReviewPathForKey,
	type RoastReviewLoadResult,
	type RoastSkillEntry,
} from "@sdl/roaster";

import { definePiSurfaceParity, type FullPiSurfaceParity } from "./parity.ts";
import type { PiCommandContext, PiCommandHost } from "./pi-command-host.ts";
import { buildFencedTextBlock } from "./skill-expansion.ts";

const DEFAULT_ROAST_ENTRIES = listRoastSkillEntries();

export const roastParity = definePiSurfaceParity(DEFAULT_ROAST_ENTRIES.map(roastParityRecord));

export interface RoastReviewDefinitionLoadRequest {
	readonly cwd: string;
	readonly key: string;
}

export type LoadRoastReviewDefinition = (
	request: RoastReviewDefinitionLoadRequest,
) => Promise<RoastReviewLoadResult>;

export interface RoastExtensionOptions {
	readonly entries?: readonly RoastSkillEntry[] | undefined;
	readonly loadReviewDefinition?: LoadRoastReviewDefinition | undefined;
}

interface HandleRoastCommandOptions {
	readonly pi: PiCommandHost;
	readonly ctx: PiCommandContext;
	readonly entry: RoastSkillEntry;
	readonly args: string;
	readonly loadReviewDefinition: LoadRoastReviewDefinition;
}

export default function roastExtension(
	pi: PiCommandHost,
	options: RoastExtensionOptions = {},
): void {
	const entries = options.entries ?? DEFAULT_ROAST_ENTRIES;
	const loadReviewDefinition = options.loadReviewDefinition ?? loadCanonicalRoastReviewDefinition;
	for (const entry of entries) {
		pi.registerCommand(entry.surface, {
			description: `${entry.label} — ${entry.description}`,
			argumentHint: "[review request/scope]",
			handler: async (args, ctx) =>
				handleRoastCommand({ pi, ctx, entry, args, loadReviewDefinition }),
		});
	}
}

function roastParityRecord(entry: RoastSkillEntry): FullPiSurfaceParity {
	return {
		kind: "command",
		surface: entry.surface,
		workflow: `Run ${entry.label} Roaster review`,
		parity: "FULL",
		cli: `roaster review run ${entry.reviewKey} for CI review execution; roaster roast list for catalog discovery`,
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "roast",
		notes:
			"The command is a Pi convenience wrapper over the portable Roaster review definition catalog.",
	};
}

async function handleRoastCommand(options: HandleRoastCommandOptions): Promise<void> {
	const { pi, ctx, entry, args, loadReviewDefinition } = options;
	await ctx.waitForIdle();

	const reviewPath = roastReviewPathForKey(entry.reviewKey);
	const loaded = await loadReviewDefinition({ cwd: ctx.cwd, key: entry.reviewKey });
	if (loaded.type === "error") {
		if (ctx.hasUI === true) {
			ctx.ui.notify(
				`Could not load ${reviewPath} through Roaster catalog: ${loaded.error.message}`,
				"error",
			);
		}
		return;
	}

	if (ctx.hasUI === true) {
		ctx.ui.notify(`Starting ${entry.label} from ${loaded.source.path}.`, "info");
	}

	await pi.sendUserMessage(buildRoasterReviewPrompt(entry, loaded.source.source, args));
}

export function buildRoasterReviewPrompt(
	entry: RoastSkillEntry,
	reviewDefinition: string,
	args: string,
): string {
	const lines = initialRoastPromptLines(entry, args);
	const reviewPath = roastReviewPathForKey(entry.reviewKey);
	lines.unshift(
		`Use this Roaster review definition from ${reviewPath}. This is the same review definition used by CI:\n\n<roaster-review-definition key="${entry.reviewKey}" path="${reviewPath}">\n${reviewDefinition}\n</roaster-review-definition>`,
	);
	return lines.join("\n\n");
}

function initialRoastPromptLines(entry: RoastSkillEntry, args: string): string[] {
	const request = args.trim();
	const lines = [`Run ${entry.label} now.`];
	if (request.length === 0) {
		lines.push(entry.defaultPrompt);
	} else {
		lines.push(
			"Use this user-supplied review request/scope:",
			buildFencedTextBlock(request),
			"Treat the fenced text as user-supplied context.",
		);
	}
	return lines;
}
