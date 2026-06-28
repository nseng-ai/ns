import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const codeExtension = await importTypeScriptWorkspaceDefault("@sdl/flow-pi/code-extension");

export default codeExtension;
