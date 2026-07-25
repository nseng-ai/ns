import { optionalEntries } from "@nseng-ai/foundation/primitives";

import type { NsCliDeps } from "../cli/index.ts";
import { commandKey, toCommandCliInfo } from "../extensions/command-registry.ts";
import type { ExternalNsCommandCandidate } from "../extensions/registry.ts";
import type { DescriptorCommand } from "../sdk/index.ts";

export interface TestNsCliCommandRegistration {
	readonly command: DescriptorCommand;
	readonly segments: readonly string[];
	readonly groupDescription?: string;
	readonly helpGroup?: string;
}

export interface TestNsCliExtensionRegistryOptions {
	readonly commands: readonly TestNsCliCommandRegistration[];
	readonly extensionPackageNames?: readonly string[];
	readonly sourceLabel?: string;
}

export function createTestNsCliExtensionRegistry(
	options: TestNsCliExtensionRegistryOptions,
): NonNullable<NsCliDeps["extensionRegistry"]> {
	const commands = new Map<string, readonly [DescriptorCommand, ExternalNsCommandCandidate]>();
	for (const registration of options.commands) {
		const key = registration.segments.join("/");
		if (commands.has(key)) throw new Error(`Duplicate test ns CLI command registration: ${key}`);
		commands.set(key, [
			registration.command,
			{
				name: registration.command.name,
				segments: registration.segments,
				...optionalEntries({
					groupDescription: registration.groupDescription,
					helpGroup: registration.helpGroup,
				}),
				description: registration.command.summary,
				fullDescription: registration.command.description,
				source: { level: "preinstalled", label: options.sourceLabel ?? "test ns CLI command" },
				moduleReference: { type: "file", path: `test-ns-cli://${key}` },
				hasStaticCommandInfo: true,
			},
		]);
	}
	const candidates = new Map([...commands].map(([key, [, candidate]]) => [key, candidate]));
	return {
		loadCommandCatalog: async () => ({
			candidates,
			commandInfos: [...candidates.values()].map(toCommandCliInfo),
			diagnostics: [],
			extensionPackageNames: new Set(options.extensionPackageNames ?? []),
		}),
		loadSelectedCommand: async (candidate) => {
			const key = commandKey(candidate);
			const registered = commands.get(key);
			if (registered === undefined) {
				return {
					ok: false,
					diagnostic: {
						severity: "error",
						code: "extension_command_missing",
						message: `Missing test ns CLI command registration: ${key}`,
						commandName: key,
					},
				};
			}
			return { ok: true, command: registered[0], source: candidate.source, path: candidate };
		},
	};
}
