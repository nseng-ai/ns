#!/usr/bin/env node

import {
	ClinkrGroup,
	failure,
	negative,
	ok,
	resolveClinkrInteraction,
	usageError,
	type ClinkrExit,
	type ClinkrInteraction,
} from "@nseng-ai/clinkr";

import { defineCli, readStdinLine, type CliEntrypointDeps } from "@nseng-ai/foundation/cli-runtime";
import { optionalEntries, optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import {
	claimCommandErrorSchema,
	claimCommandResultSchema,
	claimRequestSchema,
	runNpmClaimCommand,
	runPypiClaimCommand,
} from "./claim-command.ts";
import { checkPackageName, registrySelection } from "./check.ts";
import type { PackagechkIo } from "./io.ts";
import {
	REGISTRIES,
	registryCheckMetadataFields,
	reportExitCode,
	type PackageCheckReport,
	type Registry,
	type RegistryCheckResult,
} from "./models.ts";
import { renderHuman } from "./output.ts";
import {
	RealNpmPublishGateway,
	RealPypiPublishGateway,
	type NpmPublishGateway,
	type PypiPublishGateway,
} from "./publish-gateways.ts";
import { RealPackageRegistryGateway, type PackageRegistryGateway } from "./registry-gateways.ts";

const REGISTRY_USAGE = REGISTRIES.join("|");

const entry = defineCli<PackagechkCliContext, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: `Check whether a package name is available to claim.\n\nDefault check path: packagechk NAME [--registry ${REGISTRY_USAGE}] [--show-json].`,
	prepareRun: ({ deps, io }) => {
		const context: PackagechkCliContext = {
			registryGateway: deps.registryGateway ?? new RealPackageRegistryGateway(),
			pypiPublishGateway: deps.pypiPublishGateway ?? new RealPypiPublishGateway(),
			npmPublishGateway: deps.npmPublishGateway ?? new RealNpmPublishGateway(),
			io,
			interaction: resolveClinkrInteraction({
				...optionalEntry("interaction", deps.interaction),
				stdin: deps.stdin ?? readStdinLine,
				stderr: io.stderr,
				...optionalEntry("injectedStdin", deps.stdin),
			}),
		};
		return { type: "run", context, buildState: undefined };
	},
	buildCli: ({ appBuilder, name }) => {
		const root = new ClinkrGroup<PackagechkCliContext>({ name });
		root.defaultCommand({
			schema: checkRequestSchema,
			positionals: { name: { position: 0 } },
			resultSchema: packageCheckReportSchema,
			negativeSchema: packageCheckReportSchema,
			failureSchema: z.object({ report: packageCheckReportSchema }),
			usageErrorSchema: z.union([
				z.object({ flag: z.string(), replacement: z.string() }),
				z.object({ option: z.string(), allowedValues: z.array(registrySchema).readonly() }),
				z.object({ report: packageCheckReportSchema }),
			]),
			handler: runCheck,
			renderHuman: (data) =>
				renderHuman(
					"report" in data
						? data.report
						: "results" in data
							? data
							: { inputName: "", results: [] },
				),
		});

		root.command({
			name: "claim-pypi",
			description: "Claim a PyPI package name by publishing a minimal placeholder package.",
			schema: claimRequestSchema,
			positionals: { name: { position: 0 } },
			options: { yes: { short: "-y" } },
			resultSchema: claimCommandResultSchema,
			negativeSchema: claimCommandResultSchema,
			failureSchema: claimCommandErrorSchema,
			usageErrorSchema: claimCommandErrorSchema,
			renderHuman: renderClaimCommandResult,
			handler: async (ctx, request) =>
				runPypiClaimCommand({
					request,
					registryGateway: ctx.registryGateway,
					pypiPublishGateway: ctx.pypiPublishGateway,
					io: ctx.io,
					interaction: ctx.interaction,
				}),
		});

		root.command({
			name: "claim-npm",
			description:
				"Claim an npm package name by publishing a minimal placeholder package. Requires `~/.npmrc` with a `_authToken` line (granular token with publish + bypass-2FA scopes) or equivalent auth picked up by `npm publish`.",
			schema: claimRequestSchema,
			positionals: { name: { position: 0 } },
			options: { yes: { short: "-y" } },
			resultSchema: claimCommandResultSchema,
			negativeSchema: claimCommandResultSchema,
			failureSchema: claimCommandErrorSchema,
			usageErrorSchema: claimCommandErrorSchema,
			renderHuman: renderClaimCommandResult,
			handler: async (ctx, request) =>
				runNpmClaimCommand({
					request,
					registryGateway: ctx.registryGateway,
					npmPublishGateway: ctx.npmPublishGateway,
					io: ctx.io,
					interaction: ctx.interaction,
				}),
		});
		appBuilder.importLegacyClinkrGroupForMigration(root);
	},
});

