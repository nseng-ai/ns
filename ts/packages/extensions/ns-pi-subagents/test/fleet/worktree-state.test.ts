import { describe, expect, test } from "vitest";

import { createGitReadHead } from "../../src/fleet/git-head.ts";
import { createGitReadWorktreeState, parseWorktreeState } from "../../src/fleet/worktree-state.ts";

describe("worktree state", () => {
	test("merges status and numstat entries", () => {
		const snapshot = parseWorktreeState({
			statusPorcelain: " M src/fleet/navigator.ts\0?? notes.md\0",
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
		expect(
			parseWorktreeState({ statusPorcelain: "", unstagedNumstat: "", stagedNumstat: "" }),
		).toEqual({ status: "available", files: [] });
	});

	test("keeps binary numstat distinct from zero-line changes", () => {
		const snapshot = parseWorktreeState({
			statusPorcelain: " M image.png\0",
			unstagedNumstat: "-\t-\timage.png\n",
			stagedNumstat: "",
		});

		expect(snapshot).toEqual({
			status: "available",
			files: [{ path: "image.png", status: "M", isBinary: true }],
		});
	});

	test("parses staged renames by new path and leaves no-renames delete numstat entries separate", () => {
		const snapshot = parseWorktreeState({
			statusPorcelain: "R  renamed file ü.ts\0old file ü.ts\0",
			unstagedNumstat: "",
			stagedNumstat: "0\t10\told file ü.ts\n10\t0\trenamed file ü.ts\n",
		});

		expect(snapshot).toEqual({
			status: "available",
			files: [
				{ path: "old file ü.ts", deletions: 10, additions: 0 },
				{ path: "renamed file ü.ts", status: "R", additions: 10, deletions: 0 },
			],
		});
	});

	test("parses paths with spaces and non-ASCII without C-quoting", () => {
		const snapshot = parseWorktreeState({
			statusPorcelain: " M docs/über fleet note.md\0",
			unstagedNumstat: "2\t1\tdocs/über fleet note.md\n",
			stagedNumstat: "",
		});

		expect(snapshot).toEqual({
			status: "available",
			files: [{ path: "docs/über fleet note.md", status: "M", additions: 2, deletions: 1 }],
		});
	});

	test("runs porcelain z status and no-renames numstat commands", async () => {
		const calls: string[] = [];
		const readWorktreeState = createGitReadWorktreeState({
			exec: {
				async exec(command, args) {
					calls.push([command, ...args].join(" "));
					return { type: "exited", stdout: "", stderr: "", code: 0, signal: null };
				},
			},
		});

		await expect(readWorktreeState({ cwd: "/repo" })).resolves.toEqual({
			status: "available",
			files: [],
		});
		expect(calls).toEqual([
			"git status --porcelain -z",
			"git diff --numstat --no-renames --",
			"git diff --cached --numstat --no-renames --",
		]);
	});

	test("turns git command failures into unavailable snapshots", async () => {
		const readWorktreeState = createGitReadWorktreeState({
			exec: {
				async exec(command, args) {
					return {
						type: "exited",
						stdout: "",
						stderr: `${command} ${args.join(" ")} failed noisily`,
						code: 1,
						signal: null,
					};
				},
			},
		});

		await expect(readWorktreeState({ cwd: "/repo" })).resolves.toEqual({
			status: "unavailable",
			reason: "git status --porcelain -z failed noisily",
		});
	});

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
