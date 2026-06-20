#!/usr/bin/env node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";

import { isDirectCliInvocation } from "@asdl/core/cli-entry";
import { Command, CommanderError, InvalidArgumentError, Option } from "commander";

import {
	moduleNameFromPackage,
	writeClaimProjectFiles,
	writeNpmClaimProjectFiles,
	type ClaimProjectSpec,
	type NpmClaimProjectSpec,
} from "./claim.ts";
import { checkPackageName, registrySelection } from "./check.ts";
import {
	RealNpmPublishGateway,
	RealPypiPublishGateway,
	type NpmPublishGateway,
	type PypiPublishGateway,
} from "./publish-gateways.ts";
import { RealPackageRegistryGateway, type PackageRegistryGateway } from "./registry-gateways.ts";
import { reportExitCode, renderHuman, renderJson } from "./output.ts";
import type { CheckStatus, Registry } from "./models.ts";
import { npmPackagePageUrl, pypiProjectUrl } from "./urls.ts";
import { normalizePypiName, npmValidationError, pypiValidationError } from "./validation.ts";

export const VERSION = "0.1.0";

const REGISTRY_CHOICES: readonly Registry[] = ["pypi", "npm", "brew"];
const DEFAULT_CLAIM_VERSION = "0.0.1";
const DEFAULT_CLAIM_DESCRIPTION = "Claimed package name";
const DEFAULT_NPM_CLAIM_LICENSE = "MIT";

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

interface RunState {
	exitCode: number;
}

interface CreatedCli {
	cli: Command;
	state: RunState;
}

export function buildCli(deps: CliDeps = {}): Command {
	return createCli(deps).cli;
}

function createCli(deps: CliDeps = {}): CreatedCli {
	const io = resolveIo(deps);
	const state: RunState = { exitCode: 0 };
	const registryGateway = deps.registryGateway ?? new RealPackageRegistryGateway();
	const pypiPublishGateway = deps.pypiPublishGateway ?? new RealPypiPublishGateway();
	const npmPublishGateway = deps.npmPublishGateway ?? new RealNpmPublishGateway();

	const cli = createCommand("packagechk", io)
		.description(
			"Check whether a package name is available to claim.\n\nDefault check path: packagechk NAME [--registry pypi|npm|brew] [--json].",
		)
		.version(VERSION, "--version", "Show the version and exit.")
		.addOption(new Option("--runtime", "Show CLI runtime diagnostics and exit."))
		.argument("[name]")
		.addOption(
			new Option(
				"--registry <registry>",
				"Registry to check (pypi|npm|brew). May be repeated. Defaults to PyPI, npm, and Homebrew.",
			).argParser(accumulateRegistry),
		)
		.option("--json", "Emit JSON output.")
		.action(
			async (
				name: string | undefined,
				options: { registry?: Registry[]; json?: boolean; runtime?: boolean },
			) => {
				if (options.runtime === true) {
					io.stdout(runtimeInfo());
					state.exitCode = 0;
					return;
				}
				if (name === undefined) {
					io.stderr(
						"Usage: packagechk [OPTIONS] COMMAND [ARGS]...\nTry 'packagechk -h' for help.\n\nError: Missing command.\n",
					);
					state.exitCode = 2;
					return;
				}
				state.exitCode = await runCheckCommand({
					name,
					registryOptions: options.registry ?? [],
					jsonOutput: options.json === true,
					registryGateway,
					io,
				});
			},
		);

	cli.addCommand(
		buildClaimPypiCommand({ io, state, registryGateway, publishGateway: pypiPublishGateway }),
	);
	cli.addCommand(
		buildClaimNpmCommand({ io, state, registryGateway, publishGateway: npmPublishGateway }),
	);
	return { cli, state };
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const { cli, state } = createCli(deps);
	try {
		await cli.parseAsync([...args], { from: "user" });
		return state.exitCode;
	} catch (error) {
		if (error instanceof CommanderError) {
			return error.code === "commander.helpDisplayed" || error.code === "commander.version" ? 0 : 2;
		}
		throw error;
	}
}

