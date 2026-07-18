import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";

import {
	getProjectConfigSetting,
	loadEffectiveProjectConfig,
	nodeProjectConfigGateway,
	type SettingsSchema,
} from "../../src/project-config/points.ts";

const roots: string[] = [];
const modelShortcutsSettingsSchema = {
	path: ["pi", "model-shortcuts"] as const,
	schema: z.object({ sonnet: z.string() }),
} satisfies SettingsSchema<{ sonnet: string }>;

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("effective project config loader", () => {
	test("resolves checkout-local settings independently through the node gateway", async () => {
		const root = await mkdtemp(join(tmpdir(), "ns-effective-project-config-"));
		roots.push(root);
		const checkoutA = join(root, "checkout-a");
		const checkoutB = join(root, "checkout-b");
		await Promise.all([mkdir(checkoutA), mkdir(checkoutB)]);
		const baseConfig = `[pi.model-shortcuts]\nsonnet = "anthropic/base"\n`;
		await Promise.all([
			writeFile(join(checkoutA, "ns.toml"), baseConfig),
			writeFile(join(checkoutB, "ns.toml"), baseConfig),
			writeFile(
				join(checkoutA, "ns.local.toml"),
				`[pi.model-shortcuts]\nsonnet = "anthropic/checkout-a"\n`,
			),
			writeFile(
				join(checkoutB, "ns.local.toml"),
				`[pi.model-shortcuts]\nsonnet = "anthropic/checkout-b"\n`,
			),
		]);

		const loadedA = loadEffectiveProjectConfig({
			repoRoot: checkoutA,
			gateway: nodeProjectConfigGateway,
			pointDefinitions: [],
			settingsSchemas: [modelShortcutsSettingsSchema],
		});
		const loadedB = loadEffectiveProjectConfig({
			repoRoot: checkoutB,
			gateway: nodeProjectConfigGateway,
			pointDefinitions: [],
			settingsSchemas: [modelShortcutsSettingsSchema],
		});

		expect(loadedA).toMatchObject({ ok: true });
		expect(loadedB).toMatchObject({ ok: true });
		if (!loadedA.ok || !loadedB.ok) return;
		expect(getProjectConfigSetting(loadedA.config, modelShortcutsSettingsSchema)).toEqual({
			sonnet: "anthropic/checkout-a",
		});
		expect(getProjectConfigSetting(loadedB.config, modelShortcutsSettingsSchema)).toEqual({
			sonnet: "anthropic/checkout-b",
		});
	});
});
