import { fileURLToPath } from "node:url";

import { installDescriptorExtension } from "./extension-descriptor-install.ts";

export const OBJECTIVE_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../../incubating/extensions/objectives", import.meta.url),
);

export function installCheckedInObjectiveExtension(projectRoot: string): void {
	installDescriptorExtension(projectRoot, OBJECTIVE_EXTENSION_SOURCE);
}
