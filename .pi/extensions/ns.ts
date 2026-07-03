import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const sdlExtension = await importTypeScriptWorkspaceDefault("@ji/flow/pi/sdl-extension");

export default sdlExtension;
