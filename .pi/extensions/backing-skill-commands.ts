import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const registerBackingSkillCommands = await importTypeScriptWorkspaceDefault(
	"@internal/pi-tools/backing-skill-commands/extension",
);

export default registerBackingSkillCommands;
