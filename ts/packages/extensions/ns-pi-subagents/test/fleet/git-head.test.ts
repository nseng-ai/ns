import { describe, expect, test } from "vitest";

import { createGitReadHead } from "../../src/fleet/git-head.ts";

describe("git head", () => {
	test("reads HEAD through a read-only git adapter", async () => {
		const readHead = createGitReadHead({
			exec: {
				async exec() {
					return { type: "exited", stdout: "abcdef123456\n", stderr: "", code: 0, signal: null };
				},
			},
		});

		await expect(readHead({ cwd: "/repo" })).resolves.toEqual({
			status: "available",
			oid: "abcdef123456",
		});
	});

	test("turns HEAD read failures into unavailable snapshots", async () => {
		const readHead = createGitReadHead({
			exec: {
				async exec() {
					return {
						type: "exited",
						stdout: "",
						stderr: "fatal: not a git repo",
						code: 128,
						signal: null,
					};
				},
			},
		});

		await expect(readHead({ cwd: "/repo" })).resolves.toMatchObject({
			status: "unavailable",
			reason: expect.stringContaining("git rev-parse HEAD failed"),
		});
	});
});
