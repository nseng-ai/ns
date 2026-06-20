import { lstat, readFile } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";

import {
	listRoastSkillEntries,
	roastSkillLabel,
	type RoastReviewDefinitionEntry,
	type RoastSkillBackedEntry,
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

interface HandleSkillRoastCommandOptions {
	readonly pi: RoastExtensionAPI;
	readonly ctx: BackingSkillCommandContext;
	readonly entry: RoastSkillBackedEntry;
	readonly args: string;
}

interface HandleReviewDefinitionRoastCommandOptions {
	readonly pi: RoastExtensionAPI;
	readonly ctx: BackingSkillCommandContext;
	readonly entry: RoastReviewDefinitionEntry;
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
		cli: roastParityCli(entry),
		...(entry.backing === "skill" ? { skill: entry.skillName } : {}),
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "roast",
		notes:
			"The command is a Pi convenience wrapper over a portable backing skill or Roaster review definition catalog entry.",
	};
}

function roastParityCli(entry: RoastSkillEntry): string {
	if (entry.backing === "skill") {
		return `roaster roast list for catalog discovery; invoke skill ${entry.skillName} directly outside Pi`;
	}
	return `roaster review run ${entry.reviewKey} for CI review execution; roaster roast list for catalog discovery`;
}

async function handleRoastCommand(options: HandleRoastCommandOptions): Promise<void> {
	const { pi, ctx, entry, args } = options;
	if (entry.backing === "skill") {
		await handleSkillRoastCommand({ pi, ctx, entry, args });
		return;
	}
	await handleReviewDefinitionRoastCommand({ pi, ctx, entry, args });
}

async function handleSkillRoastCommand(options: HandleSkillRoastCommandOptions): Promise<void> {
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

async function handleReviewDefinitionRoastCommand(
	options: HandleReviewDefinitionRoastCommandOptions,
): Promise<void> {
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

export function buildRoastPrompt(
	entry: RoastSkillBackedEntry,
	skillBlock: string | undefined,
	args: string,
): string {
	const lines = initialRoastPromptLines(entry, args);
	if (skillBlock !== undefined) {
		lines.unshift(skillBlock);
	} else {
		lines.unshift(
			`The backing skill ${entry.skillName} was not available. Follow the repository review workflow as best you can.`,
		);
	}
	return lines.join("\n\n");
}

export function buildRoasterReviewPrompt(
	entry: RoastReviewDefinitionEntry,
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
