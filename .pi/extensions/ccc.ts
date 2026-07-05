import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const registerCccPiExtension = await importTypeScriptWorkspaceDefault("@nseng-ai/ccc/pi/extension");

export default registerCccPiExtension;
