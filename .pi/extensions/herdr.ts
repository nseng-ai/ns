import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const registerHerdrPiExtension = await importTypeScriptWorkspaceDefault(
	"@nseng-ai/herdr/pi/extension",
);

export default registerHerdrPiExtension;
