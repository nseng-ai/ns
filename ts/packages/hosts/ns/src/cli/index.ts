import { createRealFirstPartyCommandContext } from "@nseng-ai/capability-kit";
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

export interface RunNsCliDeps extends Omit<NsCliDeps, "context"> {
	context?: NsCliDeps["context"];
}

export async function runNsCli(args: readonly string[], deps: RunNsCliDeps = {}): Promise<number> {
	const textGenerator = new PiTextGenerator();
	const context =
		deps.context ??
		createRealNsCommandContext({
			textGenerator,
			...(deps.cwd === undefined ? {} : { cwd: deps.cwd }),
			...(deps.env === undefined ? {} : { env: deps.env }),
			...(deps.homeDir === undefined ? {} : { homeDir: deps.homeDir }),
		});
	const commandRunner: CommandRunner = async (command, commandArgs, options) =>
		await runCommand(command, commandArgs, options);
	return await runCli(args, {
		...deps,
		context,
		composableContext:
			deps.composableContext ??
			createRealFirstPartyCommandContext({
				env: deps.env ?? context.env,
				textGenerator,
				commandRunner,
			}),
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
