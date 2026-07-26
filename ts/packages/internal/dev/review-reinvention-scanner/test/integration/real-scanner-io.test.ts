import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { createTempGitRepo, type TempGitRepo } from "@nseng-ai/foundation/git/testing";

import { RealScannerIo, type DiffRange } from "../../src/git-diff.ts";

interface SeededRepo {
	readonly repo: TempGitRepo;
	readonly range: DiffRange;
	readonly scannerCwd: string;
}

function createSeededRepo(): SeededRepo {
	const repo = createTempGitRepo({ prefix: "ns-reinvention-scanner-" });
	const base = repo.runGit(["rev-parse", "HEAD"]).trim();
	const scannerCwd = join(repo.path, "tools/scanner");
	mkdirSync(scannerCwd, { recursive: true });
	mkdirSync(join(repo.path, "src"), { recursive: true });
	writeFileSync(
		join(repo.path, "src/first.ts"),
		"export const first = 1;\nexport const second = 2;\n",
	);
	repo.runGit(["add", "src/first.ts"]);
	repo.runGit(["commit", "-m", "add first source"]);
	const head = repo.runGit(["rev-parse", "HEAD"]).trim();

	writeFileSync(join(repo.path, "src/later.ts"), "export const later = true;\n");
	repo.runGit(["add", "src/later.ts"]);
	repo.runGit(["commit", "-m", "add later source"]);

	return { repo, range: { base, head }, scannerCwd };
}

describe("RealScannerIo", () => {
	test("anchors subdirectory diffs at the repo root and honors a pinned head", async () => {
		const seeded = createSeededRepo();
		try {
			const io = new RealScannerIo({ cwd: seeded.scannerCwd });

			await expect(io.changedFiles(seeded.range)).resolves.toEqual({
				ok: true,
				value: ["src/first.ts"],
			});
			const addedLines = await io.addedLines(seeded.range, "src/first.ts");
			expect(addedLines.ok).toBe(true);
			if (!addedLines.ok) return;
			expect([...addedLines.value]).toEqual([1, 2]);
		} finally {
			seeded.repo.cleanup();
		}
	});

	test("resolves root-relative file reads from a subdirectory cwd", async () => {
		const seeded = createSeededRepo();
		try {
			const io = new RealScannerIo({ cwd: seeded.scannerCwd });

			await expect(io.readFile("src/first.ts")).resolves.toEqual({
				ok: true,
				value: "export const first = 1;\nexport const second = 2;\n",
			});
		} finally {
			seeded.repo.cleanup();
		}
	});

	test("continues to work when cwd is the repository root", async () => {
		const seeded = createSeededRepo();
		try {
			const io = new RealScannerIo({ cwd: seeded.repo.path });

			await expect(io.changedFiles(seeded.range)).resolves.toEqual({
				ok: true,
				value: ["src/first.ts"],
			});
		} finally {
			seeded.repo.cleanup();
		}
	});
});
