import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const registerCccPiExtension = await importTypeScriptWorkspaceDefault("@ns/ccc/pi/extension");

export default registerCccPiExtension;
