import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const codeWorkflowsExtension = await importTypeScriptWorkspaceDefault("@internal/pi-tools/code-workflows/extension");

export default codeWorkflowsExtension;
