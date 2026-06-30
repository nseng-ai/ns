import {
	confirmInteractiveOrUsageError,
	failure,
	negative,
	usageError,
	type ClinkrExit,
	type ClinkrInteraction,
} from "@sdl/clinkr";

import type { PackagechkIo } from "./io.ts";
import { type RegistryCheckResult } from "./models.ts";
import { formatRegistryStatusLine } from "./output.ts";
import type {
	ClaimCommandResult,
	ClaimDryRunData,
	ClaimRegistry,
	ClaimRegistryLabel,
} from "./claim-command.ts";

export function precheckExitForResult(
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
		url: dryRun.urlLine.replace(/^[^:]+ URL: /u, ""),
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
	options.io.stderr(`${options.urlLine}\n`);
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
