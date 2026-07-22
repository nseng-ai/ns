import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function installDescriptorExtension(projectRoot: string, packageRoot: string): void {
	installDescriptorExtensions(projectRoot, [packageRoot]);
}

export function installDescriptorExtensions(
	projectRoot: string,
	packageRoots: readonly string[],
): void {
	const nsTomlPath = join(projectRoot, "ns.toml");
	const existing = existsSync(nsTomlPath) ? readFileSync(nsTomlPath, "utf8") : "";
	const prefix = existing.trimEnd();
	const extensions = packageRoots.map((packageRoot) => JSON.stringify(packageRoot)).join(", ");
	const next = `${prefix}${prefix === "" ? "" : "\n"}extensions = [${extensions}]\n`;
	mkdirSync(dirname(nsTomlPath), { recursive: true });
	writeFileSync(nsTomlPath, next);
}
