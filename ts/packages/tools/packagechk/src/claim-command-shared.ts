import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	confirmInteractiveOrUsageError,
	failure,
	negative,
	ok,
	usageError,
	type ClinkrExit,
	type ClinkrInteraction,
} from "@ns/clinkr";

import { writeClaimFiles } from "./claim.ts";
import type { PackagechkIo } from "./io.ts";
import { checkStatusPolicy, type RegistryCheckResult } from "./models.ts";
import { formatRegistryStatusLine } from "./output.ts";
import type {
	ClaimCommandResult,
	ClaimDryRunData,
	ClaimRegistry,
	ClaimRegistryLabel,
	ClaimRequest,
	ClaimViewData,
} from "./claim-command.ts";
import type { PackageRegistryGateway } from "./registry-gateways.ts";

export interface PreparedClaimProject {
	lookupName?: string;
	dryRun: ClaimDryRunData;
	view: ClaimViewData;
}

export interface ClaimRegistryAdapter {
	registry: ClaimRegistry;
	registryLabel: ClaimRegistryLabel;
	validationError(name: string): string | null;
	prepareProject(input: {
		name: string;
		description: string;
		claimVersion: string;
	}): PreparedClaimProject;
	ensurePublishToolsAvailable(): string | null;
	executeProject(projectDir: string): Promise<string | null>;
	tempDirPrefix: string;
}

export async function runClaimCommand(options: {
	request: ClaimRequest;
	registryGateway: PackageRegistryGateway;
	io: PackagechkIo;
	interaction: ClinkrInteraction;
	adapter: ClaimRegistryAdapter;
}): Promise<ClinkrExit<ClaimCommandResult>> {
	const { request, registryGateway, io, interaction, adapter } = options;
	const { registry, registryLabel } = adapter;
	const isDryRun = request.dryRun === true;
	const shouldSkipCheck = request.skipCheck === true;
	const validationError = adapter.validationError(request.name);
	if (validationError !== null) {
		const message = formatRegistryStatusLine(registry, "invalid", validationError);
		return usageError(message, {
			registry,
			packageName: request.name,
			reason: validationError,
		});
	}
	const checkResult =
		!isDryRun && !shouldSkipCheck ? await registryGateway.check(registry, request.name) : undefined;
	if (checkResult !== undefined) {
		const precheckExit = precheckExitForResult(registry, checkResult);
		if (precheckExit !== null) return precheckExit;
		writeLookupNameWhenDifferent({
			io,
			registryLabel,
			packageName: request.name,
			lookupName: checkResult.lookupName,
		});
	}
	const project = adapter.prepareProject({
		name: request.name,
		description: request.description,
		claimVersion: request.version,
	});
	if (isDryRun) {
		const availabilityLine = shouldSkipCheck
			? "Availability check: skipped (--skip-check)"
			: `Availability check: would check ${registryLabel} before publishing`;
		renderClaimDryRun({ io, ...project.dryRun, availabilityLine });
		return ok(claimDryRunResult(registry, project.dryRun), {
			human: `[DRY RUN] Would claim ${registryLabel} package name '${project.dryRun.packageName}'.`,
		});
	}
	if (checkResult === undefined) {
		writeLookupNameWhenDifferent({
			io,
			registryLabel,
			packageName: request.name,
			lookupName: project.lookupName,
		});
	}
	const toolsError = adapter.ensurePublishToolsAvailable();
	if (toolsError !== null) {
		return failure("publish-tools-unavailable", toolsError, {
			registry,
			packageName: request.name,
		});
	}
	if (request.yes !== true) {
		const confirmationExit = await requirePublishConfirmation({
			registry,
			registryLabel,
			packageName: request.name,
			version: request.version,
			io,
			interaction,
		});
		if (confirmationExit !== null) return confirmationExit;
	}
	const projectDir = mkdtempSync(join(tmpdir(), adapter.tempDirPrefix));
	try {
		writeClaimFiles(projectDir, project.dryRun.files);
		const publishError = await adapter.executeProject(projectDir);
		if (publishError !== null) {
			return failure("publish-failed", publishError, {
				registry,
				packageName: request.name,
			});
		}
	} finally {
		rmSync(projectDir, { recursive: true, force: true });
	}
	io.stderr(`✓ Claimed ${registryLabel} package name '${request.name}'.\n`);
	io.stderr(`View ${project.view.noun}: ${project.view.url}\n`);
	return ok(
		{
			type: "claimed",
			registry,
			packageName: request.name,
			version: request.version,
			url: project.view.url,
		},
		{ human: `Claimed ${registryLabel} package name '${request.name}'.` },
	);
}

function writeLookupNameWhenDifferent(options: {
	io: PackagechkIo;
	registryLabel: ClaimRegistryLabel;
	packageName: string;
	lookupName: string | undefined;
}): void {
	if (options.lookupName !== undefined && options.lookupName !== options.packageName) {
		options.io.stderr(`${options.registryLabel} lookup name: ${options.lookupName}\n`);
	}
}

export function precheckExitForResult(
	registry: ClaimRegistry,
	result: RegistryCheckResult,
): ClinkrExit<ClaimCommandResult> | null {
	const action = checkStatusPolicy(result.status).claimPrecheckAction;
	if (action === "taken") {
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
	if (action === "usage-error") {
		return usageError(formatRegistryStatusLine(registry, result.status, result.message), {
			registry,
			packageName: result.inputName,
			lookupName: result.lookupName,
		});
	}
	if (action === "failure") {
		return failure("registry-check-failed", result.message, {
			registry,
			packageName: result.inputName,
			lookupName: result.lookupName,
		});
	}
	return null;
}

export function claimDryRunResult(
	registry: ClaimRegistry,
	dryRun: ClaimDryRunData,
): ClaimCommandResult {
	return {
		type: "dry-run",
		registry,
		packageName: dryRun.packageName,
		...(dryRun.lookupName === undefined ? {} : { lookupName: dryRun.lookupName }),
		version: dryRun.version,
		description: dryRun.description,
		filePaths: dryRun.files.map((file) => file.relativePath),
		commands: [...dryRun.dryRunCommands],
		url: dryRun.url,
	};
}

export function renderClaimDryRun(
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
	options.io.stderr(`${options.registryLabel} URL: ${options.url}\n`);
}

export async function requirePublishConfirmation(options: {
	registry: ClaimRegistry;
	registryLabel: ClaimRegistryLabel;
	packageName: string;
	version: string;
	io: PackagechkIo;
	interaction: ClinkrInteraction;
}): Promise<ClinkrExit<ClaimCommandResult> | null> {
	const answer = await confirmInteractiveOrUsageError(options.interaction, {
		nonInteractive: {
			message: "Publishing a real package requires --yes (or -y) when non-interactive.",
			missingFlag: "yes",
			howToSupply: "Pass --yes or -y to confirm publishing.",
		},
		confirmation: { message: "Continue?", defaultAnswer: "no" },
		beforePrompt: () => {
			options.io.stderr(`Warning: this will publish a real package to ${options.registryLabel}.\n`);
			options.io.stderr(`Package: ${options.packageName} (${options.version})\n`);
		},
	});
	if (answer.type === "usageError") return answer;
	if (answer.type === "confirmed") return null;
	options.io.stderr("Aborted by user.\n");
	return negative("Publishing aborted by user.", {
		data: { type: "aborted", registry: options.registry, packageName: options.packageName },
		human: "Aborted by user.",
	});
}
