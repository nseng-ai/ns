import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { discoverExtensionsInRoot } from "../../src/extension-discovery.ts";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-extension-discovery-"));
	tempDirs.push(directory);
	return directory;
}

function writeFile(path: string, content = "export default function extension() {}\n"): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("extension discovery", () => {
	test("discovers one-level files, directory indexes, and package manifest entries", async () => {
		const root = await createTempDir();
		writeFile(join(root, "bare.ts"));
		writeFile(join(root, "plain.js"));
		writeFile(join(root, "types.d.ts"), "export interface Ignored {}\n");
		writeFile(join(root, "dir-ts", "index.ts"));
		writeFile(join(root, "dir-js", "index.js"));
		writeFile(join(root, "package-ext", "package.json"), JSON.stringify({ asdl: { extensions: ["./src/index.ts"] } }));
		writeFile(join(root, "package-ext", "src", "index.ts"));

		const result = discoverExtensionsInRoot(root);

		expect(result.diagnostics).toEqual([]);
		expect(result.extensions.map((extension) => [extension.kind, extension.entryPath])).toEqual([
			["file", join(root, "bare.ts")],
			["dir-index", join(root, "dir-js", "index.js")],
			["dir-index", join(root, "dir-ts", "index.ts")],
			["package", join(root, "package-ext", "src", "index.ts")],
			["file", join(root, "plain.js")],
		]);
	});

	test("missing root is okay and file root is an error", async () => {
		const root = await createTempDir();
		const missing = join(root, "missing");
		expect(discoverExtensionsInRoot(missing)).toEqual({ extensions: [], diagnostics: [] });

		const fileRoot = join(root, "not-dir.ts");
		writeFile(fileRoot);
		const result = discoverExtensionsInRoot(fileRoot);
		expect(result.extensions).toEqual([]);
		expect(result.diagnostics[0]).toMatchObject({ code: "extension_root_not_directory" });
	});

	test("malformed package manifests produce structured diagnostics", async () => {
		const root = await createTempDir();
		writeFile(join(root, "bad-json", "package.json"), "{ nope");
		writeFile(join(root, "missing-asdl", "package.json"), JSON.stringify({ name: "missing" }));
		writeFile(join(root, "bad-entry", "package.json"), JSON.stringify({ asdl: { extensions: ["../escape.ts", "/abs.ts", "./types.d.ts", "./missing.ts"] } }));

		const result = discoverExtensionsInRoot(root);

		expect(result.extensions).toEqual([]);
		expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			"extension_manifest_entry_escapes",
			"extension_manifest_entry_not_relative",
			"extension_manifest_entry_unsupported",
			"extension_manifest_entry_missing",
			"extension_manifest_parse_failed",
			"extension_manifest_missing_asdl",
		]);
	});

	test("directory without index or manifest is malformed", async () => {
		const root = await createTempDir();
		mkdirSync(join(root, "empty"), { recursive: true });

		const result = discoverExtensionsInRoot(root);

		expect(result.extensions).toEqual([]);
		expect(result.diagnostics[0]).toMatchObject({ code: "extension_directory_missing_entry" });
	});
});
