import {
	createRealFirstPartyCommandContext,
	materializeFirstPartyCommand,
} from "@nseng-ai/capability-kit";
import type { CommandRunner } from "@nseng-ai/foundation/exec";
import { runCommand } from "@nseng-ai/foundation/exec";
import harnessArtifactsExtension from "@nseng-ai/harness-artifacts/ns-extension";
import {
	preinstalledNsCommandCatalogFromRegistrations,
	runCli,
	type NsCliDeps,
	type PreinstalledNsCommandCatalog,
	type PreinstalledNsExtensionRegistration,
} from "@nseng-ai/sdk/cli";
import { createRealNsCommandContext } from "@nseng-ai/sdk/context";
import nsInitExtension from "@nseng-ai/ns-init/ns-extension";

import { PiTextGenerator } from "./pi-text-generation.ts";

export interface RunNsCliDeps extends Omit<NsCliDeps, "context" | "bindSelectedCommand"> {
	context?: NsCliDeps["context"];
	firstPartyCommandContext?: Parameters<typeof materializeFirstPartyCommand>[1];
}

export async function runNsCli(args: readonly string[], deps: RunNsCliDeps = {}): Promise<number> {
	const { firstPartyCommandContext: injectedFirstPartyCommandContext, ...cliDeps } = deps;
	const textGenerator = new PiTextGenerator();
	const context =
		cliDeps.context ??
		createRealNsCommandContext({
			textGenerator,
			...(cliDeps.cwd === undefined ? {} : { cwd: cliDeps.cwd }),
			...(cliDeps.env === undefined ? {} : { env: cliDeps.env }),
			...(cliDeps.homeDir === undefined ? {} : { homeDir: cliDeps.homeDir }),
		});
	const commandRunner: CommandRunner = async (command, commandArgs, options) =>
		await runCommand(command, commandArgs, options);
	const firstPartyCommandContext =
		injectedFirstPartyCommandContext ??
		createRealFirstPartyCommandContext({
			env: cliDeps.env ?? context.env,
			textGenerator,
			commandRunner,
		});
	return await runCli(args, {
		...cliDeps,
		context,
		bindSelectedCommand: (command) =>
			materializeFirstPartyCommand(command, firstPartyCommandContext),
		entryMetaUrl: new URL("../cli.ts", import.meta.url).href,
		preinstalledCommandCatalog: loadPreinstalledNsCommandCatalog,
	});
}

const preinstalledExtensionRegistrations = [
	{
		packageName: "@nseng-ai/ns-init",
		descriptor: nsInitExtension,
		displayPath: "@nseng-ai/ns-init/ns-extension",
	},
	{
		packageName: "@nseng-ai/harness-artifacts",
		descriptor: harnessArtifactsExtension,
		displayPath: "@nseng-ai/harness-artifacts/ns-extension",
	},
] as const satisfies readonly PreinstalledNsExtensionRegistration[];

function loadPreinstalledNsCommandCatalog(): PreinstalledNsCommandCatalog {
	return preinstalledNsCommandCatalogFromRegistrations(preinstalledExtensionRegistrations);
}
