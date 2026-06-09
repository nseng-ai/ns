import { existsSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";

const LEGACY_PACKAGE_MARKER = join("packages", "asdl-pr-address", "pyproject.toml");

export function findLegacyCheckoutRoot(cwd: string): string | undefined {
	let current = resolve(cwd);
	const root = parse(current).root;

	while (true) {
		if (existsSync(join(current, LEGACY_PACKAGE_MARKER))) return current;
		if (current === root) return undefined;
		current = dirname(current);
	}
}
