import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const codeExtension = await importTypeScriptWorkspaceDefault("@ns/flow/pi/code-extension");

export default codeExtension;
