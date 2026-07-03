import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	readLocalBranchRefs,
	type LocalBranchRefDirent,
	type LocalBranchRefReaderFs,
} from "@ji/capability-kit/git";

function sortedBranches(branches: ReadonlySet<string>): string[] {
	return [...branches].sort();
}

function expectBranches(commonGitDir: string): string[] {
	const result = readLocalBranchRefs(commonGitDir);
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error(result.message);
	return sortedBranches(result.branches);
}

function dirent(name: string, kind: "directory" | "file" | "other"): LocalBranchRefDirent {
	return {
		name,
		isDirectory() {
			return kind === "directory";
		},
		isFile() {
			return kind === "file";
		},
	};
}

function errno(code: string): Error {
	const error = new Error(code);
	(error as NodeJS.ErrnoException).code = code;
	return error;
}

describe("local branch ref reader", () => {
	test("reads loose root, nested loose, and packed branch refs", () => {
		const dir = mkdtempSync(join(tmpdir(), "ji-git-refs-"));
		try {
			mkdirSync(join(dir, "refs", "heads", "nested"), { recursive: true });
			writeFileSync(join(dir, "refs", "heads", "loose-branch"), "aaa\n");
			writeFileSync(join(dir, "refs", "heads", "nested", "child"), "bbb\n");
			writeFileSync(
				join(dir, "packed-refs"),
				[
					"# pack-refs with: peeled fully-peeled sorted",
					"cccccccccccccccccccccccccccccccccccccccc refs/heads/packed-branch",
					"dddddddddddddddddddddddddddddddddddddddd refs/tags/v1",
					"^eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
					"malformed-line",
					"",
				].join("\n"),
			);

			expect(expectBranches(dir)).toEqual(["loose-branch", "nested/child", "packed-branch"]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("treats missing refs/heads and packed-refs as an empty complete set", () => {
		const dir = mkdtempSync(join(tmpdir(), "ji-git-empty-refs-"));
		try {
			expect(expectBranches(dir)).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("reads packed refs even when loose refs are absent", () => {
		const dir = mkdtempSync(join(tmpdir(), "ji-git-packed-refs-"));
		try {
			writeFileSync(
				join(dir, "packed-refs"),
				"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa refs/heads/packed-only\n",
			);

			expect(expectBranches(dir)).toEqual(["packed-only"]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("returns failure when a nested loose-ref directory cannot be read", () => {
		const fs: LocalBranchRefReaderFs = {
			readdir(path) {
				if (path.endsWith(join("refs", "heads"))) return [dirent("nested", "directory")];
				throw errno("EACCES");
			},
			readFile() {
				throw errno("ENOENT");
			},
		};

		const result = readLocalBranchRefs("/repo/.git", { fs });

		expect(result).toMatchObject({
			ok: false,
			reason: "branch-ref-read-failed",
			path: join("/repo/.git", "refs", "heads", "nested"),
		});
	});

	test("returns failure when packed-refs exists but cannot be read", () => {
		const fs: LocalBranchRefReaderFs = {
			readdir() {
				throw errno("ENOENT");
			},
			readFile() {
				throw errno("EIO");
			},
		};

		const result = readLocalBranchRefs("/repo/.git", { fs });

		expect(result).toMatchObject({
			ok: false,
			reason: "branch-ref-read-failed",
			path: join("/repo/.git", "packed-refs"),
		});
	});
});