function buildClaimPypiCommand(options: {
	io: Io;
	state: RunState;
	registryGateway: PackageRegistryGateway;
	publishGateway: PypiPublishGateway;
}): Command {
	return addClaimOptions(
		createCommand("claim-pypi", options.io)
			.description("Claim a PyPI package name by publishing a minimal placeholder package.")
			.argument("<name>"),
		"PyPI",
	).action(async (name: string, raw: ClaimOptions) => {
		options.state.exitCode = await runClaimPypiCommand({
			name,
			description: raw.description,
			claimVersion: raw.version ?? DEFAULT_CLAIM_VERSION,
			dryRun: raw.dryRun === true,
			force: raw.force === true,
			skipCheck: raw.skipCheck === true,
			registryGateway: options.registryGateway,
			publishGateway: options.publishGateway,
			io: options.io,
		});
	});
}

function buildClaimNpmCommand(options: {
	io: Io;
	state: RunState;
	registryGateway: PackageRegistryGateway;
	publishGateway: NpmPublishGateway;
}): Command {
	return addClaimOptions(
		createCommand("claim-npm", options.io)
			.description(
				"Claim an npm package name by publishing a minimal placeholder package. Requires `~/.npmrc` with a `_authToken` line (granular token with publish + bypass-2FA scopes) or equivalent auth picked up by `npm publish`.",
			)
			.argument("<name>"),
		"npm",
	).action(async (name: string, raw: ClaimOptions) => {
		options.state.exitCode = await runClaimNpmCommand({
			name,
			description: raw.description,
			claimVersion: raw.version ?? DEFAULT_CLAIM_VERSION,
			dryRun: raw.dryRun === true,
			force: raw.force === true,
			skipCheck: raw.skipCheck === true,
			registryGateway: options.registryGateway,
			publishGateway: options.publishGateway,
			io: options.io,
		});
	});
}

interface ClaimOptions {
	description?: string;
	version?: string;
	dryRun?: boolean;
	force?: boolean;
	skipCheck?: boolean;
}

