import { registerLandStackCommand, type LandStackExtensionAPI } from "@asdl/ccc/land-stack";

export type ExtensionAPI = LandStackExtensionAPI;

export default function landStackExtension(pi: ExtensionAPI): void {
	registerLandStackCommand(pi);
}
