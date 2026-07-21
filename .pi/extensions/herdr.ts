import {
	importTypeScriptWorkspaceDefault,
	importTypeScriptWorkspaceModule,
} from "../lib/workspace-packages.ts";

const [registerHerdrPiExtension, { createRealNsExtensionApi }] = await Promise.all([
	importTypeScriptWorkspaceDefault("@nseng-ai/herdr/pi/extension"),
	importTypeScriptWorkspaceModule<typeof import("@nseng-ai/ns/cli")>("@nseng-ai/ns/cli"),
]);

export default async function registerHerdrExtension(
	pi: Parameters<typeof registerHerdrPiExtension>[0],
): Promise<void> {
	await registerHerdrPiExtension(
		pi,
		async (cwd) => createRealNsExtensionApi({ cwd, env: { ...process.env } }),
	);
}
