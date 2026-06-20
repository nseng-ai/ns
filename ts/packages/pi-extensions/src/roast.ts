import { lstat, readFile } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";

import {
	listRoastSkillEntries,
	roastSkillLabel,
	type RoastSkillEntry,
} from "@sdl/roaster/skill-reviews";

import { buildFencedTextBlock } from "./skill-expansion.ts";
import { definePiSurfaceParity, type FullPiSurfaceParity } from "./parity.ts";

export const roastParity = definePiSurfaceParity(listRoastSkillEntries().map(roastParityRecord));

export interface RoastCommandContext {
	cwd: string;
	hasUI?: boolean;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
	};
	waitForIdle(): Promise<void>;
}

export interface RoastExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			argumentHint?: string;
			handler(args: string, ctx: RoastCommandContext): Promise<void> | void;
		},
	): void;
	sendUserMessage(content: string): Promise<void> | void;
}

interface HandleRoastCommandOptions {
	readonly pi: RoastExtensionAPI;
	readonly ctx: RoastCommandContext;
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
		workflow: `Run ${roastSkillLabel(entry)} Roaster review`,
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
	const { pi, ctx, entry, args } = options;
	await ctx.waitForIdle();

	const reviewDefinition = await loadRoasterReviewDefinition(ctx.cwd, entry.reviewPath);
	if (ctx.hasUI === true) {
		const message =
			reviewDefinition === undefined
				? `Could not read ${entry.reviewPath}; sending fallback roast prompt.`
				: `Starting ${roastSkillLabel(entry)} from ${entry.reviewPath}.`;
		ctx.ui.notify(message, reviewDefinition === undefined ? "warning" : "info");
	}

	await pi.sendUserMessage(buildRoasterReviewPrompt(entry, reviewDefinition, args));
}

export function buildRoasterReviewPrompt(
	entry: RoastSkillEntry,
	reviewDefinition: string | undefined,
	args: string,
): string {
	const lines = initialRoastPromptLines(entry, args);
	if (reviewDefinition !== undefined) {
		lines.unshift(
			`Use this Roaster review definition from ${entry.reviewPath}. This is the same review definition used by CI:\n\n<roaster-review-definition key="${entry.reviewKey}" path="${entry.reviewPath}">\n${reviewDefinition}\n</roaster-review-definition>`,
		);
	} else {
		lines.unshift(
			`The Roaster review definition ${entry.reviewPath} was not available. Follow the repository review workflow as best you can.`,
		);
	}
	return lines.join("\n\n");
}

function initialRoastPromptLines(entry: RoastSkillEntry, args: string): string[] {
	const request = args.trim();
	const lines = [`Run ${roastSkillLabel(entry)} now.`];
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

async function loadRoasterReviewDefinition(
	cwd: string,
	reviewPath: string,
): Promise<string | undefined> {
	const resolvedPath = await resolveReviewDefinitionPath(cwd, reviewPath);
	if (resolvedPath === undefined) return undefined;
	return await readFile(resolvedPath, "utf8");
}

async function resolveReviewDefinitionPath(
	cwd: string,
	reviewPath: string,
): Promise<string | undefined> {
	let current = resolve(cwd);
	const root = parse(current).root;
	while (true) {
		const candidate = join(current, reviewPath);
		if (await isReadableFile(candidate)) return candidate;
		if (current === root) return undefined;
		current = dirname(current);
	}
}

async function isReadableFile(path: string): Promise<boolean> {
	try {
		const stats = await lstat(path);
		return stats.isFile();
	} catch {
		return false;
	}
}
