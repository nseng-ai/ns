import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadSourceDevNsCommandSources } from "../../src/extensions/source-dev-sources.ts";

const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true });
});

describe("source-dev ns command sources", () => {
	test("discovers workspace extension packages beneath the packages root", async () => {
		const checkout = await createCheckout();
		const packagesRoot = path.join(checkout, "ts", "packages");
		const commandDirectory = path.join(packagesRoot, "incubating", "extensions", "alpha", "cli");
		writeWorkspaceExtension(packagesRoot, "incubating/extensions/alpha", "@example/alpha", {
			description: "Alpha commands.",
			commandDirectory,
		});
		writeWorkspaceExtension(packagesRoot, "incubating/extensions/metadata", "@example/metadata", {
			description: "Metadata only.",
		});

		const loaded = await loadSourceDevNsCommandSources({
			cwd: checkout,
			contributedPackageNames: new Set(),
			packagesRoot,
		});

		expect(loaded.diagnostics).toEqual([]);
		expect(loaded.sources).toMatchObject([
			{
				label: `source-dev:${path.join("incubating", "extensions", "alpha")}`,
				kind: "preinstalled",
				origin: "package",
				helpClassification: "extension",
				package: { name: "@example/alpha", version: "1.0.0" },
				commandDirectory,
			},
			{
				label: `source-dev:${path.join("incubating", "extensions", "metadata")}`,
				kind: "preinstalled",
				origin: "package",
				package: { name: "@example/metadata", version: "1.0.0" },
			},
		]);
		expect(loaded.sources[1]).not.toHaveProperty("commandDirectory");
	});

	test("skips packages already contributed by declared sources", async () => {
		const checkout = await createCheckout();
		const packagesRoot = path.join(checkout, "ts", "packages");
		writeWorkspaceExtension(packagesRoot, "incubating/extensions/alpha", "@example/alpha", {
			description: "Alpha commands.",
		});

		const loaded = await loadSourceDevNsCommandSources({
			cwd: checkout,
			contributedPackageNames: new Set(["@example/alpha"]),
			packagesRoot,
		});

		expect(loaded.sources).toEqual([]);
		expect(loaded.diagnostics).toEqual([]);
	});

	test("silently ignores packages without an ns extension descriptor export", async () => {
		const checkout = await createCheckout();
		const packagesRoot = path.join(checkout, "ts", "packages");
		const plainRoot = path.join(packagesRoot, "internal", "dev", "plain");
		mkdirSync(plainRoot, { recursive: true });
		writeFileSync(
			path.join(plainRoot, "package.json"),
			JSON.stringify({ name: "@example/plain", version: "1.0.0", type: "module" }),
		);

		const loaded = await loadSourceDevNsCommandSources({
			cwd: checkout,
			contributedPackageNames: new Set(),
			packagesRoot,
		});

		expect(loaded.sources).toEqual([]);
		expect(loaded.diagnostics).toEqual([]);
	});

	test("reports a diagnostic when a declared descriptor export does not resolve", async () => {
		const checkout = await createCheckout();
		const packagesRoot = path.join(checkout, "ts", "packages");
		const brokenRoot = path.join(packagesRoot, "incubating", "extensions", "broken");
		mkdirSync(brokenRoot, { recursive: true });
		writeFileSync(
			path.join(brokenRoot, "package.json"),
			JSON.stringify({
				name: "@example/broken",
				version: "1.0.0",
				type: "module",
				exports: { "./ns-extension": "./src/ns-extension.ts" },
			}),
		);

		const loaded = await loadSourceDevNsCommandSources({
			cwd: checkout,
			contributedPackageNames: new Set(),
			packagesRoot,
		});

		expect(loaded.sources).toEqual([]);
		expect(loaded.diagnostics).toMatchObject([
			{
				severity: "error",
				code: "extension_descriptor_export_missing_file",
				sourceLabel: `source-dev:${path.join("incubating", "extensions", "broken")}`,
			},
		]);
	});

	test("does not discover packages under node_modules", async () => {
		const checkout = await createCheckout();
		const packagesRoot = path.join(checkout, "ts", "packages");
		writeWorkspaceExtension(packagesRoot, "node_modules/evil", "@example/evil", {
			description: "Must not be discovered.",
		});

		const loaded = await loadSourceDevNsCommandSources({
			cwd: checkout,
			contributedPackageNames: new Set(),
			packagesRoot,
		});

		expect(loaded.sources).toEqual([]);
	});

	test("contributes nothing when the invocation cwd is outside the checkout", async () => {
		const checkout = await createCheckout();
		const packagesRoot = path.join(checkout, "ts", "packages");
		writeWorkspaceExtension(packagesRoot, "incubating/extensions/alpha", "@example/alpha", {
			description: "Alpha commands.",
		});
		const outside = await mkdtemp(path.join(tmpdir(), "ns-source-dev-outside-"));
		tempDirectories.push(outside);

		const loaded = await loadSourceDevNsCommandSources({
			cwd: outside,
			contributedPackageNames: new Set(),
			packagesRoot,
		});

		expect(loaded.sources).toEqual([]);
		expect(loaded.diagnostics).toEqual([]);
	});
});

async function createCheckout(): Promise<string> {
	const checkout = await mkdtemp(path.join(tmpdir(), "ns-source-dev-checkout-"));
	tempDirectories.push(checkout);
	// The gate requires the packages root to look like an ns source checkout.
	mkdirSync(path.join(checkout, "ts", "packages", "public", "sdk", "src"), { recursive: true });
	return checkout;
}

function writeWorkspaceExtension(
	packagesRoot: string,
	relativePackageDir: string,
	packageName: string,
	descriptor: Record<string, unknown>,
): void {
	const root = path.join(packagesRoot, relativePackageDir);
	mkdirSync(path.join(root, "src"), { recursive: true });
	writeFileSync(
		path.join(root, "package.json"),
		JSON.stringify({
			name: packageName,
			version: "1.0.0",
			type: "module",
			exports: { "./ns-extension": "./src/ns-extension.ts" },
		}),
	);
	writeFileSync(
		path.join(root, "src", "ns-extension.ts"),
		`export default ${JSON.stringify(descriptor)};\n`,
	);
}
