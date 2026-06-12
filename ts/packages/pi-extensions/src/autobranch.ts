import { registerAutobranchCommand, type AutobranchExtensionAPI } from "@asdl/ccc/autobranch";
import { registerAutobranchSlotCommand, type AutobranchSlotExtensionAPI } from "@asdl/ccc/autobranch-slot";

export type ExtensionAPI = AutobranchExtensionAPI & AutobranchSlotExtensionAPI;

export default function autobranchExtension(pi: ExtensionAPI): void {
	registerAutobranchCommand(pi);
	registerAutobranchSlotCommand(pi);
}
