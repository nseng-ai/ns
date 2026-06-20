#!/usr/bin/env node

import process from "node:process";
import { createInterface } from "node:readline";

import { ClinkrGroup, resolveIo as resolveClinkrIo } from "@asdl/clinkr";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";
import { z } from "zod";

import {
	buildNpmClaimPolicy,
	buildPypiClaimPolicy,
	claimRequestSchema,
	runClaimCommand,
	type ClaimCommandIo,
} from "./claim-command.ts";
import { checkPackageName, registrySelection } from "./check.ts";
import { REGISTRIES, reportExitCode, type Registry } from "./models.ts";
import { renderHuman, renderJson } from "./output.ts";
import {
	RealNpmPublishGateway,
	RealPypiPublishGateway,
	type NpmPublishGateway,
	type PypiPublishGateway,
} from "./publish-gateways.ts";
import { RealPackageRegistryGateway, type PackageRegistryGateway } from "./registry-gateways.ts";

export const VERSION = "0.1.0";

const REGISTRY_USAGE = REGISTRIES.join("|");

const checkRequestSchema = z.object({
	name: z.string().describe("Package name to check."),
	registry: z.array(z.string()).optional().describe("Registry to check; may be repeated."),
	json: z.boolean().optional().describe("Emit JSON output."),
});

type CheckRequest = z.output<typeof checkRequestSchema>;

export interface CliDeps {
	registryGateway?: PackageRegistryGateway;
	pypiPublishGateway?: PypiPublishGateway;
	npmPublishGateway?: NpmPublishGateway;
	stdout?: (text: string) => void;
	stderr?: (text: string) => void;
	stdin?: () => Promise<string>;
}

interface PackagechkCliContext {
	registryGateway: PackageRegistryGateway;
	pypiPublishGateway: PypiPublishGateway;
	npmPublishGateway: NpmPublishGateway;
	io: ClaimCommandIo;
}

export function buildCli(): ClinkrGroup<PackagechkCliContext> {
	const root = new ClinkrGroup<PackagechkCliContext>({
		name: "packagechk",
		description: `Check whether a package name is available to claim.\n\nDefault check path: packagechk NAME [--registry ${REGISTRY_USAGE}] [--json].`,
		version: VERSION,
		runtimeInfo,
	});

	root.defaultCommand({
		schema: checkRequestSchema,
		positionals: { name: { position: 0 } },
		isRawExit: true,
		run: runCheck,
	});

	root.command({
		name: "claim-pypi",
		description: "Claim a PyPI package name by publishing a minimal placeholder package.",
		schema: claimRequestSchema,
		positionals: { name: { position: 0 } },
		isRawExit: true,
		run: async (ctx, request) =>
			runClaimCommand({
				request,
				policy: buildPypiClaimPolicy(ctx),
				io: ctx.io,
			}),
	});

	root.command({
		name: "claim-npm",
		description:
			"Claim an npm package name by publishing a minimal placeholder package. Requires `~/.npmrc` with a `_authToken` line (granular token with publish + bypass-2FA scopes) or equivalent auth picked up by `npm publish`.",
		schema: claimRequestSchema,
		positionals: { name: { position: 0 } },
		isRawExit: true,
		run: async (ctx, request) =>
			runClaimCommand({
				request,
				policy: buildNpmClaimPolicy(ctx),
				io: ctx.io,
			}),
	});

	return root;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const clinkrIo = resolveClinkrIo({ stdout: deps.stdout, stderr: deps.stderr });
	const io: ClaimCommandIo = {
		stdout: clinkrIo.stdout,
		stderr: clinkrIo.stderr,
		stdin: deps.stdin ?? readProcessStdin,
	};
	const context: PackagechkCliContext = {
		registryGateway: deps.registryGateway ?? new RealPackageRegistryGateway(),
		pypiPublishGateway: deps.pypiPublishGateway ?? new RealPypiPublishGateway(),
		npmPublishGateway: deps.npmPublishGateway ?? new RealNpmPublishGateway(),
		io,
	};
	return await buildCli().run(args, { context, io: clinkrIo });
}

async function runCheck(ctx: PackagechkCliContext, request: CheckRequest): Promise<number> {
	const selectedRegistries = parseRegistryOptions(request.registry ?? []);
	if (typeof selectedRegistries === "string") {
		ctx.io.stderr(`${selectedRegistries}\n`);
		return 2;
	}
	return await runCheckCommand({
		name: request.name,
		registryOptions: selectedRegistries,
		jsonOutput: request.json === true,
		registryGateway: ctx.registryGateway,
		io: ctx.io,
	});
}

async function runCheckCommand(options: {
	name: string;
	registryOptions: readonly Registry[];
	jsonOutput: boolean;
	registryGateway: PackageRegistryGateway;
	io: ClaimCommandIo;
}): Promise<number> {
	const report = await checkPackageName({
		packageName: options.name,
		registries: registrySelection(options.registryOptions),
		registryGateway: options.registryGateway,
	});
	const exitCode = reportExitCode(report);
	if (options.jsonOutput) {
		options.io.stdout(`${renderJson(report)}\n`);
	} else if (exitCode === 2) {
		options.io.stderr(`${renderHuman(report)}\n`);
	} else {
		options.io.stdout(`${renderHuman(report)}\n`);
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

async function readProcessStdin(): Promise<string> {
	const readline = createInterface({ input: process.stdin, crlfDelay: Infinity });
	try {
		const iterator = readline[Symbol.asyncIterator]();
		const result = await iterator.next();
		return result.done === true ? "" : result.value;
	} finally {
		readline.close();
	}
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/packagechk bin packagechk -> ts/packages/packagechk/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}
