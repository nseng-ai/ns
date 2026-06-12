import { stat } from "node:fs/promises";

import { createTempDirTracker, describeNodeRuntimeCliEntrypoint } from "@asdl/core/testing";
import { expect, test } from "vitest";

test("exports testing helpers through the package testing subpath", () => {
	expect(typeof describeNodeRuntimeCliEntrypoint).toBe("function");
	expect(typeof createTempDirTracker).toBe("function");
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
