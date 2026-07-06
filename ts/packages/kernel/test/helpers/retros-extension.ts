import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RETROS_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../../../.ns/extensions/retros", import.meta.url),
);

export function installCheckedInRetrosExtension(projectRoot: string): void {
	const destination = join(projectRoot, ".ns", "extensions", "retros");
	mkdirSync(dirname(destination), { recursive: true });
	cpSync(RETROS_EXTENSION_SOURCE, destination, { recursive: true });
}
