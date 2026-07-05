import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const handoffExtension = await importTypeScriptWorkspaceDefault("@nseng-ai/handoff/pi/extension");

export default handoffExtension;
