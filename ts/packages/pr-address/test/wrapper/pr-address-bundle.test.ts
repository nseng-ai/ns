import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

import { buildPrAddressBundle } from "../../scripts/bundle.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../../../", import.meta.url)));
const BUNDLE = join(REPO_ROOT, "skills/pr-address/scripts/pr-address.bundle.mjs");

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "pr-address-bundle-"));
	tempDirs.push(dir);
	return dir;
}

/** Copies the checked-in bundle into an empty temp dir so the run cannot reach any node_modules. */
async function copyBundleToIsolatedDir(): Promise<string> {
	const dir = await makeTempDir();
	const bundleCopy = join(dir, "pr-address.bundle.mjs");
	await copyFile(BUNDLE, bundleCopy);
	return bundleCopy;
}

describe("pr-address bundled artifact", () => {
	test("checked-in bundle is up to date with the TypeScript sources", async () => {
		const dir = await makeTempDir();
		const rebuiltPath = join(dir, "pr-address.bundle.mjs");
		await buildPrAddressBundle(rebuiltPath);

		const rebuilt = await readFile(rebuiltPath, "utf8");
		const checkedIn = await readFile(BUNDLE, "utf8");

		// On mismatch, regenerate with: pnpm --dir ts/packages/pr-address run bundle
		expect(checkedIn).toBe(rebuilt);
	});

	test("bundle runs standalone without node_modules", async () => {
		const bundleCopy = await copyBundleToIsolatedDir();

		const result = spawnSync(process.execPath, [bundleCopy, "--version"], {
			cwd: join(bundleCopy, ".."),
			encoding: "utf8",
		});

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("0.1.0\n");
	});

	test("bundle serves --json-schema routes standalone", async () => {
		const bundleCopy = await copyBundleToIsolatedDir();

		const result = spawnSync(process.execPath, [bundleCopy, "exec", "classification-template", "--json-schema"], {
			cwd: join(bundleCopy, ".."),
			encoding: "utf8",
		});

		expect(result.status, result.stderr).toBe(0);
		const document: unknown = JSON.parse(result.stdout);
		expect(document).toHaveProperty("input_json_schema");
		expect(document).toHaveProperty("output_json_schema");
	});

	test("bundle emits machine envelopes standalone", async () => {
		const bundleCopy = await copyBundleToIsolatedDir();

		const result = spawnSync(process.execPath, [bundleCopy, "exec", "validate-feedback-classification", "--format", "json"], {
			cwd: join(bundleCopy, ".."),
			input: '{"not":"a-wrapper"}',
			encoding: "utf8",
		});

		expect(result.status).toBe(2);
		const envelope: unknown = JSON.parse(result.stdout);
		expect(envelope).toMatchObject({ exit_code: 2, error_type: "invalid_request" });
	});
});
