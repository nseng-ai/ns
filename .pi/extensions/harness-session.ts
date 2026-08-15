import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const harnessSessionExtension = await importTypeScriptWorkspaceDefault(
	"@nseng-ai/pi-runtime/sessions/harness-session",
);

export default harnessSessionExtension;
