import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ClinkrInteraction } from "@asdl/clinkr";
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
import type { PackagechkIo } from "./io.ts";
import { type RegistryCheckResult } from "./models.ts";
import { formatRegistryStatusLine } from "./output.ts";
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
	skipConfirmation: z.boolean().optional().describe("Skip confirmation prompt."),
	skipCheck: z.boolean().optional().describe("Skip registry availability pre-check."),
});

type ClaimRequest = z.output<typeof claimRequestSchema>;

type ClaimRegistry = "pypi" | "npm";
type ClaimRegistryLabel = "PyPI" | "npm";

interface ClaimDryRunData {
	registryLabel: ClaimRegistryLabel;
	packageName: string;
	lookupName?: string;
	version: string;
	description: string;
	extraLines: readonly string[];
	files: readonly ClaimProjectFile[];
	dryRunCommands: readonly string[];
	urlLine: string;
}

interface ClaimViewData {
	noun: "project" | "package";
	url: string;
}

interface ClaimPlan {
	lookupName: string;
	dryRun: ClaimDryRunData;
	view: ClaimViewData;
	execute(projectDir: string, io: PackagechkIo): Promise<number | null>;
}

interface ClaimPolicy {
	registry: ClaimRegistry;
	label: ClaimRegistryLabel;
	tempDirPrefix: string;
	validate(name: string): string | null;
	precheck(name: string): Promise<RegistryCheckResult>;
	ensurePublishToolsAvailable(): string | null;
	prepare(input: { name: string; description: string; claimVersion: string }): ClaimPlan;
}

