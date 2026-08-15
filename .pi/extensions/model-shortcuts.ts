import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const modelShortcutExtension = await importTypeScriptWorkspaceDefault(
	"@nseng-ai/pi-runtime/core/model-shortcuts/extension",
);

export default modelShortcutExtension;
