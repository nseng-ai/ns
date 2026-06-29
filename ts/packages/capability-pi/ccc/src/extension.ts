import { registerCccLegacyPiExtension } from "@sdl/ccc/legacy-pi-extension";
import type { ExtensionAPI } from "@sdl/cmux/types";

export default function registerCccPiExtension(pi: ExtensionAPI): void {
	registerCccLegacyPiExtension(pi);
}

export { registerCccPiExtension };
