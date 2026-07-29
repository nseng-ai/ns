import { composeCodeExtensions } from "../lib/code-extension-composition.mts";
import { importTypeScriptWorkspaceModule } from "../lib/workspace-packages.ts";

const [{ default: smartRestackExtension }, { stackSquashExtension }] = await Promise.all([
  importTypeScriptWorkspaceModule<typeof import("@internal/pi-tools/code-workflows/smart-restack")>(
    "@internal/pi-tools/code-workflows/smart-restack",
  ),
  importTypeScriptWorkspaceModule<typeof import("@nseng-ai/pi-ns-flow/stack-squash")>(
    "@nseng-ai/pi-ns-flow/stack-squash",
  ),
]);

export default composeCodeExtensions(smartRestackExtension, stackSquashExtension);
