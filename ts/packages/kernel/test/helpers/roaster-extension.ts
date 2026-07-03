import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROASTER_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../../../.ns/extensions/roaster", import.meta.url),
);

export function installCheckedInRoasterExtension(projectRoot: string): void {
	const destination = join(projectRoot, ".ns", "extensions", "roaster");
	mkdirSync(dirname(destination), { recursive: true });
	cpSync(ROASTER_EXTENSION_SOURCE, destination, { recursive: true });
}
