import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const registerCccPiExtension = await importTypeScriptWorkspaceDefault("@sdl/ccc-pi/extension");

export default registerCccPiExtension;
