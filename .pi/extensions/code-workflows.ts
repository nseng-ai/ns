import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const codeWorkflowsExtension = await importTypeScriptWorkspaceDefault("@nseng-ai/flow/pi/code-workflows-extension");

export default codeWorkflowsExtension;
