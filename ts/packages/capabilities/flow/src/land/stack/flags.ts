import type { z } from "zod";

import type { ParsedArgs } from "./types.ts";

interface LandFlagDescriptor {
	readonly long: `--${string}`;
	readonly aliases: readonly string[];
	readonly parsedArg: keyof ParsedArgs;
	readonly commandRequestField?: string;
	readonly commandShort?: `-${string}`;
	readonly usageDescription: string;
	readonly commandDescription?: string;
}

export const landFlagDescriptors = [
	{
		long: "--yes",
		aliases: ["--yes", "-y"],
		parsedArg: "shouldSkipConfirmation",
		commandRequestField: "yes",
		commandShort: "-y",
		usageDescription:
			"Skip stack/global landing and post-landing cleanup confirmation. Landing-branch managed slot cleanup and PR submit/update still require explicit UI confirmation.",
		commandDescription: "Confirm stack landing without an interactive prompt.",
	},
	{
		long: "--dry-run",
		aliases: ["--dry-run"],
		parsedArg: "isDryRun",
		commandRequestField: "dryRun",
		commandShort: "-n",
		usageDescription: "Show the full stack path plan and exit before mutating refs or PRs.",
		commandDescription: "Show what would land without merging PRs.",
	},
	{
		long: "--preserve",
		aliases: ["--preserve", "-p"],
		parsedArg: "shouldPreserveSlot",
		commandRequestField: "preserve",
		commandShort: "-p",
		usageDescription:
			"Keep the current managed slot and landed local branch after successful landing.",
	},
	{
		long: "--force",
		aliases: ["--force", "-f"],
		parsedArg: "shouldForceCleanup",
		commandRequestField: "force",
		commandShort: "-f",
		usageDescription: "Skip the post-landing cleanup confirmation.",
	},
	{
		long: "--verbose",
		aliases: ["--verbose"],
		parsedArg: "shouldStreamVerboseOutput",
		commandRequestField: "verbose",
		commandShort: "-v",
		usageDescription: "Stream raw GitHub/Graphite subprocess output while landing.",
	},
	{
		long: "--help",
		aliases: ["--help", "-h"],
		parsedArg: "shouldShowHelp",
		usageDescription: "Show this help.",
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
	return landFlagDescriptors.map((descriptor) => descriptor.long);
}

export function landUsageTokens(): readonly string[] {
	return landFlagDescriptors.map((descriptor) => `[${descriptor.long}]`);
}

export function landUsageOptionRows(): readonly LandUsageOptionRow[] {
	return landFlagDescriptors.map((descriptor) => ({
		aliases: descriptor.aliases,
		description: descriptor.usageDescription,
	}));
}

export function parseLandFlagToken(token: string): LandParsedArgFlag | undefined {
	for (const descriptor of landFlagDescriptors) {
		if (descriptor.aliases.some((alias) => alias === token)) return descriptor.parsedArg;
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
