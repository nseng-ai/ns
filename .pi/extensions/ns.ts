import { importTypeScriptWorkspaceModule } from "../lib/workspace-packages.ts";

const [{ default: nsExtension }, { runNsCli }] = await Promise.all([
	importTypeScriptWorkspaceModule<typeof import("@nseng-ai/flow/pi/ns-extension")>(
		"@nseng-ai/flow/pi/ns-extension",
	),
	importTypeScriptWorkspaceModule<typeof import("@nseng-ai/ns/cli")>("@nseng-ai/ns/cli"),
]);

export default function registerNsExtension(pi: Parameters<typeof nsExtension>[0]): void {
	nsExtension(pi, { runCli: runNsCli });
}
