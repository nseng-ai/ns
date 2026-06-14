import { readFile, stat } from "node:fs/promises";

import { createTempDirTracker, describeNodeRuntimeCliEntrypoint, withTempRepoSkill } from "@asdl/core/testing";
import { expect, test } from "vitest";

test("exports testing helpers through the package testing subpath", () => {
	expect(typeof describeNodeRuntimeCliEntrypoint).toBe("function");
	expect(typeof createTempDirTracker).toBe("function");
	expect(typeof withTempRepoSkill).toBe("function");
});

test("temp dir tracker removes tracked directories", async () => {
	const tempDirs = createTempDirTracker();
	const dir = await tempDirs.makeTempDir("asdl-core-testing-");
	const homeDir = await tempDirs.makeHomeTempDir(".asdl-core-testing-");

	await expect(stat(dir)).resolves.toBeDefined();
	await expect(stat(homeDir)).resolves.toBeDefined();

	await tempDirs.cleanup();
	await tempDirs.cleanup();

	await expect(stat(dir)).rejects.toMatchObject({ code: "ENOENT" });
	await expect(stat(homeDir)).rejects.toMatchObject({ code: "ENOENT" });
});

test("temp repo skill helper writes and removes a repo-local skill", async () => {
	let repoDir = "";
	await withTempRepoSkill({ skillName: "demo-skill", markdown: "# Demo\n" }, async (skill) => {
		repoDir = skill.repoDir;

		expect(await readFile(skill.skillPath, "utf8")).toBe("# Demo\n");
		expect(skill.skillDir).toBe(`${skill.repoDir}/skills/demo-skill`);
	});

	await expect(stat(repoDir)).rejects.toMatchObject({ code: "ENOENT" });
});
