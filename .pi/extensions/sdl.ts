import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const sdlExtension = await importTypeScriptWorkspaceDefault("@sdl/flow-pi/sdl-extension");

export default sdlExtension;
