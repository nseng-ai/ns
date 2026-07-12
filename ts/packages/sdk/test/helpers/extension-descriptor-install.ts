import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function installDescriptorExtension(projectRoot: string, packageRoot: string): void {
	const nsTomlPath = join(projectRoot, "ns.toml");
	const existing = existsSync(nsTomlPath) ? readFileSync(nsTomlPath, "utf8") : "";
	const prefix = existing.trimEnd();
	const next = `${prefix}${prefix === "" ? "" : "\n"}extensions = [${JSON.stringify(packageRoot)}]\n`;
	mkdirSync(dirname(nsTomlPath), { recursive: true });
	writeFileSync(nsTomlPath, next);
}
