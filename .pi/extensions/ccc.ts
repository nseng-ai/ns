import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const registerCccPiExtension = await importTypeScriptWorkspaceDefault("@nseng-ai/cmux/pi/extension");

export default registerCccPiExtension;
