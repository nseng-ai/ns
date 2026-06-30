import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { failure, ok, usageError, type ClinkrExit, type ClinkrInteraction } from "@sdl/clinkr";

import { buildNpmClaimProjectFiles, writeClaimFiles, type NpmClaimProjectSpec } from "./claim.ts";
import type {
	ClaimCommandResult,
	ClaimDryRunData,
	ClaimRequest,
	ClaimViewData,
} from "./claim-command.ts";
import {
	claimDryRunResult,
	precheckExitForResult,
	renderClaimDryRun,
	requirePublishConfirmation,
} from "./claim-command-shared.ts";
import type { PackagechkIo } from "./io.ts";
import { formatRegistryStatusLine } from "./output.ts";
import type { NpmPublishGateway } from "./publish-gateways.ts";
import type { PackageRegistryGateway } from "./registry-gateways.ts";
import { npmPackagePageUrl } from "./urls.ts";
import { npmValidationError } from "./validation.ts";

const DEFAULT_NPM_CLAIM_LICENSE = "MIT";

interface NpmClaimProject {
	dryRun: ClaimDryRunData;
	view: ClaimViewData;
}

export async function runNpmClaimCommand(options: {
	request: ClaimRequest;
	registryGateway: PackageRegistryGateway;
	npmPublishGateway: NpmPublishGateway;
	io: PackagechkIo;
	interaction: ClinkrInteraction;
}): Promise<ClinkrExit<ClaimCommandResult>> {
	const { request, registryGateway, npmPublishGateway, io, interaction } = options;
	const isDryRun = request.dryRun === true;
	const shouldSkipCheck = request.skipCheck === true;
	const validationError = npmValidationError(request.name);
	if (validationError !== null) {
		const message = formatRegistryStatusLine("npm", "invalid", validationError);
		return usageError(message, {
			registry: "npm",
			packageName: request.name,
			reason: validationError,
		});
	}
	const checkResult =
		!isDryRun && !shouldSkipCheck ? await registryGateway.check("npm", request.name) : undefined;
	if (checkResult !== undefined) {
		const precheckExit = precheckExitForResult("npm", checkResult);
		if (precheckExit !== null) return precheckExit;
		if (checkResult.lookupName !== request.name) {
			io.stderr(`npm lookup name: ${checkResult.lookupName}\n`);
		}
	}
	const project = prepareNpmClaimProject({
		name: request.name,
		description: request.description,
		claimVersion: request.version,
	});
	if (isDryRun) {
		const availabilityLine = shouldSkipCheck
			? "Availability check: skipped (--skip-check)"
			: "Availability check: would check npm before publishing";
		renderClaimDryRun({ io, ...project.dryRun, availabilityLine });
		return ok(claimDryRunResult("npm", project.dryRun), {
			human: `[DRY RUN] Would claim npm package name '${project.dryRun.packageName}'.`,
		});
	}
	const toolsError = npmPublishGateway.ensurePublishToolsAvailable();
	if (toolsError !== null) {
		return failure("publish-tools-unavailable", toolsError, {
			registry: "npm",
			packageName: request.name,
		});
	}
	if (request.yes !== true) {
		const confirmationExit = await requirePublishConfirmation({
			registry: "npm",
			registryLabel: "npm",
			packageName: request.name,
			version: request.version,
			io,
			interaction,
		});
		if (confirmationExit !== null) return confirmationExit;
	}
	const projectDir = mkdtempSync(join(tmpdir(), "packagechk-claim-npm-"));
	try {
		writeClaimFiles(projectDir, project.dryRun.files);
		const publishError = await executeNpmClaimProject({
			projectDir,
			gateway: npmPublishGateway,
			io,
		});
		if (publishError !== null) {
			return failure("publish-failed", publishError, {
				registry: "npm",
				packageName: request.name,
			});
		}
	} finally {
		rmSync(projectDir, { recursive: true, force: true });
	}
	io.stderr(`✓ Claimed npm package name '${request.name}'.\n`);
	io.stderr(`View ${project.view.noun}: ${project.view.url}\n`);
	return ok(
		{
			type: "claimed",
			registry: "npm",
			packageName: request.name,
			version: request.version,
			url: project.view.url,
		},
		{ human: `Claimed npm package name '${request.name}'.` },
	);
}

function prepareNpmClaimProject(input: {
	name: string;
	description: string;
	claimVersion: string;
}): NpmClaimProject {
	const spec: NpmClaimProjectSpec = {
		packageName: input.name,
		description: input.description,
		version: input.claimVersion,
		license: DEFAULT_NPM_CLAIM_LICENSE,
	};
	const files = buildNpmClaimProjectFiles(spec);
	const packageUrl = npmPackagePageUrl(input.name);
	return {
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
	};
}

async function executeNpmClaimProject(options: {
	projectDir: string;
	gateway: NpmPublishGateway;
	io: PackagechkIo;
}): Promise<string | null> {
	options.io.stderr("Publishing placeholder package with npm publish...\n");
	const publishError = await options.gateway.publishProject(options.projectDir);
	if (publishError !== null) return publishError;
	return null;
}
