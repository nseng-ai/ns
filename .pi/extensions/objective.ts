import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const objectiveExtension = await importTypeScriptWorkspaceDefault("@nseng-ai/pi-ns-objectives/extension");

export default objectiveExtension;
