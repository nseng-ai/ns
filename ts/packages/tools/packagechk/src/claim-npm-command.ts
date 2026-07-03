import type { ClinkrExit, ClinkrInteraction } from "@ji/clinkr";

import { buildNpmClaimProjectFiles, type NpmClaimProjectSpec } from "./claim.ts";
import type {
	ClaimCommandResult,
	ClaimDryRunData,
	ClaimRequest,
	ClaimViewData,
} from "./claim-command.ts";
import { runClaimCommand } from "./claim-command-shared.ts";
import type { PackagechkIo } from "./io.ts";
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
	return await runClaimCommand({
		request,
		registryGateway,
		io,
		interaction,
		adapter: {
			registry: "npm",
			registryLabel: "npm",
			validationError: npmValidationError,
			prepareProject: prepareNpmClaimProject,
			ensurePublishToolsAvailable: () => npmPublishGateway.ensurePublishToolsAvailable(),
			executeProject: async (projectDir) =>
				await executeNpmClaimProject({
					projectDir,
					gateway: npmPublishGateway,
					io,
				}),
			tempDirPrefix: "packagechk-claim-npm-",
		},
	});
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
			url: packageUrl,
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
