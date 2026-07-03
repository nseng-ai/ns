import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const registerCccPiExtension = await importTypeScriptWorkspaceDefault("@ji/ccc/pi/extension");

export default registerCccPiExtension;
