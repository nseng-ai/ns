import {
	importFreshTypeScriptWorkspaceModule,
	importTypeScriptWorkspaceModule,
} from "../lib/workspace-packages.ts";

const [{ default: nsExtension }, { createRealNsExtensionApi }] = await Promise.all([
	importTypeScriptWorkspaceModule<typeof import("@nseng-ai/flow/pi/ns-extension")>(
		"@nseng-ai/flow/pi/ns-extension",
	),
	importTypeScriptWorkspaceModule<typeof import("@nseng-ai/ns/cli")>("@nseng-ai/ns/cli"),
]);

export default async function registerNsExtension(
	pi: Parameters<typeof nsExtension>[0],
): Promise<void> {
	const env = { ...process.env };
	const api = await createRealNsExtensionApi({ cwd: process.cwd(), env });
	nsExtension(pi, {
		hasSlotsExtension: api.hasExtension("@nseng-ai/slots"),
		runCli: async (args, deps) => {
			const { runNsCli } = await importFreshTypeScriptWorkspaceModule<
				typeof import("@nseng-ai/ns/cli")
			>("@nseng-ai/ns/cli");
			return await runNsCli(args, deps);
		},
	});
}
