import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const codeExtension = await importTypeScriptWorkspaceDefault("@ji/flow/pi/code-extension");

export default codeExtension;
