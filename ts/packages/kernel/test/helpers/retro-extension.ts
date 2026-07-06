import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RETRO_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../../../.ns/extensions/retro", import.meta.url),
);

export function installCheckedInRetroExtension(projectRoot: string): void {
	const destination = join(projectRoot, ".ns", "extensions", "retro");
	mkdirSync(dirname(destination), { recursive: true });
	cpSync(RETRO_EXTENSION_SOURCE, destination, { recursive: true });
}
