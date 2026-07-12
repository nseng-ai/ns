import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const registerCmuxPiExtension = await importTypeScriptWorkspaceDefault("@nseng-ai/cmux/pi/extension");

export default registerCmuxPiExtension;
