import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const registerSkillBackedCommands = await importTypeScriptWorkspaceDefault(
	"@internal/pi-tools/skill-backed-commands/extension",
);

export default registerSkillBackedCommands;
