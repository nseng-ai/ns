import type { ExtensionAPI } from "../extension-api.ts";
import { defaultChangesCommand } from "../default-commands/changes.ts";

export default function changesExtension(api: ExtensionAPI): void {
	api.registerCommand(defaultChangesCommand);
}
