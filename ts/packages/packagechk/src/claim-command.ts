import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import {
	buildClaimProjectFiles,
	buildNpmClaimProjectFiles,
	moduleNameFromPackage,
	writeClaimFiles,
	type ClaimProjectFile,
	type ClaimProjectSpec,
	type NpmClaimProjectSpec,
} from "./claim.ts";
import { type CheckStatus, type RegistryCheckResult } from "./models.ts";
import { type NpmPublishGateway, type PypiPublishGateway } from "./publish-gateways.ts";
import { type PackageRegistryGateway } from "./registry-gateways.ts";
import { npmPackagePageUrl, pypiProjectUrl } from "./urls.ts";
import { normalizePypiName, npmValidationError, pypiValidationError } from "./validation.ts";

const DEFAULT_CLAIM_VERSION = "0.0.1";
const DEFAULT_CLAIM_DESCRIPTION = "Claimed package name";
const DEFAULT_NPM_CLAIM_LICENSE = "MIT";

export const claimRequestSchema = z.object({
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

type ClaimRequest = z.output<typeof claimRequestSchema>;

type ClaimRegistry = "pypi" | "npm";
type ClaimRegistryLabel = "PyPI" | "npm";
type ClaimCommandKind = "pypi-build" | "pypi-publish-artifacts" | "npm-publish";

export interface ClaimCommandIo {
	stdout(text: string): void;
	stderr(text: string): void;
	stdin(): Promise<string>;
}

interface PreparedClaim<TSpec> {
	spec: TSpec;
	lookupName: string;
}

interface ClaimCommandDescriptor {
	kind: ClaimCommandKind;
	dryRunCommand: string;
	statusLine: string;
}

interface ClaimOperationPlan<TSpec> {
	spec: TSpec;
	files: readonly ClaimProjectFile[];
	commands: readonly ClaimCommandDescriptor[];
}

interface ClaimPolicy<TSpec> {
	registry: ClaimRegistry;
	label: ClaimRegistryLabel;
	tempDirPrefix: string;
	validate: (name: string) => string | null;
	prepare: (input: {
		name: string;
		description: string | undefined;
		claimVersion: string;
	}) => PreparedClaim<TSpec>;
	precheck: (name: string) => Promise<RegistryCheckResult>;
	ensurePublishToolsAvailable: () => string | null;
	buildPlan: (spec: TSpec) => ClaimOperationPlan<TSpec>;
	renderDryRun: (input: {
		plan: ClaimOperationPlan<TSpec>;
		lookupName: string;
		skipCheck: boolean;
		io: ClaimCommandIo;
	}) => void;
	executeCommands: (input: {
		projectDir: string;
		plan: ClaimOperationPlan<TSpec>;
		io: ClaimCommandIo;
	}) => number | null;
	viewLine: (input: { name: string; lookupName: string; spec: TSpec }) => string;
}

const PYPI_CLAIM_COMMANDS: readonly ClaimCommandDescriptor[] = [
	{
		kind: "pypi-build",
		dryRunCommand: "uv build",
		statusLine: "Building placeholder package with uv build...",
	},
	{
		kind: "pypi-publish-artifacts",
		dryRunCommand: "uvx uv-publish <artifacts>",
		statusLine: "Publishing placeholder package with uvx uv-publish...",
	},
];

const NPM_CLAIM_COMMANDS: readonly ClaimCommandDescriptor[] = [
	{
		kind: "npm-publish",
		dryRunCommand: "npm publish --access=public",
		statusLine: "Publishing placeholder package with npm publish...",
	},
];

export async function runClaimCommand<TSpec>(options: {
	request: ClaimRequest;
	policy: ClaimPolicy<TSpec>;
	io: ClaimCommandIo;
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
	const plan = policy.buildPlan(prepared.spec);
	if (request.dry_run === true) {
		policy.renderDryRun({
			plan,
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
		const publishExitCode = executeClaimOperation({ projectDir, plan, policy, io });
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

export function buildPypiClaimPolicy(ctx: {
	registryGateway: PackageRegistryGateway;
	pypiPublishGateway: PypiPublishGateway;
}): ClaimPolicy<ClaimProjectSpec> {
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
		buildPlan: buildPypiClaimOperationPlan,
		renderDryRun: renderClaimPypiDryRun,
		executeCommands: (input) =>
			executePypiClaimCommands({ ...input, gateway: ctx.pypiPublishGateway }),
		viewLine: (input) => `View project: ${pypiProjectUrl(input.lookupName)}`,
	};
}

export function buildNpmClaimPolicy(ctx: {
	registryGateway: PackageRegistryGateway;
	npmPublishGateway: NpmPublishGateway;
}): ClaimPolicy<NpmClaimProjectSpec> {
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
		buildPlan: buildNpmClaimOperationPlan,
		renderDryRun: renderClaimNpmDryRun,
		executeCommands: (input) =>
			executeNpmClaimCommands({ ...input, gateway: ctx.npmPublishGateway }),
		viewLine: (input) => `View package: ${npmPackagePageUrl(input.name)}`,
	};
}

function buildPypiClaimOperationPlan(spec: ClaimProjectSpec): ClaimOperationPlan<ClaimProjectSpec> {
	return {
		spec,
		files: buildClaimProjectFiles(spec),
		commands: PYPI_CLAIM_COMMANDS,
	};
}

function buildNpmClaimOperationPlan(
	spec: NpmClaimProjectSpec,
): ClaimOperationPlan<NpmClaimProjectSpec> {
	return {
		spec,
		files: buildNpmClaimProjectFiles(spec),
		commands: NPM_CLAIM_COMMANDS,
	};
}

function executeClaimOperation<TSpec>(options: {
	projectDir: string;
	plan: ClaimOperationPlan<TSpec>;
	policy: ClaimPolicy<TSpec>;
	io: ClaimCommandIo;
}): number | null {
	writeClaimFiles(options.projectDir, options.plan.files);
	return options.policy.executeCommands({
		projectDir: options.projectDir,
		plan: options.plan,
		io: options.io,
	});
}

function executePypiClaimCommands(options: {
	projectDir: string;
	plan: ClaimOperationPlan<ClaimProjectSpec>;
	gateway: PypiPublishGateway;
	io: ClaimCommandIo;
}): number | null {
	let artifacts: readonly string[] | null = null;
	for (const command of options.plan.commands) {
		switch (command.kind) {
			case "pypi-build": {
				options.io.stderr(`${command.statusLine}\n`);
				const buildResult = options.gateway.buildPackage(options.projectDir);
				if ("error" in buildResult) {
					options.io.stderr(`${buildResult.error}\n`);
					return 2;
				}
				if (buildResult.artifacts.length === 0) {
					options.io.stderr("No distribution artifacts were built.\n");
					return 2;
				}
				artifacts = buildResult.artifacts;
				break;
			}
			case "pypi-publish-artifacts": {
				options.io.stderr(`${command.statusLine}\n`);
				if (artifacts === null) {
					options.io.stderr("Cannot publish PyPI artifacts before building them.\n");
					return 2;
				}
				const publishError = options.gateway.publishArtifacts(options.projectDir, artifacts);
				if (publishError !== null) {
					options.io.stderr(`${publishError}\n`);
					return 2;
				}
				break;
			}
			case "npm-publish": {
				options.io.stderr("Internal error: npm publish command in PyPI claim plan.\n");
				return 2;
			}
			default:
				assertNever(command.kind);
		}
	}
	return null;
}

function executeNpmClaimCommands(options: {
	projectDir: string;
	plan: ClaimOperationPlan<NpmClaimProjectSpec>;
	gateway: NpmPublishGateway;
	io: ClaimCommandIo;
}): number | null {
	for (const command of options.plan.commands) {
		switch (command.kind) {
			case "npm-publish": {
				options.io.stderr(`${command.statusLine}\n`);
				const publishError = options.gateway.publishProject(options.projectDir);
				if (publishError !== null) {
					options.io.stderr(`${publishError}\n`);
					return 2;
				}
				break;
			}
			case "pypi-build":
			case "pypi-publish-artifacts": {
				options.io.stderr("Internal error: PyPI command in npm claim plan.\n");
				return 2;
			}
			default:
				assertNever(command.kind);
		}
	}
	return null;
}

function precheckExitCode(
	registry: ClaimRegistry,
	status: CheckStatus,
	message: string,
	packageUrl: string | undefined,
	io: ClaimCommandIo,
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
	plan: ClaimOperationPlan<ClaimProjectSpec>;
	lookupName: string;
	skipCheck: boolean;
	io: ClaimCommandIo;
}): void {
	const { spec } = options.plan;
	options.io.stderr(`[DRY RUN] Would claim PyPI package name '${spec.packageName}'.\n`);
	options.io.stderr(`Package name: ${spec.packageName}\n`);
	if (options.lookupName !== spec.packageName) {
		options.io.stderr(`PyPI lookup name: ${options.lookupName}\n`);
	}
	options.io.stderr(`Version: ${spec.version}\n`);
	options.io.stderr(`Description: ${spec.description}\n`);
	options.io.stderr(`Module name: ${spec.moduleName}\n`);
	options.io.stderr(
		options.skipCheck
			? "Availability check: skipped (--skip-check)\n"
			: "Availability check: would check PyPI before publishing\n",
	);
	renderPlanDryRunSteps(options.plan, options.io);
	options.io.stderr(`PyPI URL: ${pypiProjectUrl(options.lookupName)}\n`);
}

function renderClaimNpmDryRun(options: {
	plan: ClaimOperationPlan<NpmClaimProjectSpec>;
	lookupName: string;
	skipCheck: boolean;
	io: ClaimCommandIo;
}): void {
	const { spec } = options.plan;
	options.io.stderr(`[DRY RUN] Would claim npm package name '${spec.packageName}'.\n`);
	options.io.stderr(`Package name: ${spec.packageName}\n`);
	options.io.stderr(`Version: ${spec.version}\n`);
	options.io.stderr(`Description: ${spec.description}\n`);
	options.io.stderr(`License: ${spec.license}\n`);
	options.io.stderr(
		options.skipCheck
			? "Availability check: skipped (--skip-check)\n"
			: "Availability check: would check npm before publishing\n",
	);
	renderPlanDryRunSteps(options.plan, options.io);
	options.io.stderr(`npm URL: ${npmPackagePageUrl(options.lookupName)}\n`);
}

function renderPlanDryRunSteps<TSpec>(plan: ClaimOperationPlan<TSpec>, io: ClaimCommandIo): void {
	io.stderr("Would create a temporary placeholder project directory\n");
	for (const file of plan.files) {
		io.stderr(`Would write: ${file.relativePath}\n`);
	}
	for (const command of plan.commands) {
		io.stderr(`Would run: ${command.dryRunCommand}\n`);
	}
}

async function confirmRealPublish(
	registryLabel: ClaimRegistryLabel,
	packageName: string,
	version: string,
	io: ClaimCommandIo,
): Promise<boolean> {
	io.stderr(`Warning: this will publish a real package to ${registryLabel}.\n`);
	io.stderr(`Package: ${packageName} (${version})\n`);
	io.stderr("Continue? [y/N]: ");
	const input = (await io.stdin()).trim().toLowerCase();
	if (input === "y" || input === "yes") return true;
	io.stderr("Aborted by user.\n");
	return false;
}

function assertNever(value: never): never {
	throw new Error(`Unhandled claim command kind: ${String(value)}`);
}
