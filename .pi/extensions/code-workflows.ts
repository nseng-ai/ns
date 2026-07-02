import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const codeWorkflowsExtension = await importTypeScriptWorkspaceDefault("sdl-flow/pi/code-workflows-extension");

export default codeWorkflowsExtension;
