#!/usr/bin/env node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";

import { ClinkrGroup, resolveIo as resolveClinkrIo } from "@asdl/clinkr";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";
import { z } from "zod";

import {
	moduleNameFromPackage,
	writeClaimProjectFiles,
	writeNpmClaimProjectFiles,
	type ClaimProjectSpec,
	type NpmClaimProjectSpec,
} from "./claim.ts";
import { checkPackageName, registrySelection } from "./check.ts";
import { REGISTRIES, type CheckStatus, type Registry, type RegistryCheckResult } from "./models.ts";
import { reportExitCode, renderHuman, renderJson } from "./output.ts";
import {
	RealNpmPublishGateway,
	RealPypiPublishGateway,
	type NpmPublishGateway,
	type PypiPublishGateway,
} from "./publish-gateways.ts";
import { RealPackageRegistryGateway, type PackageRegistryGateway } from "./registry-gateways.ts";
import { npmPackagePageUrl, pypiProjectUrl } from "./urls.ts";
import { normalizePypiName, npmValidationError, pypiValidationError } from "./validation.ts";

export const VERSION = "0.1.0";

const REGISTRY_USAGE = REGISTRIES.join("|");
const DEFAULT_CLAIM_VERSION = "0.0.1";
const DEFAULT_CLAIM_DESCRIPTION = "Claimed package name";
const DEFAULT_NPM_CLAIM_LICENSE = "MIT";

const checkRequestSchema = z.object({
	name: z.string().describe("Package name to check."),
	registry: z.array(z.string()).optional().describe("Registry to check; may be repeated."),
	json: z.boolean().optional().describe("Emit JSON output."),
});

const claimRequestSchema = z.object({
	name: z.string().describe("Package name to claim."),
	description: z
		.string()
		.optional()
		.describe("Package description. Defaults to a generic claim description."),
	version: z.string().default(DEFAULT_CLAIM_VERSION).describe("Version to publish."),
	dry_run: z.boolean().optional().describe("Show planned operations without effects."),
	force: z.boolean().optional().describe("Skip confirmation prompt."),
	skip_check: z.boolean().optional().describe("Skip registry availability pre-check."),
});

type CheckRequest = z.output<typeof checkRequestSchema>;
type ClaimRequest = z.output<typeof claimRequestSchema>;

export interface CliDeps {
	registryGateway?: PackageRegistryGateway;
	pypiPublishGateway?: PypiPublishGateway;
	npmPublishGateway?: NpmPublishGateway;
	stdout?: (text: string) => void;
	stderr?: (text: string) => void;
	stdin?: () => Promise<string>;
}

interface Io {
	stdout(text: string): void;
	stderr(text: string): void;
	stdin(): Promise<string>;
}

interface PackagechkCliContext {
	registryGateway: PackageRegistryGateway;
	pypiPublishGateway: PypiPublishGateway;
	npmPublishGateway: NpmPublishGateway;
	io: Io;
}

interface PreparedClaim<TSpec> {
	spec: TSpec;
	lookupName: string;
}

