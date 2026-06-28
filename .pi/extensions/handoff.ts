import { importTypeScriptWorkspaceDefault } from "./workspace-packages.ts";

const handoffExtension = await importTypeScriptWorkspaceDefault("@sdl/handoff-pi/extension");

export default handoffExtension;
