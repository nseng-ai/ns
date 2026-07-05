import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const handoffExtension = await importTypeScriptWorkspaceDefault("@nseng-ai/handoffs/pi/extension");

export default handoffExtension;
