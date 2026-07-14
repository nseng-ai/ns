import { importTypeScriptWorkspaceModule } from "../lib/workspace-packages.ts";

const [{ default: smartRestackExtension }, { stackSquashExtension }] = await Promise.all([
	importTypeScriptWorkspaceModule<
		typeof import("@internal/pi-tools/code-workflows/smart-restack")
	>("@internal/pi-tools/code-workflows/smart-restack"),
	importTypeScriptWorkspaceModule<typeof import("@nseng-ai/flow/pi")>("@nseng-ai/flow/pi"),
]);

type CodeExtensionAPI = Parameters<typeof smartRestackExtension>[0] &
	Parameters<typeof stackSquashExtension>[0];

export default function codeExtension(pi: CodeExtensionAPI): void {
	smartRestackExtension(pi);
	stackSquashExtension(pi);
}
