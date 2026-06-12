import { registerAutoslotCommand, type AutoslotExtensionAPI } from "@asdl/ccc/autoslot";

export type ExtensionAPI = AutoslotExtensionAPI;

export default function autoslotExtension(pi: ExtensionAPI): void {
	registerAutoslotCommand(pi);
}
