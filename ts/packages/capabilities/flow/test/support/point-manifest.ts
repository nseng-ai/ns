import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface TestPointManifestPoint {
	path: readonly [string, ...string[]];
	accepts: "hook" | "prompt";
	cardinality: "many" | "one";
	description?: string;
}

export async function writeTestPointManifest(
	repoRoot: string,
	options: { group: string; points: readonly TestPointManifestPoint[] },
): Promise<void> {
	const extensionDir = join(repoRoot, "extensions", options.group);
	await mkdir(join(extensionDir, "src", "ns"), { recursive: true });
	await writeFile(
		join(extensionDir, "package.json"),
		JSON.stringify(
			{
				name: options.group,
				version: "0.0.0-test",
				exports: { "./ns-extension": "./src/ns/extension.ts" },
			},
			null,
			2,
		),
		"utf8",
	);
	await writeFile(
		join(extensionDir, "src", "ns", "extension.ts"),
		`import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	group: ${JSON.stringify(options.group)},
	points: ${JSON.stringify(
		options.points.map((point) => descriptorPoint(options.group, point)),
		null,
		"\t",
	)},
});
`,
		"utf8",
	);
	await writeFile(
		join(repoRoot, "ns.toml"),
		`extensions = ["./extensions/${options.group}"]\n`,
		"utf8",
	);
}

function descriptorPoint(
	group: string,
	point: TestPointManifestPoint,
): {
	id: string;
	accepts: "hook" | "prompt";
	cardinality: "many" | "one";
	description?: string;
} {
	return {
		id: [group, ...point.path].join("."),
		accepts: point.accepts,
		cardinality: point.cardinality,
		...(point.description === undefined ? {} : { description: point.description }),
	};
}
