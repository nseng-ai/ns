import {
	importFreshTypeScriptWorkspaceModule,
	importTypeScriptWorkspaceModule,
} from "../lib/workspace-packages.ts";

const { default: nsExtension } = await importTypeScriptWorkspaceModule<
	typeof import("@nseng-ai/flow/pi/ns-extension")
>("@nseng-ai/flow/pi/ns-extension");

export default function registerNsExtension(pi: Parameters<typeof nsExtension>[0]): void {
	nsExtension(pi, {
		runCli: async (args, deps) => {
			const { runNsCli } = await importFreshTypeScriptWorkspaceModule<
				typeof import("@nseng-ai/ns/cli")
			>("@nseng-ai/ns/cli");
			return await runNsCli(args, deps);
		},
	});
}
