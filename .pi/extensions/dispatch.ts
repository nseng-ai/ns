import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const registerDispatchPlanPiExtension = await importTypeScriptWorkspaceDefault(
	"@nseng-ai/vercel/pi/extension",
);

export default registerDispatchPlanPiExtension;
