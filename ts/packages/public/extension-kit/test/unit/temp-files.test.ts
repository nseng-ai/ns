import { readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";

import { describe, expect, test } from "vitest";

import { withTemporaryFile, withTemporaryJsonFile } from "@nseng-ai/extension-kit/temp-files";

describe("temporary file helpers", () => {
	test("writes a temporary text file and cleans up after success", async () => {
		let pathAfterCallback = "";

		const text = await withTemporaryFile(
			{ prefix: "ns-core-temp-test-", filename: "body.md", contents: "body\n" },
			async (path) => {
				pathAfterCallback = path;
				return await readFile(path, "utf8");
			},
		);

		expect(text).toBe("body\n");
		await expect(stat(pathAfterCallback)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(stat(dirname(pathAfterCallback))).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("writes JSON and cleans up after callback failure", async () => {
		let pathAfterCallback = "";

		await expect(
			withTemporaryJsonFile({ prefix: "ns-core-json-test-", value: { ok: true } }, async (path) => {
				pathAfterCallback = path;
				expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ ok: true });
				throw new Error("callback failed");
			}),
		).rejects.toThrow("callback failed");
		await expect(stat(pathAfterCallback)).rejects.toMatchObject({ code: "ENOENT" });
	});
});
