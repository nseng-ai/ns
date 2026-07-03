import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HANDOFF_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../../../.ns/extensions/handoff", import.meta.url),
);

export function installCheckedInHandoffExtension(projectRoot: string): void {
	const destination = join(projectRoot, ".ns", "extensions", "handoff");
	mkdirSync(dirname(destination), { recursive: true });
	cpSync(HANDOFF_EXTENSION_SOURCE, destination, { recursive: true });
}
