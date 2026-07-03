import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const objectiveExtension = await importTypeScriptWorkspaceDefault("@ji/objective/pi/extension");

export default objectiveExtension;
