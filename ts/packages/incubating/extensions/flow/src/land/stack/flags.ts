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
			"Skip the stack/global landing confirmation. With the default preserve policy, disclosed blocked descendants complete with a warning; --free and --up still fail nonzero if required survivor reconciliation cannot complete.",
		commandDescription:
			"Confirm stack landing without an interactive prompt; default preserve reports blocked descendants as a success-with-warning.",
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
		long: "--free",
		aliases: ["--free", "-F"],
		parsedArg: "shouldFreeSlot",
		commandRequestField: "free",
		commandShort: "-F",
		usageDescription:
			"After landing, reconcile surviving branches, delete safely cleanable landed local branches, and free the current managed slot.",
	},
	{
		long: "--up",
		aliases: ["--up"],
		parsedArg: "shouldContinueUpstack",
		commandRequestField: "up",
		usageDescription:
			"After landing, reconcile surviving branches and continue onto the sole immediate upstack child in this worktree; always keep the managed slot. By default the landed local branch is retained; pass --free to delete it after successful continuation.",
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
		if (!("commandShort" in descriptor) || descriptor.commandShort === undefined) return [];
		return [[descriptor.commandRequestField, { short: descriptor.commandShort }] as const];
	});
	return Object.fromEntries(entries) as LandCommandOptionSpecs;
}

export function landParsedArgsFromCommandRequest(request: LandCommandRequest): ParsedArgs {
	return {
		shouldSkipConfirmation: request.yes === true,
		isDryRun: request.dryRun === true,
		shouldFreeSlot: request.free === true,
		shouldContinueUpstack: request.up === true,
		shouldShowHelp: false,
		shouldStreamVerboseOutput: request.verbose === true,
	};
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
