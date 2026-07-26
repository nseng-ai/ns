import { runCli, type NsCliDeps } from "@nseng-ai/sdk/cli";
import { createRealNsCommandContext } from "@nseng-ai/sdk/context";

import { PiTextGenerator } from "./pi-text-generation.ts";
import { loadPreinstalledNsCommandCatalog } from "./preinstalled-command-catalog.ts";

export interface RunNsCliDeps extends Omit<NsCliDeps, "context"> {
	context?: NsCliDeps["context"];
}

export async function runNsCli(args: readonly string[], deps: RunNsCliDeps = {}): Promise<number> {
	const context =
		deps.context ??
		createRealNsCommandContext({
			textGenerator: new PiTextGenerator(),
			...(deps.cwd === undefined ? {} : { cwd: deps.cwd }),
			...(deps.env === undefined ? {} : { env: deps.env }),
			...(deps.homeDir === undefined ? {} : { homeDir: deps.homeDir }),
		});
	return await runCli(args, {
		...deps,
		context,
		entryMetaUrl: new URL("../cli.ts", import.meta.url).href,
		preinstalledCommandCatalog: loadPreinstalledNsCommandCatalog,
	});
}
