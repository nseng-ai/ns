import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const OBJECTIVE_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../../../.sdl/extensions/objective", import.meta.url),
);

export function installCheckedInObjectiveExtension(projectRoot: string): void {
	const destination = join(projectRoot, ".sdl", "extensions", "objective");
	mkdirSync(dirname(destination), { recursive: true });
	cpSync(OBJECTIVE_EXTENSION_SOURCE, destination, { recursive: true });
}
