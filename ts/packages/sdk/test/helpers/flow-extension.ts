import { fileURLToPath } from "node:url";

import {
	installDescriptorExtension,
	installDescriptorExtensions,
} from "./extension-descriptor-install.ts";

export const FLOW_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../capabilities/flow", import.meta.url),
);
export const SLOTS_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../capabilities/slots", import.meta.url),
);

export function installCheckedInFlowExtension(projectRoot: string): void {
	installDescriptorExtension(projectRoot, FLOW_EXTENSION_SOURCE);
}

export function installCheckedInFlowAndSlotsExtensions(projectRoot: string): void {
	installDescriptorExtensions(projectRoot, [FLOW_EXTENSION_SOURCE, SLOTS_EXTENSION_SOURCE]);
}
