import { describe, expect, test } from "vitest";

import { createGitReadHead } from "../../src/fleet/git-head.ts";
import { createGitReadWorktreeState, parseWorktreeState } from "../../src/fleet/worktree-state.ts";

describe("worktree state", () => {
	test("merges status and numstat entries", () => {
		const snapshot = parseWorktreeState({
			statusShort: " M src/fleet/navigator.ts\n?? notes.md\n",
			unstagedNumstat: "12\t3\tsrc/fleet/navigator.ts\n",
			stagedNumstat: "",
		});

		expect(snapshot).toEqual({
			status: "available",
			files: [
				{ path: "notes.md", status: "??" },
				{ path: "src/fleet/navigator.ts", status: "M", additions: 12, deletions: 3 },
			],
		});
	});

	test("reports clean state when git outputs are empty", () => {
		expect(parseWorktreeState({ statusShort: "", unstagedNumstat: "", stagedNumstat: "" })).toEqual(
			{ status: "available", files: [] },
		);
	});

	test("keeps binary numstat distinct from zero-line changes", () => {
		const snapshot = parseWorktreeState({
			statusShort: " M image.png\n",
			unstagedNumstat: "-\t-\timage.png\n",
			stagedNumstat: "",
		});

		expect(snapshot).toEqual({
			status: "available",
			files: [{ path: "image.png", status: "M", isBinary: true }],
		});
	});

	test("turns git command failures into unavailable snapshots", async () => {
		const readWorktreeState = createGitReadWorktreeState({
			exec: {
				async exec(command, args) {
					return {
						stdout: "",
						stderr: `${command} ${args.join(" ")} failed noisily`,
						code: 1,
						killed: false,
					};
				},
			},
		});

		await expect(readWorktreeState({ cwd: "/repo" })).resolves.toEqual({
			status: "unavailable",
			reason: "git status --short failed noisily",
		});
	});

	test("reads HEAD through a read-only git adapter", async () => {
		const readHead = createGitReadHead({
			exec: {
				async exec() {
					return { stdout: "abcdef123456\n", stderr: "", code: 0, killed: false };
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
					return { stdout: "", stderr: "fatal: not a git repo", code: 128, killed: false };
				},
			},
		});

		await expect(readHead({ cwd: "/repo" })).resolves.toMatchObject({
			status: "unavailable",
			reason: expect.stringContaining("git rev-parse HEAD failed"),
		});
	});
});
