import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const nsExtension = await importTypeScriptWorkspaceDefault("@nseng-ai/flow/pi/ns-extension");

export default nsExtension;
