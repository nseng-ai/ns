import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ARETRO_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../../../.sdl/extensions/aretro", import.meta.url),
);

export function installCheckedInAretroExtension(projectRoot: string): void {
	const destination = join(projectRoot, ".sdl", "extensions", "aretro");
	mkdirSync(dirname(destination), { recursive: true });
	cpSync(ARETRO_EXTENSION_SOURCE, destination, { recursive: true });
}
