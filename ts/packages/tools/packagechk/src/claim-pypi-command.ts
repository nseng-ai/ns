import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { failure, ok, usageError, type ClinkrExit, type ClinkrInteraction } from "@sdl/clinkr";

import {
	buildClaimProjectFiles,
	moduleNameFromPackage,
	writeClaimFiles,
	type ClaimProjectSpec,
} from "./claim.ts";
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
import type { PypiPublishGateway } from "./publish-gateways.ts";
import type { PackageRegistryGateway } from "./registry-gateways.ts";
import { pypiProjectUrl } from "./urls.ts";
import { normalizePypiName, pypiValidationError } from "./validation.ts";
import { formatRegistryStatusLine } from "./output.ts";

interface PypiClaimProject {
	lookupName: string;
	dryRun: ClaimDryRunData;
	view: ClaimViewData;
}

export async function runPypiClaimCommand(options: {
	request: ClaimRequest;
	registryGateway: PackageRegistryGateway;
	pypiPublishGateway: PypiPublishGateway;
	io: PackagechkIo;
	interaction: ClinkrInteraction;
}): Promise<ClinkrExit<ClaimCommandResult>> {
	const { request, registryGateway, pypiPublishGateway, io, interaction } = options;
	const isDryRun = request.dryRun === true;
	const shouldSkipCheck = request.skipCheck === true;
	const validationError = pypiValidationError(request.name);
	if (validationError !== null) {
		const message = formatRegistryStatusLine("pypi", "invalid", validationError);
		return usageError(message, {
			registry: "pypi",
			packageName: request.name,
			reason: validationError,
		});
	}
	const checkResult =
		!isDryRun && !shouldSkipCheck ? await registryGateway.check("pypi", request.name) : undefined;
	if (checkResult !== undefined) {
		const precheckExit = precheckExitForResult("pypi", checkResult);
		if (precheckExit !== null) return precheckExit;
		if (checkResult.lookupName !== request.name) {
			io.stderr(`PyPI lookup name: ${checkResult.lookupName}\n`);
		}
	}
	const project = preparePypiClaimProject({
		name: request.name,
		description: request.description,
		claimVersion: request.version,
	});
	if (isDryRun) {
		const availabilityLine = shouldSkipCheck
			? "Availability check: skipped (--skip-check)"
			: "Availability check: would check PyPI before publishing";
		renderClaimDryRun({ io, ...project.dryRun, availabilityLine });
		return ok(claimDryRunResult("pypi", project.dryRun), {
			human: `[DRY RUN] Would claim PyPI package name '${project.dryRun.packageName}'.`,
		});
	}
	if (checkResult === undefined && project.lookupName !== request.name) {
		io.stderr(`PyPI lookup name: ${project.lookupName}\n`);
	}
	const toolsError = pypiPublishGateway.ensurePublishToolsAvailable();
	if (toolsError !== null) {
		return failure("publish-tools-unavailable", toolsError, {
			registry: "pypi",
			packageName: request.name,
		});
	}
	if (request.yes !== true) {
		const confirmationExit = await requirePublishConfirmation({
			registry: "pypi",
			registryLabel: "PyPI",
			packageName: request.name,
			version: request.version,
			io,
			interaction,
		});
		if (confirmationExit !== null) return confirmationExit;
	}
	const projectDir = mkdtempSync(join(tmpdir(), "packagechk-claim-pypi-"));
	try {
		writeClaimFiles(projectDir, project.dryRun.files);
		const publishError = await executePypiClaimProject({
			projectDir,
			gateway: pypiPublishGateway,
			io,
		});
		if (publishError !== null) {
			return failure("publish-failed", publishError, {
				registry: "pypi",
				packageName: request.name,
			});
		}
	} finally {
		rmSync(projectDir, { recursive: true, force: true });
	}
	io.stderr(`✓ Claimed PyPI package name '${request.name}'.\n`);
	io.stderr(`View ${project.view.noun}: ${project.view.url}\n`);
	return ok(
		{
			type: "claimed",
			registry: "pypi",
			packageName: request.name,
			version: request.version,
			url: project.view.url,
		},
		{ human: `Claimed PyPI package name '${request.name}'.` },
	);
}

function preparePypiClaimProject(input: {
	name: string;
	description: string;
	claimVersion: string;
}): PypiClaimProject {
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
	};
}

async function executePypiClaimProject(options: {
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
