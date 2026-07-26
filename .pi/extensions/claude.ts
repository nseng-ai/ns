import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const claudeExtension = await importTypeScriptWorkspaceDefault(
	"@nseng-ai/handoffs/pi/claude-extension",
);

export default claudeExtension;
