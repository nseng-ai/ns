import type { ClinkrExit, ClinkrInteraction } from "@sdl/clinkr";

import { buildClaimProjectFiles, moduleNameFromPackage, type ClaimProjectSpec } from "./claim.ts";
import type {
	ClaimCommandResult,
	ClaimDryRunData,
	ClaimRequest,
	ClaimViewData,
} from "./claim-command.ts";
import { runClaimCommand } from "./claim-command-shared.ts";
import type { PackagechkIo } from "./io.ts";
import type { PypiPublishGateway } from "./publish-gateways.ts";
import type { PackageRegistryGateway } from "./registry-gateways.ts";
import { pypiProjectUrl } from "./urls.ts";
import { normalizePypiName, pypiValidationError } from "./validation.ts";

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
	return await runClaimCommand({
		request,
		registryGateway,
		io,
		interaction,
		registry: "pypi",
		registryLabel: "PyPI",
		validationError: pypiValidationError,
		prepareProject: preparePypiClaimProject,
		ensurePublishToolsAvailable: () => pypiPublishGateway.ensurePublishToolsAvailable(),
		executeProject: async (projectDir) =>
			await executePypiClaimProject({
				projectDir,
				gateway: pypiPublishGateway,
				io,
			}),
		tempDirPrefix: "packagechk-claim-pypi-",
		printPreparedLookupNameWhenUnchecked: true,
	});
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
			url: projectUrl,
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
