import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const objectiveExtension = await importTypeScriptWorkspaceDefault("@nseng-ai/objectives/pi/extension");

export default objectiveExtension;
