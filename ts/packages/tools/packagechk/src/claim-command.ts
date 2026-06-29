import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	failure,
	negative,
	ok,
	usageError,
	type ClinkrExit,
	type ClinkrInteraction,
} from "@sdl/clinkr";
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
	yes: z.boolean().default(false).describe("Confirm real package publishing without prompting."),
	skipCheck: z.boolean().optional().describe("Skip registry availability pre-check."),
});

type ClaimRequest = z.output<typeof claimRequestSchema>;

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
	execute(projectDir: string, io: PackagechkIo): Promise<string | null>;
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
}): Promise<ClinkrExit<ClaimCommandResult>> {
	const { request, policy, io, interaction } = options;
	const isDryRun = request.dryRun === true;
	const shouldSkipCheck = request.skipCheck === true;
	const validationError = policy.validate(request.name);
	if (validationError !== null) {
		const message = formatRegistryStatusLine(policy.registry, "invalid", validationError);
		return usageError(message, {
			registry: policy.registry,
			packageName: request.name,
			reason: validationError,
		});
	}
	const checkResult =
		!isDryRun && !shouldSkipCheck ? await policy.precheck(request.name) : undefined;
	if (checkResult !== undefined) {
		const precheckExit = precheckExitForResult(policy.registry, checkResult);
		if (precheckExit !== null) return precheckExit;
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
		return ok(claimDryRunResult(policy.registry, plan.dryRun), {
			human: `[DRY RUN] Would claim ${plan.dryRun.registryLabel} package name '${plan.dryRun.packageName}'.`,
		});
	}
	if (checkResult === undefined && plan.lookupName !== request.name) {
		io.stderr(`${policy.label} lookup name: ${plan.lookupName}\n`);
	}
	const toolsError = policy.ensurePublishToolsAvailable();
	if (toolsError !== null) {
		return failure("publish-tools-unavailable", toolsError, {
			registry: policy.registry,
			packageName: request.name,
		});
	}
	if (request.yes !== true) {
		if (!interaction.isInteractive()) {
			return usageError("Publishing a real package requires --yes (or -y) when non-interactive.", {
				missingFlag: "yes",
				howToSupply: "Pass --yes or -y to confirm publishing.",
			});
		}
		if (
			!(await confirmRealPublish({
				registryLabel: policy.label,
				packageName: request.name,
				version: request.version,
				io,
				interaction,
			}))
		) {
			return negative("Publishing aborted by user.", {
				data: { type: "aborted", registry: policy.registry, packageName: request.name },
				human: "Aborted by user.",
			});
		}
	}
	const projectDir = mkdtempSync(join(tmpdir(), policy.tempDirPrefix));
	try {
		writeClaimFiles(projectDir, plan.dryRun.files);
		const publishError = await plan.execute(projectDir, io);
		if (publishError !== null) {
			return failure("publish-failed", publishError, {
				registry: policy.registry,
				packageName: request.name,
			});
		}
	} finally {
		rmSync(projectDir, { recursive: true, force: true });
	}
	io.stderr(`✓ Claimed ${policy.label} package name '${request.name}'.\n`);
	io.stderr(`View ${plan.view.noun}: ${plan.view.url}\n`);
	return ok(
		{
			type: "claimed",
			registry: policy.registry,
			packageName: request.name,
			version: request.version,
			url: plan.view.url,
		},
		{ human: `Claimed ${policy.label} package name '${request.name}'.` },
	);
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
}): Promise<string | null> {
	options.io.stderr("Building placeholder package with uv build...\n");
	const buildResult = await options.gateway.buildPackage(options.projectDir);
	if ("error" in buildResult) return buildResult.error;
	if (buildResult.artifacts.length === 0) return "No distribution artifacts were built.";
	options.io.stderr("Publishing placeholder package with uvx uv-publish...\n");
	const publishError = await options.gateway.publishArtifacts(
		options.projectDir,
		buildResult.artifacts,
	);
	if (publishError !== null) return publishError;
	return null;
}

async function executeNpmClaimPlan(options: {
	projectDir: string;
	gateway: NpmPublishGateway;
	io: PackagechkIo;
}): Promise<string | null> {
	options.io.stderr("Publishing placeholder package with npm publish...\n");
	const publishError = await options.gateway.publishProject(options.projectDir);
	if (publishError !== null) return publishError;
	return null;
}

function precheckExitForResult(
	registry: ClaimRegistry,
	result: RegistryCheckResult,
): ClinkrExit<ClaimCommandResult> | null {
	if (result.status === "taken") {
		const human = [
			formatRegistryStatusLine(registry, result.status, result.message),
			result.packageUrl,
		]
			.filter((line) => line !== undefined)
			.join("\n");
		return negative("Package name is already taken.", {
			data: {
				type: "taken",
				registry,
				packageName: result.inputName,
				lookupName: result.lookupName,
			},
			human,
		});
	}
	if (result.status === "invalid") {
		return usageError(formatRegistryStatusLine(registry, result.status, result.message), {
			registry,
			packageName: result.inputName,
			lookupName: result.lookupName,
		});
	}
	if (result.status === "error") {
		return failure("registry-check-failed", result.message, {
			registry,
			packageName: result.inputName,
			lookupName: result.lookupName,
		});
	}
	return null;
}

function claimDryRunResult(registry: ClaimRegistry, dryRun: ClaimDryRunData): ClaimCommandResult {
	return {
		type: "dry-run",
		registry,
		packageName: dryRun.packageName,
		...(dryRun.lookupName === undefined ? {} : { lookupName: dryRun.lookupName }),
		version: dryRun.version,
		description: dryRun.description,
		filePaths: dryRun.files.map((file) => file.relativePath),
		commands: [...dryRun.dryRunCommands],
		url: dryRun.urlLine.replace(/^[^:]+ URL: /u, ""),
	};
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