interface ClaimPolicy<TSpec> {
	registry: "pypi" | "npm";
	label: "PyPI" | "npm";
	tempDirPrefix: string;
	validate: (name: string) => string | null;
	prepare: (input: {
		name: string;
		description: string | undefined;
		claimVersion: string;
	}) => PreparedClaim<TSpec>;
	precheck: (name: string) => Promise<RegistryCheckResult>;
	ensurePublishToolsAvailable: () => string | null;
	renderDryRun: (input: { spec: TSpec; lookupName: string; skipCheck: boolean; io: Io }) => void;
	materializeAndPublish: (input: { projectDir: string; spec: TSpec; io: Io }) => number | null;
	viewLine: (input: { name: string; lookupName: string; spec: TSpec }) => string;
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
	const io: Io = {
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
	io: Io;
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

async function runClaimCommand<TSpec>(options: {
	request: ClaimRequest;
	policy: ClaimPolicy<TSpec>;
	io: Io;
}): Promise<number> {
	const { request, policy, io } = options;
	const validationError = policy.validate(request.name);
	if (validationError !== null) {
		io.stderr(`${policy.registry}: invalid: ${validationError}\n`);
		return 2;
	}
	const prepared = policy.prepare({
		name: request.name,
		description: request.description,
		claimVersion: request.version,
	});
	if (request.dry_run === true) {
		policy.renderDryRun({
			spec: prepared.spec,
			lookupName: prepared.lookupName,
			skipCheck: request.skip_check === true,
			io,
		});
		return 0;
	}
	if (prepared.lookupName !== request.name) {
		io.stderr(`${policy.label} lookup name: ${prepared.lookupName}\n`);
	}
	if (request.skip_check !== true) {
		const checkResult = await policy.precheck(request.name);
		const exitCode = precheckExitCode(
			policy.registry,
			checkResult.status,
			checkResult.message,
			checkResult.packageUrl,
			io,
		);
		if (exitCode !== null) return exitCode;
	}
	const toolsError = policy.ensurePublishToolsAvailable();
	if (toolsError !== null) {
		io.stderr(`${toolsError}\n`);
		return 2;
	}
	if (
		!(request.force === true) &&
		!(await confirmRealPublish(policy.label, request.name, request.version, io))
	) {
		return 1;
	}
	const projectDir = mkdtempSync(join(tmpdir(), policy.tempDirPrefix));
	try {
		const publishExitCode = policy.materializeAndPublish({
			projectDir,
			spec: prepared.spec,
			io,
		});
		if (publishExitCode !== null) return publishExitCode;
	} finally {
		rmSync(projectDir, { recursive: true, force: true });
	}
	io.stderr(`✓ Claimed ${policy.label} package name '${request.name}'.\n`);
	io.stderr(
		`${policy.viewLine({ name: request.name, lookupName: prepared.lookupName, spec: prepared.spec })}\n`,
	);
	return 0;
}

function buildPypiClaimPolicy(ctx: PackagechkCliContext): ClaimPolicy<ClaimProjectSpec> {
	return {
		registry: "pypi",
		label: "PyPI",
		tempDirPrefix: "packagechk-claim-pypi-",
		validate: pypiValidationError,
		prepare: (input) => {
			const lookupName = normalizePypiName(input.name);
			return {
				lookupName,
				spec: {
					packageName: input.name,
					moduleName: moduleNameFromPackage(lookupName),
					description: input.description ?? DEFAULT_CLAIM_DESCRIPTION,
					version: input.claimVersion,
				},
			};
		},
		precheck: (name) => ctx.registryGateway.checkPypi(name),
		ensurePublishToolsAvailable: () => ctx.pypiPublishGateway.ensurePublishToolsAvailable(),
		renderDryRun: renderClaimPypiDryRun,
		materializeAndPublish: (input) => {
			writeClaimProjectFiles(input.projectDir, input.spec);
			input.io.stderr("Building placeholder package with uv build...\n");
			const buildResult = ctx.pypiPublishGateway.buildPackage(input.projectDir);
			if ("error" in buildResult) {
				input.io.stderr(`${buildResult.error}\n`);
				return 2;
			}
			const { artifacts } = buildResult;
			if (artifacts.length === 0) {
				input.io.stderr("No distribution artifacts were built.\n");
				return 2;
			}
			input.io.stderr("Publishing placeholder package with uvx uv-publish...\n");
			const publishError = ctx.pypiPublishGateway.publishArtifacts(input.projectDir, artifacts);
			if (publishError !== null) {
				input.io.stderr(`${publishError}\n`);
				return 2;
			}
			return null;
		},
		viewLine: (input) => `View project: ${pypiProjectUrl(input.lookupName)}`,
	};
}

function buildNpmClaimPolicy(ctx: PackagechkCliContext): ClaimPolicy<NpmClaimProjectSpec> {
	return {
		registry: "npm",
		label: "npm",
		tempDirPrefix: "packagechk-claim-npm-",
		validate: npmValidationError,
		prepare: (input) => ({
			lookupName: input.name,
			spec: {
				packageName: input.name,
				description: input.description ?? DEFAULT_CLAIM_DESCRIPTION,
				version: input.claimVersion,
				license: DEFAULT_NPM_CLAIM_LICENSE,
			},
		}),
		precheck: (name) => ctx.registryGateway.checkNpm(name),
		ensurePublishToolsAvailable: () => ctx.npmPublishGateway.ensurePublishToolsAvailable(),
		renderDryRun: renderClaimNpmDryRun,
		materializeAndPublish: (input) => {
			writeNpmClaimProjectFiles(input.projectDir, input.spec);
			input.io.stderr("Publishing placeholder package with npm publish...\n");
			const publishError = ctx.npmPublishGateway.publishProject(input.projectDir);
			if (publishError !== null) {
				input.io.stderr(`${publishError}\n`);
				return 2;
			}
			return null;
		},
		viewLine: (input) => `View package: ${npmPackagePageUrl(input.name)}`,
	};
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

function precheckExitCode(
	registry: Registry,
	status: CheckStatus,
	message: string,
	packageUrl: string | undefined,
	io: Io,
): number | null {
	if (status === "taken") {
		io.stderr(`${registry}: taken: ${message}\n`);
		if (packageUrl !== undefined) io.stderr(`${packageUrl}\n`);
		return 1;
	}
	if (status !== "available") {
		io.stderr(`${registry}: ${status}: ${message}\n`);
		return 2;
	}
	return null;
}

function renderClaimPypiDryRun(options: {
	spec: ClaimProjectSpec;
	lookupName: string;
	skipCheck: boolean;
	io: Io;
}): void {
	const { spec, io } = options;
	io.stderr(`[DRY RUN] Would claim PyPI package name '${spec.packageName}'.\n`);
	io.stderr(`Package name: ${spec.packageName}\n`);
	if (options.lookupName !== spec.packageName) {
		io.stderr(`PyPI lookup name: ${options.lookupName}\n`);
	}
	io.stderr(`Version: ${spec.version}\n`);
	io.stderr(`Description: ${spec.description}\n`);
	io.stderr(`Module name: ${spec.moduleName}\n`);
	io.stderr(
		options.skipCheck
			? "Availability check: skipped (--skip-check)\n"
			: "Availability check: would check PyPI before publishing\n",
	);
	io.stderr("Would create a temporary placeholder project directory\n");
	io.stderr("Would write: pyproject.toml\n");
	io.stderr(`Would write: src/${spec.moduleName}/__init__.py\n`);
	io.stderr("Would run: uv build\n");
	io.stderr("Would run: uvx uv-publish <artifacts>\n");
	io.stderr(`PyPI URL: ${pypiProjectUrl(options.lookupName)}\n`);
}

function renderClaimNpmDryRun(options: {
	spec: NpmClaimProjectSpec;
	lookupName: string;
	skipCheck: boolean;
	io: Io;
}): void {
	const { spec, io } = options;
	io.stderr(`[DRY RUN] Would claim npm package name '${spec.packageName}'.\n`);
	io.stderr(`Package name: ${spec.packageName}\n`);
	io.stderr(`Version: ${spec.version}\n`);
	io.stderr(`Description: ${spec.description}\n`);
	io.stderr(`License: ${spec.license}\n`);
	io.stderr(
		options.skipCheck
			? "Availability check: skipped (--skip-check)\n"
			: "Availability check: would check npm before publishing\n",
	);
	io.stderr("Would create a temporary placeholder project directory\n");
	io.stderr("Would write: package.json\n");
	io.stderr("Would write: README.md\n");
	io.stderr("Would write: index.js\n");
	io.stderr("Would run: npm publish --access=public\n");
	io.stderr(`npm URL: ${npmPackagePageUrl(spec.packageName)}\n`);
}

async function confirmRealPublish(
	registryLabel: string,
	packageName: string,
	version: string,
	io: Io,
): Promise<boolean> {
	io.stderr(`Warning: this will publish a real package to ${registryLabel}.\n`);
	io.stderr(`Package: ${packageName} (${version})\n`);
	io.stderr("Continue? [y/N]: ");
	const input = (await io.stdin()).trim().toLowerCase();
	if (input === "y" || input === "yes") return true;
	io.stderr("Aborted by user.\n");
	return false;
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
