import { importTypeScriptWorkspaceDefault } from "./workspace-packages.ts";

const codeExtension = await importTypeScriptWorkspaceDefault("@sdl/flow-pi/code-extension");

export default codeExtension;
