import { fileURLToPath } from "node:url";

import { installDescriptorExtension } from "./extension-descriptor-install.ts";

export const RETRO_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../capabilities/retros", import.meta.url),
);

export function installCheckedInRetroExtension(projectRoot: string): void {
	installDescriptorExtension(projectRoot, RETRO_EXTENSION_SOURCE);
}
