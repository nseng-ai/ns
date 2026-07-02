import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const objectiveExtension = await importTypeScriptWorkspaceDefault("@sdl/objective/pi/extension");

export default objectiveExtension;
