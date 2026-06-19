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
import { type RegistryCheckResult } from "./models.ts";
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
		.default(DEFAULT_CLAIM_DESCRIPTION)
		.describe("Package description. Defaults to a generic claim description."),
	version: z.string().default(DEFAULT_CLAIM_VERSION).describe("Version to publish."),
	dryRun: z.boolean().optional().describe("Show planned operations without effects."),
	force: z.boolean().optional().describe("Skip confirmation prompt."),
	skipCheck: z.boolean().optional().describe("Skip registry availability pre-check."),
});

type ClaimRequest = z.output<typeof claimRequestSchema>;

type ClaimRegistry = "pypi" | "npm";
type ClaimRegistryLabel = "PyPI" | "npm";

export interface ClaimCommandIo {
	stdout(text: string): void;
	stderr(text: string): void;
	stdin(): Promise<string>;
}

interface ClaimPlan {
	packageName: string;
	lookupName: string;
	version: string;
	description: string;
	packageUrl: string;
	extraLines: readonly string[];
	files: readonly ClaimProjectFile[];
	execute(projectDir: string, io: ClaimCommandIo): number | null;
}

interface ClaimRegistryDescriptor {
	dryRunCommands: readonly string[];
	urlLineLabel: string;
	viewLineLabel: string;
}

interface ClaimPolicy {
	registry: ClaimRegistry;
	label: ClaimRegistryLabel;
	tempDirPrefix: string;
	descriptor: ClaimRegistryDescriptor;
	validate(name: string): string | null;
	precheck(name: string): Promise<RegistryCheckResult>;
	ensurePublishToolsAvailable(): string | null;
	prepare(input: { name: string; description: string; claimVersion: string }): ClaimPlan;
}

export async function runClaimCommand(options: {
	request: ClaimRequest;
	policy: ClaimPolicy;
	io: ClaimCommandIo;
}): Promise<number> {
	const { request, policy, io } = options;
	const isDryRun = request.dryRun === true;
	const shouldSkipCheck = request.skipCheck === true;
	const shouldUsePrecheckValidation = !isDryRun && !shouldSkipCheck;
	if (!shouldUsePrecheckValidation) {
		const validationError = policy.validate(request.name);
		if (validationError !== null) {
			io.stderr(`${policy.registry}: invalid: ${validationError}\n`);
			return 2;
		}
	}
	const checkResult = shouldUsePrecheckValidation ? await policy.precheck(request.name) : undefined;
	if (checkResult !== undefined) {
		const exitCode = emitPrecheckFailureExitCode(policy.registry, checkResult, io);
		if (exitCode !== null) return exitCode;
		if (checkResult.lookupName !== request.name) {
			io.stderr(`${policy.label} lookup name: ${checkResult.lookupName}\n`);
		}
	}
	const plan = policy.prepare({
		name: request.name,
		description: request.description,
		claimVersion: request.version,
	});
	if (isDryRun) {
		renderClaimDryRun({
			io,
			registryLabel: policy.label,
			descriptor: policy.descriptor,
			plan,
			skipCheck: shouldSkipCheck,
		});
		return 0;
	}
	if (checkResult === undefined && plan.lookupName !== request.name) {
		io.stderr(`${policy.label} lookup name: ${plan.lookupName}\n`);
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
		const publishExitCode = plan.execute(projectDir, io);
		if (publishExitCode !== null) return publishExitCode;
	} finally {
		rmSync(projectDir, { recursive: true, force: true });
	}
	io.stderr(`✓ Claimed ${policy.label} package name '${request.name}'.\n`);
	io.stderr(`${policy.descriptor.viewLineLabel}: ${plan.packageUrl}\n`);
	return 0;
}

export function buildPypiClaimPolicy(ctx: {
	registryGateway: PackageRegistryGateway;
	pypiPublishGateway: PypiPublishGateway;
}): ClaimPolicy {
	return {
		registry: "pypi",
		label: "PyPI",
		tempDirPrefix: "packagechk-claim-pypi-",
		descriptor: {
			dryRunCommands: ["uv build", "uvx uv-publish <artifacts>"],
			urlLineLabel: "PyPI URL",
			viewLineLabel: "View project",
		},
		validate: pypiValidationError,
		precheck: (name) => ctx.registryGateway.check("pypi", name),
		ensurePublishToolsAvailable: () => ctx.pypiPublishGateway.ensurePublishToolsAvailable(),
		prepare: (input) => preparePypiClaimPlan(input, ctx.pypiPublishGateway),
	};
}

export function buildNpmClaimPolicy(ctx: {
	registryGateway: PackageRegistryGateway;
	npmPublishGateway: NpmPublishGateway;
}): ClaimPolicy {
	return {
		registry: "npm",
		label: "npm",
		tempDirPrefix: "packagechk-claim-npm-",
		descriptor: {
			dryRunCommands: ["npm publish --access=public"],
			urlLineLabel: "npm URL",
			viewLineLabel: "View package",
		},
		validate: npmValidationError,
		precheck: (name) => ctx.registryGateway.check("npm", name),
		ensurePublishToolsAvailable: () => ctx.npmPublishGateway.ensurePublishToolsAvailable(),
		prepare: (input) => prepareNpmClaimPlan(input, ctx.npmPublishGateway),
	};
}