export async function runClaimCommand(options: {
	request: ClaimRequest;
	policy: ClaimPolicy;
	io: PackagechkIo;
	interaction: ClinkrInteraction;
}): Promise<number> {
	const { request, policy, io, interaction } = options;
	const isDryRun = request.dryRun === true;
	const shouldSkipCheck = request.skipCheck === true;
	const validationError = policy.validate(request.name);
	if (validationError !== null) {
		io.stderr(`${formatRegistryStatusLine(policy.registry, "invalid", validationError)}\n`);
		return 2;
	}
	const checkResult =
		!isDryRun && !shouldSkipCheck ? await policy.precheck(request.name) : undefined;
	if (checkResult !== undefined) {
		const exitCode = precheckExitCode(policy.registry, checkResult, io);
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
		const availabilityLine = shouldSkipCheck
			? "Availability check: skipped (--skip-check)"
			: `Availability check: would check ${plan.dryRun.registryLabel} before publishing`;
		renderClaimDryRun({ io, ...plan.dryRun, availabilityLine });
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
		!(request.skipConfirmation === true) &&
		!(await confirmRealPublish({
			registryLabel: policy.label,
			packageName: request.name,
			version: request.version,
			io,
			interaction,
		}))
	) {
		return 1;
	}
	const projectDir = mkdtempSync(join(tmpdir(), policy.tempDirPrefix));
	try {
		writeClaimFiles(projectDir, plan.dryRun.files);
		const publishExitCode = await plan.execute(projectDir, io);
		if (publishExitCode !== null) return publishExitCode;
	} finally {
		rmSync(projectDir, { recursive: true, force: true });
	}
	io.stderr(`✓ Claimed ${policy.label} package name '${request.name}'.\n`);
	io.stderr(`View ${plan.view.noun}: ${plan.view.url}\n`);
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
	const projectUrl = pypiProjectUrl(lookupName);
	return {
		lookupName,
		dryRun: {
			registryLabel: "PyPI",
			packageName: spec.packageName,
			lookupName,
			version: spec.version,
			description: spec.description,
			extraLines: [`Module name: ${spec.moduleName}`],
			files,
			dryRunCommands: ["uv build", "uvx uv-publish <artifacts>"],
			urlLine: `PyPI URL: ${projectUrl}`,
		},
		view: { noun: "project", url: projectUrl },
		execute: (projectDir, io) => executePypiClaimPlan({ projectDir, gateway, io }),
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
	const packageUrl = npmPackagePageUrl(input.name);
	return {
		lookupName: input.name,
		dryRun: {
			registryLabel: "npm",
			packageName: spec.packageName,
			version: spec.version,
			description: spec.description,
			extraLines: [`License: ${spec.license}`],
			files,
			dryRunCommands: ["npm publish --access=public"],
			urlLine: `npm URL: ${packageUrl}`,
		},
		view: { noun: "package", url: packageUrl },
		execute: (projectDir, io) => executeNpmClaimPlan({ projectDir, gateway, io }),
	};
}

async function executePypiClaimPlan(options: {
	projectDir: string;
	gateway: PypiPublishGateway;
	io: PackagechkIo;
}): Promise<number | null> {
	options.io.stderr("Building placeholder package with uv build...\n");
	const buildResult = await options.gateway.buildPackage(options.projectDir);
	if ("error" in buildResult) {
		options.io.stderr(`${buildResult.error}\n`);
		return 2;
	}
	if (buildResult.artifacts.length === 0) {
		options.io.stderr("No distribution artifacts were built.\n");
		return 2;
	}
	options.io.stderr("Publishing placeholder package with uvx uv-publish...\n");
	const publishError = await options.gateway.publishArtifacts(
		options.projectDir,
		buildResult.artifacts,
	);
	if (publishError !== null) {
		options.io.stderr(`${publishError}\n`);
		return 2;
	}
	return null;
}

async function executeNpmClaimPlan(options: {
	projectDir: string;
	gateway: NpmPublishGateway;
	io: PackagechkIo;
}): Promise<number | null> {
	options.io.stderr("Publishing placeholder package with npm publish...\n");
	const publishError = await options.gateway.publishProject(options.projectDir);
	if (publishError !== null) {
		options.io.stderr(`${publishError}\n`);
		return 2;
	}
	return null;
}

function precheckExitCode(
	registry: ClaimRegistry,
	result: RegistryCheckResult,
	io: PackagechkIo,
): number | null {
	if (result.status === "taken") {
		io.stderr(`${formatRegistryStatusLine(registry, result.status, result.message)}\n`);
		if (result.packageUrl !== undefined) io.stderr(`${result.packageUrl}\n`);
		return 1;
	}
	if (result.status !== "available") {
		io.stderr(`${formatRegistryStatusLine(registry, result.status, result.message)}\n`);
		return 2;
	}
	return null;
}

function renderClaimDryRun(
	options: ClaimDryRunData & {
		io: PackagechkIo;
		availabilityLine: string;
	},
): void {
	options.io.stderr(
		`[DRY RUN] Would claim ${options.registryLabel} package name '${options.packageName}'.\n`,
	);
	options.io.stderr(`Package name: ${options.packageName}\n`);
	if (options.lookupName !== undefined && options.lookupName !== options.packageName) {
		options.io.stderr(`${options.registryLabel} lookup name: ${options.lookupName}\n`);
	}
	options.io.stderr(`Version: ${options.version}\n`);
	options.io.stderr(`Description: ${options.description}\n`);
	for (const line of options.extraLines) {
		options.io.stderr(`${line}\n`);
	}
	options.io.stderr(`${options.availabilityLine}\n`);
	options.io.stderr("Would create a temporary placeholder project directory\n");
	for (const file of options.files) {
		options.io.stderr(`Would write: ${file.relativePath}\n`);
	}
	for (const command of options.dryRunCommands) {
		options.io.stderr(`Would run: ${command}\n`);
	}
	options.io.stderr(`${options.urlLine}\n`);
}

async function confirmRealPublish(options: {
	registryLabel: ClaimRegistryLabel;
	packageName: string;
	version: string;
	io: PackagechkIo;
	interaction: ClinkrInteraction;
}): Promise<boolean> {
	const { registryLabel, packageName, version, io, interaction } = options;
	io.stderr(`Warning: this will publish a real package to ${registryLabel}.\n`);
	io.stderr(`Package: ${packageName} (${version})\n`);
	const answer = await interaction.confirm({ message: "Continue?", defaultAnswer: "no" });
	if (answer.type === "confirmed") return true;
	io.stderr("Aborted by user.\n");
	return false;
}
