import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const handoffExtension = await importTypeScriptWorkspaceDefault("@ji/handoff/pi/extension");

export default handoffExtension;
