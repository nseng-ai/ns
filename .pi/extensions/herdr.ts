import { importTypeScriptWorkspaceModule } from "../lib/workspace-packages.ts";

const [{ default: registerHerdrPiExtension }, { createRealNsExtensionApi }] = await Promise.all([
  importTypeScriptWorkspaceModule<typeof import("@nseng-ai/herdr/pi/extension")>(
    "@nseng-ai/herdr/pi/extension",
  ),
  importTypeScriptWorkspaceModule<typeof import("@nseng-ai/ns/cli")>("@nseng-ai/ns/cli"),
]);

export default function registerHerdrExtension(
  pi: Parameters<typeof registerHerdrPiExtension>[0],
): void {
  registerHerdrPiExtension(pi, async (cwd) =>
    createRealNsExtensionApi({ cwd, env: { ...process.env } }),
  );
}
