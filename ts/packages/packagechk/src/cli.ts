#!/usr/bin/env node

import { ClinkrGroup, resolveClinkrInteraction, type ClinkrInteraction } from "@sdl/clinkr";
import { rawCommand } from "@sdl/clinkr/raw";
import { defineCli } from "@sdl/core/cli-entry";
import { readStdinLine } from "@sdl/core/stdin";
import { z } from "zod";

import {
	buildNpmClaimPolicy,
	buildPypiClaimPolicy,
	claimRequestSchema,
	runClaimCommand,
} from "./claim-command.ts";
import { checkPackageName, registrySelection } from "./check.ts";
import type { PackagechkIo } from "./io.ts";
import { REGISTRIES, reportExitCode, type Registry } from "./models.ts";
import { renderHuman, renderJson } from "./output.ts";
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
				interaction: deps.interaction,
				stdin: deps.stdin ?? readStdinLine,
				stderr: io.stderr,
				isInteractive: () => deps.stdin !== undefined || process.stdin.isTTY === true,
			}),
		};
		return { type: "run", context, buildState: undefined };
	},
	configureCli: ({ root }) => {
		root.defaultCommand({
			schema: checkRequestSchema,
			positionals: { name: { position: 0 } },
			isRawExit: true,
			run: runCheck,
		});

		root.command(
			rawCommand({
				name: "claim-pypi",
				description: "Claim a PyPI package name by publishing a minimal placeholder package.",
				schema: claimRequestSchema,
				positionals: { name: { position: 0 } },
				run: async (ctx, request) =>
					runClaimCommand({
						request,
						policy: buildPypiClaimPolicy(ctx),
						io: ctx.io,
						interaction: ctx.interaction,
					}),
			}),
		);

		root.command(
			rawCommand({
				name: "claim-npm",
				description:
					"Claim an npm package name by publishing a minimal placeholder package. Requires `~/.npmrc` with a `_authToken` line (granular token with publish + bypass-2FA scopes) or equivalent auth picked up by `npm publish`.",
				schema: claimRequestSchema,
				positionals: { name: { position: 0 } },
				run: async (ctx, request) =>
					runClaimCommand({
						request,
						policy: buildNpmClaimPolicy(ctx),
						io: ctx.io,
						interaction: ctx.interaction,
					}),
			}),
		);
	},
});

export const VERSION = entry.version;

const checkRequestSchema = z.object({
	name: z.string().describe("Package name to check."),
	registry: z.array(z.string()).optional().describe("Registry to check; may be repeated."),
	showJson: z.boolean().optional().describe("Emit JSON output."),
});

type CheckRequest = z.output<typeof checkRequestSchema>;

export interface CliDeps {
	registryGateway?: PackageRegistryGateway;
	pypiPublishGateway?: PypiPublishGateway;
	npmPublishGateway?: NpmPublishGateway;
	stdout?: (text: string) => void;
	stderr?: (text: string) => void;
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

export function buildCli(): ClinkrGroup<PackagechkCliContext> {
	return entry.buildCli(undefined);
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

async function runCheck(ctx: PackagechkCliContext, request: CheckRequest): Promise<number> {
	const selectedRegistries = parseRegistryOptions(request.registry ?? []);
	if (typeof selectedRegistries === "string") {
		ctx.io.stderr(`${selectedRegistries}\n`);
		return 2;
	}
	const report = await checkPackageName({
		packageName: request.name,
		registries: registrySelection(selectedRegistries),
		registryGateway: ctx.registryGateway,
	});
	const exitCode = reportExitCode(report);
	if (request.showJson === true) {
		ctx.io.stdout(`${renderJson(report)}\n`);
	} else if (exitCode === 2) {
		ctx.io.stderr(`${renderHuman(report)}\n`);
	} else {
		ctx.io.stdout(`${renderHuman(report)}\n`);
	}
	return exitCode;
}

function parseRegistryOptions(options: readonly string[]): Registry[] | string {
	const registries: Registry[] = [];
	for (const option of options) {
		if (!isRegistry(option)) return `error: --registry: expected one of ${REGISTRIES.join(", ")}`;
		registries.push(option);
	}
	return registries;
}

function isRegistry(value: string): value is Registry {
	return REGISTRIES.includes(value as Registry);
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
