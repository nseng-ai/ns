import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface TestPointManifestPoint {
	path: readonly [string, ...string[]];
	accepts: "hook" | "prompt";
	semantics: "additive" | "override";
	description?: string;
}

export async function writeTestPointManifest(
	repoRoot: string,
	options: { group: string; points: readonly TestPointManifestPoint[] },
): Promise<void> {
	const extensionDir = join(repoRoot, ".ns", "extensions", options.group);
	await mkdir(extensionDir, { recursive: true });
	await writeFile(
		join(extensionDir, "package.json"),
		JSON.stringify({
			ns: {
				group: options.group,
				points: options.points,
			},
		}),
		"utf8",
	);
}
