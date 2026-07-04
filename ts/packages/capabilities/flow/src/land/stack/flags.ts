import type { z } from "zod";

import type { ParsedArgs } from "./types.ts";

interface LandFlagDescriptor {
	readonly long: `--${string}`;
	readonly embeddedAliases: readonly string[];
	readonly usageAliases: readonly string[];
	readonly parsedArg: keyof ParsedArgs;
	readonly commandRequestField?: string;
	readonly commandShort?: `-${string}`;
	readonly usageDescription: string;
	readonly commandDescription?: string;
	readonly includeInEmbeddedCompletions: boolean;
	readonly includeInEmbeddedUsage: boolean;
}

export const landFlagDescriptors = [
	{
		long: "--yes",
		embeddedAliases: ["--yes", "-y"],
		usageAliases: ["--yes", "-y"],
		parsedArg: "shouldSkipConfirmation",
		commandRequestField: "yes",
		commandShort: "-y",
		usageDescription:
			"Skip stack/global landing and post-landing cleanup confirmation. Landing-branch managed slot cleanup and PR submit/update still require explicit UI confirmation.",
		commandDescription: "Confirm stack landing without an interactive prompt.",
		includeInEmbeddedCompletions: true,
		includeInEmbeddedUsage: true,
	},
	{
		long: "--dry-run",
		embeddedAliases: ["--dry-run"],
		usageAliases: ["--dry-run"],
		parsedArg: "isDryRun",
		commandRequestField: "dryRun",
		commandShort: "-n",
		usageDescription: "Show the full stack path plan and exit before mutating refs or PRs.",
		commandDescription: "Show what would land without merging PRs.",
		includeInEmbeddedCompletions: true,
		includeInEmbeddedUsage: true,
	},
	{
		long: "--preserve",
		embeddedAliases: ["--preserve", "-p"],
		usageAliases: ["--preserve", "-p"],
		parsedArg: "shouldPreserveSlot",
		commandRequestField: "preserve",
		commandShort: "-p",
		usageDescription:
			"Keep the current managed slot and landed local branch after successful landing.",
		includeInEmbeddedCompletions: true,
		includeInEmbeddedUsage: true,
	},
	{
		long: "--force",
		embeddedAliases: ["--force", "-f"],
		usageAliases: ["--force", "-f"],
		parsedArg: "shouldForceCleanup",
		commandRequestField: "force",
		commandShort: "-f",
		usageDescription: "Skip the post-landing cleanup confirmation.",
		includeInEmbeddedCompletions: true,
		includeInEmbeddedUsage: true,
	},
	{
		long: "--verbose",
		embeddedAliases: ["--verbose"],
		usageAliases: ["--verbose"],
		parsedArg: "shouldStreamVerboseOutput",
		commandRequestField: "verbose",
		commandShort: "-v",
		usageDescription: "Stream raw GitHub/Graphite subprocess output while landing.",
		includeInEmbeddedCompletions: true,
		includeInEmbeddedUsage: true,
	},
	{
		long: "--help",
		embeddedAliases: ["--help", "-h"],
		usageAliases: ["--help", "-h"],
		parsedArg: "shouldShowHelp",
		usageDescription: "Show this help.",
		includeInEmbeddedCompletions: true,
		includeInEmbeddedUsage: true,
	},
] as const satisfies readonly LandFlagDescriptor[];

type LandFlagDescriptorEntry = (typeof landFlagDescriptors)[number];
type LandCommandFlagDescriptor = Extract<
	LandFlagDescriptorEntry,
	{ readonly commandRequestField: string }
>;
type LandParsedArgFlag = LandFlagDescriptorEntry["parsedArg"];

export type LandCommandRequestField = LandCommandFlagDescriptor["commandRequestField"];
export type LandCommandRequest = Readonly<
	Partial<Record<LandCommandRequestField, boolean | undefined>>
>;
export type LandCommandSchemaShape = {
	readonly [Field in LandCommandRequestField]: z.ZodOptional<z.ZodBoolean>;
};
export type LandCommandOptionSpecs = Partial<
	Record<LandCommandRequestField, { readonly short: `-${string}` }>
>;

export interface LandUsageOptionRow {
	readonly aliases: readonly string[];
	readonly description: string;
}

export function landCompletionFlags(): readonly string[] {
	return landFlagDescriptors
		.filter((descriptor) => descriptor.includeInEmbeddedCompletions)
		.map((descriptor) => descriptor.long);
}

export function landUsageTokens(): readonly string[] {
	return landFlagDescriptors
		.filter((descriptor) => descriptor.includeInEmbeddedUsage)
		.map((descriptor) => `[${descriptor.long}]`);
}

export function landUsageOptionRows(): readonly LandUsageOptionRow[] {
	return landFlagDescriptors
		.filter((descriptor) => descriptor.includeInEmbeddedUsage)
		.map((descriptor) => ({
			aliases: descriptor.usageAliases,
			description: descriptor.usageDescription,
		}));
}

export function parseLandFlagToken(token: string): LandParsedArgFlag | undefined {
	for (const descriptor of landFlagDescriptors) {
		if (descriptor.embeddedAliases.some((alias) => alias === token)) return descriptor.parsedArg;
	}
	return undefined;
}

export function landCommandSchemaShape(zod: Pick<typeof z, "boolean">): LandCommandSchemaShape {
	const entries = landCommandFlagDescriptors().map((descriptor) => [
		descriptor.commandRequestField,
		zod.boolean().optional().describe(commandDescriptionForDescriptor(descriptor)),
	]);
	return Object.fromEntries(entries) as LandCommandSchemaShape;
}

export function landCommandOptionSpecs(): LandCommandOptionSpecs {
	const entries = landCommandFlagDescriptors().flatMap((descriptor) => {
		if (descriptor.commandShort === undefined) return [];
		return [[descriptor.commandRequestField, { short: descriptor.commandShort }] as const];
	});
	return Object.fromEntries(entries) as LandCommandOptionSpecs;
}

export function landRawArgsFromCommandRequest(request: LandCommandRequest): string[] {
	const rawArgs: string[] = [];
	for (const descriptor of landCommandFlagDescriptors()) {
		if (request[descriptor.commandRequestField] === true) rawArgs.push(descriptor.long);
	}
	return rawArgs;
}

function commandDescriptionForDescriptor(descriptor: LandCommandFlagDescriptor): string {
	return "commandDescription" in descriptor
		? descriptor.commandDescription
		: descriptor.usageDescription;
}

function landCommandFlagDescriptors(): readonly LandCommandFlagDescriptor[] {
	return landFlagDescriptors.filter(hasCommandRequestField);
}

function hasCommandRequestField(
	descriptor: LandFlagDescriptorEntry,
): descriptor is LandCommandFlagDescriptor {
	return "commandRequestField" in descriptor;
}
