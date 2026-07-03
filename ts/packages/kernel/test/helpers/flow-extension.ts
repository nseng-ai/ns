import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FLOW_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../../../.ns/extensions/flow", import.meta.url),
);

export function installCheckedInFlowExtension(projectRoot: string): void {
	const destination = join(projectRoot, ".ns", "extensions", "flow");
	mkdirSync(dirname(destination), { recursive: true });
	cpSync(FLOW_EXTENSION_SOURCE, destination, { recursive: true });
}
