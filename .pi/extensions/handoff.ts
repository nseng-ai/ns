import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const handoffExtension = await importTypeScriptWorkspaceDefault("@sdl/handoff/pi/extension");

export default handoffExtension;
