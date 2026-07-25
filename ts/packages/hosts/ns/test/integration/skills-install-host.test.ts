import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	createEmptyProject,
	dataFromEnvelope,
	parseJsonOutput,
	runNsCliJson,
} from "../support/cli-harness.ts";

describe("ns CLI skills install host integration", () => {
	test("previews installation without writing the target or manifest", async () => {
		const cwd = await createEmptyProject();
		const run = await runNsCliJson(
			["skills", "install", "objective", "--harness", "pi", "--scope", "project", "--dry-run"],
			cwd,
		);
		const data = dataFromEnvelope(parseJsonOutput(run));
		const targetPath = join(cwd, ".pi", "skills", "objective", "SKILL.md");
		const manifestPath = join(cwd, ".pi", "skills", ".ns-harness-artifacts-manifest.json");

		expect(run.exit).toBe(0);
		expect(data).toMatchObject({ mode: "dry-run", skill: "objective", writtenFiles: [] });
		await expect(access(targetPath)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(access(manifestPath)).rejects.toMatchObject({ code: "ENOENT" });
		expect(run.stderr).toBe("");
	});

	test("installs a skill into a project target and writes the manifest", async () => {
		const cwd = await createEmptyProject();
		const run = await runNsCliJson(
			["skills", "install", "objective", "--harness", "codex", "--scope", "project"],
			cwd,
		);
		const data = dataFromEnvelope(parseJsonOutput(run));
		const targetPath = join(cwd, ".agents", "skills", "objective", "SKILL.md");
		const manifestPath = join(cwd, ".agents", "skills", ".ns-harness-artifacts-manifest.json");
		const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;

		expect(run.exit).toBe(0);
		expect(data).toMatchObject({ mode: "applied", skill: "objective", manifestPath });
		expect(await readFile(targetPath, "utf8")).toContain("# objective");
		expect(manifest).toMatchObject({
			version: 1,
			artifacts: {
				"codex:project:skill:objective-skill": {
					artifactId: "objective-skill",
					provisionName: "objective",
				},
			},
		});
		expect(run.stderr).toBe("");
	});

	test("refuses to overwrite a locally edited installed skill", async () => {
		const cwd = await createEmptyProject();
		const install = await runNsCliJson(
			["skills", "install", "objective", "--harness", "codex", "--scope", "project"],
			cwd,
		);
		const targetPath = join(cwd, ".agents", "skills", "objective", "SKILL.md");
		await writeFile(targetPath, "local edit\n", "utf8");

		const refused = await runNsCliJson(
			["skills", "install", "objective", "--harness", "codex", "--scope", "project"],
			cwd,
		);
		const envelope = parseJsonOutput(refused);

		expect(install.exit).toBe(0);
		expect(refused.exit).toBe(1);
		expect(envelope).toMatchObject({ status: "negative", exitCode: 1 });
		expect(dataFromEnvelope(envelope)).toMatchObject({ conflictingFiles: [targetPath] });
		expect(await readFile(targetPath, "utf8")).toBe("local edit\n");
	});
});
