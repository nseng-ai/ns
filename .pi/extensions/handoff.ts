import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const handoffExtension = await importTypeScriptWorkspaceDefault("@ns/handoff/pi/extension");

export default handoffExtension;
