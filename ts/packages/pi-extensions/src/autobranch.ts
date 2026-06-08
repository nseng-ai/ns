import { registerAutobranchCommand, type AutobranchExtensionAPI } from "@asdl/ccc/autobranch";

export type ExtensionAPI = AutobranchExtensionAPI;

export default function autobranchExtension(pi: ExtensionAPI): void {
	registerAutobranchCommand(pi);
}