export const VERSION = entry.version;

const registrySchema = z.enum(REGISTRIES);

const checkRequestSchema = z.object({
	name: z.string().describe("Package name to check."),
	registry: z.array(z.string()).optional().describe("Registry to check; may be repeated."),
	showJson: z.boolean().optional().describe("Deprecated; use --format json."),
});

const rawRegistryCheckResultSchema = z.object({
	registry: registrySchema,
	inputName: z.string(),
	lookupName: z.string(),
	status: z.enum(["available", "taken", "invalid", "error"]),
	message: z.string(),
	packageUrl: z.string().optional(),
	latestVersion: z.string().optional(),
	description: z.string().optional(),
});

const registryCheckResultSchema: z.ZodType<RegistryCheckResult> =
	rawRegistryCheckResultSchema.transform(normalizeRegistryCheckResult);

type RegistryCheckResultBoundary = z.output<typeof rawRegistryCheckResultSchema>;

function normalizeRegistryCheckResult(result: RegistryCheckResultBoundary): RegistryCheckResult {
	return {
		registry: result.registry,
		inputName: result.inputName,
		lookupName: result.lookupName,
		status: result.status,
		message: result.message,
		...registryCheckMetadataFields(
			optionalEntries({
				packageUrl: result.packageUrl,
				latestVersion: result.latestVersion,
				description: result.description,
			}),
		),
	};
}

const packageCheckReportSchema: z.ZodType<PackageCheckReport> = z.object({
	inputName: z.string(),
	results: z.array(registryCheckResultSchema),
});

type CheckRequest = z.output<typeof checkRequestSchema>;

export interface CliDeps extends Pick<CliEntrypointDeps, "stdout" | "stderr"> {
	registryGateway?: PackageRegistryGateway;
	pypiPublishGateway?: PypiPublishGateway;
	npmPublishGateway?: NpmPublishGateway;
	stdin?: () => Promise<string | null>;
	interaction?: ClinkrInteraction;
}

interface PackagechkCliContext {
	registryGateway: PackageRegistryGateway;
	pypiPublishGateway: PypiPublishGateway;
	npmPublishGateway: NpmPublishGateway;
	io: PackagechkIo;
	interaction: ClinkrInteraction;
}

export async function buildCli() {
	return await entry.buildCli(undefined);
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

async function runCheck(
	ctx: PackagechkCliContext,
	request: CheckRequest,
): Promise<
	ClinkrExit<
		PackageCheckReport,
		PackageCheckReport,
		{ report: PackageCheckReport },
		| { flag: string; replacement: string }
		| { option: string; allowedValues: readonly Registry[] }
		| { report: PackageCheckReport }
	>
> {
	if (request.showJson === true) {
		return usageError("--show-json is deprecated; use --format json.", {
			flag: "showJson",
			replacement: "--format json",
		});
	}
	const selectedRegistries = parseRegistryOptions(request.registry ?? []);
	if (typeof selectedRegistries === "string") {
		return usageError(selectedRegistries, {
			option: "registry",
			allowedValues: REGISTRIES,
		});
	}
	const report = await checkPackageName({
		packageName: request.name,
		registries: registrySelection(selectedRegistries),
		registryGateway: ctx.registryGateway,
	});
	const exitCode = reportExitCode(report);
	const data = packageCheckReportData(report);
	if (exitCode === 0) return ok(data);
	if (exitCode === 1) {
		return negative("One or more package names are already taken.", data);
	}
	if (report.results.some((result) => result.status === "invalid")) {
		return usageError(renderHuman(report), { report: data });
	}
	return failure("registry-check-failed", "One or more registry checks failed.", { report: data });
}

function renderClaimCommandResult(
	result: z.output<typeof claimCommandResultSchema> | z.output<typeof claimCommandErrorSchema>,
): string {
	if (!("type" in result))
		return result.reason ?? `Could not claim ${result.registry} package '${result.packageName}'.`;
	switch (result.type) {
		case "dry-run":
			return `[DRY RUN] Would claim ${result.registry} package name '${result.packageName}'.`;
		case "claimed":
			return `Claimed ${result.registry} package name '${result.packageName}'.`;
		case "taken":
			return `${result.registry}: taken: Package name is already taken.`;
		case "aborted":
			return "Aborted by user.";
	}
}

function packageCheckReportData(report: PackageCheckReport): PackageCheckReport {
	return {
		inputName: report.inputName,
		results: [...report.results],
	};
}

function parseRegistryOptions(options: readonly string[]): Registry[] | string {
	const registries: Registry[] = [];
	for (const option of options) {
		if (!isRegistry(option)) return `--registry: expected one of ${REGISTRIES.join(", ")}`;
		registries.push(option);
	}
	return registries;
}

function isRegistry(value: string): value is Registry {
	return REGISTRIES.includes(value as Registry);
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
