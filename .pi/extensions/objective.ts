import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const objectiveExtension = await importTypeScriptWorkspaceDefault("@nseng-ai/objective/pi/extension");

export default objectiveExtension;
