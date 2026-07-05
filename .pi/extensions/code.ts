import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const codeExtension = await importTypeScriptWorkspaceDefault("@nseng-ai/flow/pi/code-extension");

export default codeExtension;
