import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadEffectiveUserExtensionLayer } from "../../src/extensions/user-extension-layer.ts";

const roots: string[] = [];
const noProjectSources = new Set<string>();

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("effective User extension layer loader", () => {
	test("short-circuits unset and unknown Active harnesses before filesystem access", async () => {
		const inaccessibleHome = "/dev/null/ns-user-extension-layer";

		await expect(
			loadEffectiveUserExtensionLayer({
				homeDir: inaccessibleHome,
				env: {},
				projectSourceIdentities: noProjectSources,
			}),
		).resolves.toEqual({
			decision: { enabled: false, reason: { type: "active-harness-unset" } },
			descriptors: [],
			declaredSourceIdentities: [],
			diagnostics: [],
		});
		await expect(
			loadEffectiveUserExtensionLayer({
				homeDir: inaccessibleHome,
				env: { NS_HARNESS: "browser" },
				projectSourceIdentities: noProjectSources,
			}),
		).resolves.toMatchObject({
			decision: {
				enabled: false,
				reason: { type: "active-harness-unknown", value: "browser" },
			},
			descriptors: [],
			declaredSourceIdentities: [],
			diagnostics: [{ code: "user_extension_layer_unknown_harness" }],
		});
	});

	test.each([
		{
			name: "valid",
			source: 'supported_harnesses = ["pi", "pi", "codex"]\n',
			expected: {
				decision: {
					enabled: true,
					activeHarness: "pi",
					supportedHarnesses: ["pi", "codex"],
				},
				diagnostics: [],
			},
		},
		{
			name: "missing",
			source: "extensions = []\n",
			expected: {
				decision: {
					enabled: false,
					reason: { type: "supported-harnesses-missing", activeHarness: "pi" },
				},
				diagnostics: [],
			},
		},
		{
			name: "invalid",
			source: "supported_harnesses = []\n",
			expected: {
				decision: {
					enabled: false,
					reason: { type: "supported-harnesses-invalid", activeHarness: "pi" },
				},
				diagnostics: [
					{
						code: "user-supported-harnesses-invalid",
						message: expect.stringContaining("must select at least one harness"),
						path: expect.stringContaining("ns.toml"),
					},
				],
			},
		},
		{
			name: "malformed TOML",
			source: "supported_harnesses = [\n",
			expected: {
				decision: {
					enabled: false,
					reason: { type: "supported-harnesses-invalid", activeHarness: "pi" },
				},
				diagnostics: [
					{
						code: "user-supported-harnesses-invalid",
						path: expect.stringContaining("ns.toml"),
					},
					{
						code: "ns_toml_invalid",
						path: expect.stringContaining("ns.toml"),
					},
				],
			},
		},
	] as const)("loads $name supported-harness facts", async ({ source, expected }) => {
		const homeDir = await createHome(source);
		const loaded = await loadEffectiveUserExtensionLayer({
			homeDir,
			env: { NS_HARNESS: "pi" },
			projectSourceIdentities: noProjectSources,
		});

		expect(loaded).toMatchObject(expected);
		expect(loaded.descriptors).toEqual([]);
		expect(loaded.declaredSourceIdentities).toEqual([]);
	});
});

async function createHome(source: string): Promise<string> {
	const homeDir = await mkdtemp(join(tmpdir(), "ns-user-extension-layer-"));
	roots.push(homeDir);
	const configDir = join(homeDir, ".config", "ns");
	await mkdir(configDir, { recursive: true });
	await writeFile(join(configDir, "ns.toml"), source);
	return homeDir;
}
