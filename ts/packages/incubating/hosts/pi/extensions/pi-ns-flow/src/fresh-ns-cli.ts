import { createJiti } from "jiti/static";

import type { CliCommandExtensionSpec } from "@nseng-ai/pi-runtime/commands/cli-extension";

interface NsCliModule {
	runNsCli: CliCommandExtensionSpec["runCli"];
}

export interface FreshNsCliModuleLoader {
	load(): Promise<NsCliModule>;
}

export function createFreshNsCliModuleLoader(): FreshNsCliModuleLoader {
	return {
		async load(): Promise<NsCliModule> {
			const jiti = createJiti(import.meta.url, {
				moduleCache: false,
				fsCache: false,
			});
			return await jiti.import<NsCliModule>("@nseng-ai/ns/cli");
		},
	};
}

export function createFreshNsCliRunner(
	loader: FreshNsCliModuleLoader = createFreshNsCliModuleLoader(),
): CliCommandExtensionSpec["runCli"] {
	return async (args, deps) => {
		const { runNsCli } = await loader.load();
		return await runNsCli(args, deps);
	};
}
