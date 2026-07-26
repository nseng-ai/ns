import { fileURLToPath } from "node:url";

import { installDescriptorExtension } from "./extension-descriptor-install.ts";

export const FLOW_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../../incubating/extensions/flow", import.meta.url),
);

export function installCheckedInFlowExtension(projectRoot: string): void {
	installDescriptorExtension(projectRoot, FLOW_EXTENSION_SOURCE);
}
