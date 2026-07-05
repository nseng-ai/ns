import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const nsExtension = await importTypeScriptWorkspaceDefault("@ns/flow/pi/ns-extension");

export default nsExtension;
