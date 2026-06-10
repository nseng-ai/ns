import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Whether this module is the process entrypoint, for runtimes where
 * `import.meta.main` is unavailable. Entrypoint footers pair the two:
 * `if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1]))`.
 */
export function isDirectCliInvocation(metaUrl: string, argvPath: string | undefined): boolean {
	if (argvPath === undefined) return false;

	try {
		const modulePath = realpathSync(fileURLToPath(metaUrl));
		const entryPath = realpathSync(resolve(argvPath));
		return modulePath === entryPath;
	} catch {
		return false;
	}
}