function addClaimOptions(command: Command, registryLabel: "PyPI" | "npm"): Command {
	return command
		.option(
			"--description <description>",
			"Package description. Defaults to a generic claim description.",
		)
		.option("--version <claim_version>", "Version to publish.", DEFAULT_CLAIM_VERSION)
		.option("--dry-run", "Show planned operations without effects.")
		.option("--force", "Skip confirmation prompt.")
		.option("--skip-check", `Skip ${registryLabel} availability pre-check.`);
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

async function runClaimPypiCommand(options: {
	name: string;
	description: string | undefined;
	claimVersion: string;
	dryRun: boolean;
	force: boolean;
	skipCheck: boolean;
	registryGateway: PackageRegistryGateway;
	publishGateway: PypiPublishGateway;
	io: Io;
}): Promise<number> {
	const validationError = pypiValidationError(options.name);
	if (validationError !== null) {
		options.io.stderr(`pypi: invalid: ${validationError}\n`);
		return 2;
	}
	const lookupName = normalizePypiName(options.name);
	const spec: ClaimProjectSpec = {
		packageName: options.name,
		moduleName: moduleNameFromPackage(lookupName),
		description: options.description ?? DEFAULT_CLAIM_DESCRIPTION,
		version: options.claimVersion,
	};
	if (options.dryRun) {
		renderClaimPypiDryRun({ spec, lookupName, skipCheck: options.skipCheck, io: options.io });
		return 0;
	}
	if (lookupName !== options.name) options.io.stderr(`PyPI lookup name: ${lookupName}\n`);
	if (!options.skipCheck) {
		const checkResult = await options.registryGateway.checkPypi(options.name);
		const exitCode = precheckExitCode(
			"pypi",
			checkResult.status,
			checkResult.message,
			checkResult.packageUrl,
			options.io,
		);
		if (exitCode !== null) return exitCode;
	}
	const toolsError = options.publishGateway.ensurePublishToolsAvailable();
	if (toolsError !== null) {
		options.io.stderr(`${toolsError}\n`);
		return 2;
	}
	if (
		!options.force &&
		!(await confirmRealPublish("PyPI", options.name, options.claimVersion, options.io))
	)
		return 1;
	const projectDir = mkdtempSync(join(tmpdir(), "packagechk-claim-pypi-"));
	try {
		writeClaimProjectFiles(projectDir, spec);
		options.io.stderr("Building placeholder package with uv build...\n");
		const buildResult = options.publishGateway.buildPackage(projectDir);
		if ("error" in buildResult) {
			options.io.stderr(`${buildResult.error}\n`);
			return 2;
		}
		const { artifacts } = buildResult;
		if (artifacts.length === 0) {
			options.io.stderr("No distribution artifacts were built.\n");
			return 2;
		}
		options.io.stderr("Publishing placeholder package with uvx uv-publish...\n");
		const publishError = options.publishGateway.publishArtifacts(projectDir, artifacts);
		if (publishError !== null) {
			options.io.stderr(`${publishError}\n`);
			return 2;
		}
	} finally {
		rmSync(projectDir, { recursive: true, force: true });
	}
	options.io.stderr(`✓ Claimed PyPI package name '${options.name}'.\n`);
	options.io.stderr(`View project: ${pypiProjectUrl(lookupName)}\n`);
	return 0;
}

async function runClaimNpmCommand(options: {
	name: string;
	description: string | undefined;
	claimVersion: string;
	dryRun: boolean;
	force: boolean;
	skipCheck: boolean;
	registryGateway: PackageRegistryGateway;
	publishGateway: NpmPublishGateway;
	io: Io;
}): Promise<number> {
	const validationError = npmValidationError(options.name);
	if (validationError !== null) {
		options.io.stderr(`npm: invalid: ${validationError}\n`);
		return 2;
	}
	const spec: NpmClaimProjectSpec = {
		packageName: options.name,
		description: options.description ?? DEFAULT_CLAIM_DESCRIPTION,
		version: options.claimVersion,
		license: DEFAULT_NPM_CLAIM_LICENSE,
	};
	if (options.dryRun) {
		renderClaimNpmDryRun({ spec, skipCheck: options.skipCheck, io: options.io });
		return 0;
	}
	if (!options.skipCheck) {
		const checkResult = await options.registryGateway.checkNpm(options.name);
		const exitCode = precheckExitCode(
			"npm",
			checkResult.status,
			checkResult.message,
			checkResult.packageUrl,
			options.io,
		);
		if (exitCode !== null) return exitCode;
	}
	const toolsError = options.publishGateway.ensurePublishToolsAvailable();
	if (toolsError !== null) {
		options.io.stderr(`${toolsError}\n`);
		return 2;
	}
	if (
		!options.force &&
		!(await confirmRealPublish("npm", options.name, options.claimVersion, options.io))
	)
		return 1;
	const projectDir = mkdtempSync(join(tmpdir(), "packagechk-claim-npm-"));
	try {
		writeNpmClaimProjectFiles(projectDir, spec);
		options.io.stderr("Publishing placeholder package with npm publish...\n");
		const publishError = options.publishGateway.publishProject(projectDir);
		if (publishError !== null) {
			options.io.stderr(`${publishError}\n`);
			return 2;
		}
	} finally {
		rmSync(projectDir, { recursive: true, force: true });
	}
	options.io.stderr(`✓ Claimed npm package name '${options.name}'.\n`);
	options.io.stderr(`View package: ${npmPackagePageUrl(options.name)}\n`);
	return 0;
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
	if (options.lookupName !== spec.packageName)
		io.stderr(`PyPI lookup name: ${options.lookupName}\n`);
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

function resolveIo(deps: CliDeps): Io {
	return {
		stdout: deps.stdout ?? ((text) => process.stdout.write(text)),
		stderr: deps.stderr ?? ((text) => process.stderr.write(text)),
		stdin: deps.stdin ?? readProcessStdin,
	};
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

function createCommand(name: string, io: Io): Command {
	const command = new Command(name);
	command.exitOverride();
	command.addHelpCommand(false);
	command.configureOutput({
		writeOut: (text) => {
			io.stdout(text);
		},
		writeErr: (text) => {
			io.stderr(text);
		},
	});
	return command;
}

function accumulateRegistry(value: string, previous: Registry[] | undefined): Registry[] {
	if (!isRegistry(value)) throw new InvalidArgumentError("expected one of pypi, npm, brew");
	return [...(previous ?? []), value];
}

function isRegistry(value: string): value is Registry {
	return REGISTRY_CHOICES.includes(value as Registry);
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/packagechk bin packagechk -> ts/packages/packagechk/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	process.exitCode = await runCli(process.argv.slice(2));
}
