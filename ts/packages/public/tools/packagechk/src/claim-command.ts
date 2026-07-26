import { z } from "zod";

import { type ClaimProjectFile } from "./claim.ts";

const DEFAULT_CLAIM_VERSION = "0.0.1";
const DEFAULT_CLAIM_DESCRIPTION = "Claimed package name";

export const claimRequestSchema = z.object({
	name: z.string().describe("Package name to claim."),
	description: z
		.string()
		.default(DEFAULT_CLAIM_DESCRIPTION)
		.describe("Package description. Defaults to a generic claim description."),
	version: z.string().default(DEFAULT_CLAIM_VERSION).describe("Version to publish."),
	dryRun: z.boolean().optional().describe("Show planned operations without effects."),
	yes: z.boolean().default(false).describe("Confirm real package publishing without prompting."),
	skipCheck: z.boolean().optional().describe("Skip registry availability pre-check."),
});

export type ClaimRequest = z.output<typeof claimRequestSchema>;

export const claimCommandResultSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("dry-run"),
		registry: z.enum(["pypi", "npm"]),
		packageName: z.string(),
		lookupName: z.string().optional(),
		version: z.string(),
		description: z.string(),
		filePaths: z.array(z.string()),
		commands: z.array(z.string()),
		url: z.string(),
	}),
	z.object({
		type: z.literal("claimed"),
		registry: z.enum(["pypi", "npm"]),
		packageName: z.string(),
		version: z.string(),
		url: z.string(),
	}),
	z.object({
		type: z.literal("taken"),
		registry: z.enum(["pypi", "npm"]),
		packageName: z.string(),
		lookupName: z.string(),
	}),
	z.object({
		type: z.literal("aborted"),
		registry: z.enum(["pypi", "npm"]),
		packageName: z.string(),
	}),
]);

export type ClaimCommandResult = z.output<typeof claimCommandResultSchema>;

export const claimCommandErrorSchema = z.object({
	registry: z.enum(["pypi", "npm"]),
	packageName: z.string(),
	lookupName: z.string().optional(),
	reason: z.string().optional(),
	missingFlag: z.string().optional(),
	howToSupply: z.string().optional(),
});

export type ClaimCommandError = z.output<typeof claimCommandErrorSchema>;

export type ClaimRegistry = "pypi" | "npm";
export type ClaimRegistryLabel = "PyPI" | "npm";

export interface ClaimDryRunData {
	registryLabel: ClaimRegistryLabel;
	packageName: string;
	lookupName?: string;
	version: string;
	description: string;
	extraLines: readonly string[];
	files: readonly ClaimProjectFile[];
	dryRunCommands: readonly string[];
	url: string;
}

export interface ClaimViewData {
	noun: "project" | "package";
	url: string;
}

export { runNpmClaimCommand } from "./claim-npm-command.ts";
export { runPypiClaimCommand } from "./claim-pypi-command.ts";