function preparePypiClaimPlan(
	input: { name: string; description: string; claimVersion: string },
	gateway: PypiPublishGateway,
): ClaimPlan {
	const lookupName = normalizePypiName(input.name);
	const spec: ClaimProjectSpec = {
		packageName: input.name,
		moduleName: moduleNameFromPackage(lookupName),
		description: input.description,
		version: input.claimVersion,
	};
	const files = buildClaimProjectFiles(spec);
	return {
		packageName: spec.packageName,
		lookupName,
		version: spec.version,
		description: spec.description,
		packageUrl: pypiProjectUrl(lookupName),
		extraLines: [`Module name: ${spec.moduleName}`],
		files,
		execute: (projectDir, io) => executePypiClaimPlan({ projectDir, files, gateway, io }),
	};
}

function prepareNpmClaimPlan(
	input: { name: string; description: string; claimVersion: string },
	gateway: NpmPublishGateway,
): ClaimPlan {
	const spec: NpmClaimProjectSpec = {
		packageName: input.name,
		description: input.description,
		version: input.claimVersion,
		license: DEFAULT_NPM_CLAIM_LICENSE,
	};
	const files = buildNpmClaimProjectFiles(spec);
	return {
		packageName: spec.packageName,
		lookupName: input.name,
		version: spec.version,
		description: spec.description,
		packageUrl: npmPackagePageUrl(input.name),
		extraLines: [`License: ${spec.license}`],
		files,
		execute: (projectDir, io) => executeNpmClaimPlan({ projectDir, files, gateway, io }),
	};
}

function executePypiClaimPlan(options: {
	projectDir: string;
	files: readonly ClaimProjectFile[];
	gateway: PypiPublishGateway;
	io: ClaimCommandIo;
}): number | null {
	writeClaimFiles(options.projectDir, options.files);
	options.io.stderr("Building placeholder package with uv build...\n");
	const buildResult = options.gateway.buildPackage(options.projectDir);
	if ("error" in buildResult) {
		options.io.stderr(`${buildResult.error}\n`);
		return 2;
	}
	if (buildResult.artifacts.length === 0) {
		options.io.stderr("No distribution artifacts were built.\n");
		return 2;
	}
	options.io.stderr("Publishing placeholder package with uvx uv-publish...\n");
	const publishError = options.gateway.publishArtifacts(options.projectDir, buildResult.artifacts);
	if (publishError !== null) {
		options.io.stderr(`${publishError}\n`);
		return 2;
	}
	return null;
}

function executeNpmClaimPlan(options: {
	projectDir: string;
	files: readonly ClaimProjectFile[];
	gateway: NpmPublishGateway;
	io: ClaimCommandIo;
}): number | null {
	writeClaimFiles(options.projectDir, options.files);
	options.io.stderr("Publishing placeholder package with npm publish...\n");
	const publishError = options.gateway.publishProject(options.projectDir);
	if (publishError !== null) {
		options.io.stderr(`${publishError}\n`);
		return 2;
	}
	return null;
}

function emitPrecheckFailureExitCode(
	registry: ClaimRegistry,
	result: RegistryCheckResult,
	io: ClaimCommandIo,
): number | null {
	if (result.status === "taken") {
		io.stderr(`${registry}: taken: ${result.message}\n`);
		if (result.packageUrl !== undefined) io.stderr(`${result.packageUrl}\n`);
		return 1;
	}
	if (result.status !== "available") {
		io.stderr(`${registry}: ${result.status}: ${result.message}\n`);
		return 2;
	}
	return null;
}

function renderClaimDryRun(options: {
	io: ClaimCommandIo;
	registryLabel: ClaimRegistryLabel;
	descriptor: ClaimRegistryDescriptor;
	plan: ClaimPlan;
	skipCheck: boolean;
}): void {
	options.io.stderr(
		`[DRY RUN] Would claim ${options.registryLabel} package name '${options.plan.packageName}'.\n`,
	);
	options.io.stderr(`Package name: ${options.plan.packageName}\n`);
	if (options.plan.lookupName !== options.plan.packageName) {
		options.io.stderr(`${options.registryLabel} lookup name: ${options.plan.lookupName}\n`);
	}
	options.io.stderr(`Version: ${options.plan.version}\n`);
	options.io.stderr(`Description: ${options.plan.description}\n`);
	for (const line of options.plan.extraLines) {
		options.io.stderr(`${line}\n`);
	}
	const availabilityLine = options.skipCheck
		? "Availability check: skipped (--skip-check)"
		: `Availability check: would check ${options.registryLabel} before publishing`;
	options.io.stderr(`${availabilityLine}\n`);
	options.io.stderr("Would create a temporary placeholder project directory\n");
	for (const file of options.plan.files) {
		options.io.stderr(`Would write: ${file.relativePath}\n`);
	}
	for (const command of options.descriptor.dryRunCommands) {
		options.io.stderr(`Would run: ${command}\n`);
	}
	options.io.stderr(`${options.descriptor.urlLineLabel}: ${options.plan.packageUrl}\n`);
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
