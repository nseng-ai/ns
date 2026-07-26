import { fileURLToPath } from "node:url";

import { installDescriptorExtension } from "./extension-descriptor-install.ts";

export const HANDOFF_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../../incubating/extensions/handoffs", import.meta.url),
);

export function installCheckedInHandoffExtension(projectRoot: string): void {
	installDescriptorExtension(projectRoot, HANDOFF_EXTENSION_SOURCE);
}
