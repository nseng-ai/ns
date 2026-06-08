import { registerLandCommand, type LandExtensionAPI } from "@asdl/ccc/land";

export type ExtensionAPI = LandExtensionAPI;

export default function landExtension(pi: ExtensionAPI): void {
	registerLandCommand(pi);
}
