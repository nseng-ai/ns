import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
	keywords?: string[];
	pi?: { extensions?: string[] };
};

test("package manifest is discoverable as a Pi package", () => {
	assert.ok(manifest.keywords?.includes("pi-package"));
});

test("package manifest points at the extension entrypoint", () => {
	assert.deepEqual(manifest.pi?.extensions, ["./src/extension/index.ts"]);
});
