import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const sdlExtension = await importTypeScriptWorkspaceDefault("@ns/flow/pi/sdl-extension");

export default sdlExtension;
