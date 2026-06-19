import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	buildClaimProjectFiles,
	buildNpmClaimProjectFiles,
	writeClaimFiles,
} from "../../src/claim.ts";

describe("claim project file plans", () => {
	test("buildClaimProjectFiles derives PyPI placeholder paths and contents", () => {
		const files = buildClaimProjectFiles({
			packageName: "Foo-Bar",
			moduleName: "foo_bar",
			description: "A placeholder",
			version: "1.2.3",
		});

		expect(files.map((file) => file.relativePath)).toEqual([
			"pyproject.toml",
			"src/foo_bar/__init__.py",
		]);
		expect(files[0]?.contents).toContain('name = "Foo-Bar"');
		expect(files[0]?.contents).toContain('version = "1.2.3"');
		expect(files[1]?.contents).toContain('__version__ = "1.2.3"');
	});

	test("buildNpmClaimProjectFiles derives npm placeholder paths and package files", () => {
		const files = buildNpmClaimProjectFiles({
			packageName: "@scope/pkg",
			description: "A placeholder",
			version: "0.0.1",
			license: "MIT",
		});

		expect(files.map((file) => file.relativePath)).toEqual([
			"package.json",
			"README.md",
			"index.js",
		]);
		expect(files[0]?.contents).toContain('"name": "@scope/pkg"');
		expect(files[0]?.contents).toContain('"files": [\n    "README.md",\n    "index.js"\n  ]');
		expect(files[1]?.contents).toContain("# @scope/pkg");
		expect(files[2]?.contents).toContain("Claimed package name placeholder");
	});

	test("writeClaimFiles writes planned files without overwriting existing targets", () => {
		const projectDir = mkdtempSync(join(tmpdir(), "packagechk-claim-test-"));
		try {
			writeClaimFiles(projectDir, [
				{ relativePath: "nested/file.txt", contents: "first\n" },
				{ relativePath: "README.md", contents: "second\n" },
			]);

			expect(readFileSync(join(projectDir, "nested", "file.txt"), "utf8")).toBe("first\n");
			expect(readFileSync(join(projectDir, "README.md"), "utf8")).toBe("second\n");
			expect(existsSync(join(projectDir, "nested"))).toBe(true);
			expect(() =>
				writeClaimFiles(projectDir, [{ relativePath: "README.md", contents: "replacement\n" }]),
			).toThrow(/claim project file already exists/);
		} finally {
			rmSync(projectDir, { recursive: true, force: true });
		}
	});
});
