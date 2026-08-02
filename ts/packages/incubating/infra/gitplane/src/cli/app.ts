import path from "node:path";
import { createClinkrApp } from "@nseng-ai/clinkr/app";
import type { GitplaneCliContext } from "./context.ts";

export const VERSION = "0.1.4";

export function createGitplaneCliApp() {
	return createClinkrApp<GitplaneCliContext>({
		name: "gitplane",
		commandDirectory: pathForCommands(),
		requiresContext: true,
		version: VERSION,
		runtimeInfo: () => `gitplane ${VERSION}\nnode ${process.version}\n`,
	});
}
function pathForCommands(): string {
	return path.join(import.meta.dirname, "commands");
}
