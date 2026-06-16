import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { brmemMissing, brmemOk } from "../../src/contracts.ts";
import { FakeBrmemGateway } from "../../src/fake-gateway.ts";
import type { EntryContent, EntryDiagnostic, ListedEntry } from "../../src/gateway.ts";
import { RealGitBrmemGateway } from "../../src/real-git-gateway.ts";
import { mustEntryRef } from "../../src/ref-layout.ts";
import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";
import { createTempGitRepo } from "../support/temp-git-repo.ts";

describe("export operation", () => {
	it("shows the public help and JSON schema surface", async () => {
		const help = runScenario(["export", "-h"]);
		expect(await help.exit).toBe(0);
		const text = help.stdout.join("");
		for (const flag of ["--output-dir", "--namespace", "--branch", "--overwrite", "--dry-run", "--format", "--json-schema"]) {
			expect(text).toContain(flag);
		}
		expect(text).not.toContain("--all-branches");
		expect(text).not.toContain("[output-dir]");

		const schema = runScenario(["export", "--json-schema"], { fake: { currentBranch: { type: "detached" } } });
		expect(await schema.exit).toBe(0);
		const document = JSON.parse(schema.stdout.join(""));
		expect(document).toHaveProperty("input_json_schema");
		expect(document).toHaveProperty("output_json_schema");
	});

	it("exports only Base Namespace Entries by default and prints useful human output", async () => {
		const root = await makeTempDir();
		try {
			const outputDir = join(root, "exported");
			const run = runScenario(["export", "--output-dir", outputDir], {
				fake: {
					entries: [
						{ namespace: "base", branch: "main", key: "plan.md", content: "plan\n", headSha: "head-plan" },
						{ namespace: "base", branch: "main", key: "nested/body.md", content: "body\n", headSha: "head-body" },
						{ namespace: "scratch", branch: "main", key: "private.md", content: "private\n" },
					],
				},
			});
			expect(await run.exit).toBe(0);
			expect(await readFile(join(outputDir, "plan.md"), "utf8")).toBe("plan\n");
			expect(await readFile(join(outputDir, "nested", "body.md"), "utf8")).toBe("body\n");
			const output = run.stdout.join("");
			expect(output).toContain("Exported");
			expect(output).toContain("2 base Entries");
			expect(output).toContain("Branch main");
			expect(output).toContain(outputDir);
			expect(output).toContain(`plan.md -> ${join(outputDir, "plan.md")}`);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("supports --namespace base and named Namespace export with JSON compatibility fields", async () => {
		const root = await makeTempDir();
		try {
			const baseDir = join(root, "base");
			const namedDir = join(root, "named");
			const fake = {
				entries: [
					{ namespace: "base", branch: "main", key: "base.md", content: "base", headSha: "head-base" },
					{ namespace: "scratch", branch: "main", key: "a.md", content: "A", headSha: "head-a" },
					{ namespace: "scratch", branch: "main", key: "b.md", content: "B", headSha: "head-b" },
				],
			};
			const base = runScenario(["export", "--namespace", "base", "--output-dir", baseDir, "--format", "json"], { fake });
			expect(await base.exit).toBe(0);
			expect(parseJsonOutput(base)).toMatchObject({
				exit_code: 0,
				data: { namespace: "base", branch: "main", output_dir: baseDir, overwrite: false, dry_run: false, exported: [{ key: "base.md" }] },
			});

			const named = runScenario(["export", "--namespace", "scratch", "--output-dir", namedDir, "--format", "json"], { fake });
			expect(await named.exit).toBe(0);
			expect(parseJsonOutput(named)).toMatchObject({
				data: {
					namespace: "scratch",
					exported: [
						{ key: "a.md", path: join(namedDir, "a.md"), ref_name: "refs/brmem/ns/scratch/main:a.md", size_bytes: 1 },
						{ key: "b.md", path: join(namedDir, "b.md"), ref_name: "refs/brmem/ns/scratch/main:b.md", size_bytes: 1 },
					],
				},
			});
			expect(await readFile(join(namedDir, "a.md"), "utf8")).toBe("A");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("handles explicit branch override and detached HEAD", async () => {
		const root = await makeTempDir();
		try {
			const explicit = runScenario(["export", "--branch", "feat/other", "--output-dir", join(root, "explicit"), "--format", "json"], {
				fake: {
					currentBranch: { type: "detached" },
					entries: [{ namespace: "base", branch: "feat/other", key: "note.md", content: "note" }],
				},
			});
			expect(await explicit.exit).toBe(0);
			expect(parseJsonOutput(explicit)).toMatchObject({ data: { branch: "feat/other", exported: [{ ref_name: "refs/brmem/base/feat---other:note.md" }] } });

			const detached = runScenario(["export", "--output-dir", join(root, "detached"), "--format", "json"], { fake: { currentBranch: { type: "detached" } } });
			expect(await detached.exit).toBe(2);
			expect(parseJsonOutput(detached)).toMatchObject({ exit_code: 2, error_type: "detached_head" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("creates a fresh temp output directory when --output-dir is omitted", async () => {
		const run = runScenario(["export", "--format", "json"], { fake: { entries: [{ namespace: "base", branch: "main", key: "temp.md", content: "temp" }] } });
		expect(await run.exit).toBe(0);
		const parsed = parseJsonOutput(run) as { data: { output_dir: string; exported: readonly { path: string }[] } };
		const [exported] = parsed.data.exported;
		expect(exported).toBeDefined();
		try {
			expect(basename(parsed.data.output_dir)).toMatch(/^brmem-export-[0-9a-f]{16}$/u);
			expect(await readFile(exported?.path ?? "", "utf8")).toBe("temp");
		} finally {
			await rm(parsed.data.output_dir, { recursive: true, force: true });
		}
	});

	it("resolves relative output directories under the CLI cwd", async () => {
		const root = await makeTempDir();
		try {
			const run = runScenario(["export", "--output-dir", "relative/export", "--format", "json"], {
				cwd: root,
				fake: { entries: [{ namespace: "base", branch: "main", key: "rel.md", content: "rel" }] },
			});
			expect(await run.exit).toBe(0);
			const outputDir = join(root, "relative", "export");
			expect(parseJsonOutput(run)).toMatchObject({ data: { output_dir: outputDir, exported: [{ path: join(outputDir, "rel.md") }] } });
			expect(await readFile(join(outputDir, "rel.md"), "utf8")).toBe("rel");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("returns negative exit 0 for empty selection without creating the output directory", async () => {
		const root = await makeTempDir();
		try {
			const outputDir = join(root, "empty");
			const run = runScenario(["export", "--output-dir", outputDir, "--format", "json"], {
				fake: { entries: [{ namespace: "scratch", branch: "main", key: "other.md", content: "other" }] },
			});
			expect(await run.exit).toBe(0);
			expect(parseJsonOutput(run)).toMatchObject({ exit_code: 0, message: "No base Entries found on Branch main.", data: { exported: [], output_dir: outputDir } });
			await expect(readFile(outputDir, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

			const namedOutputDir = join(root, "named-empty");
			const named = runScenario(["export", "--namespace", "scratch", "--output-dir", namedOutputDir, "--format", "json"], {
				fake: { entries: [{ namespace: "base", branch: "main", key: "base.md", content: "base" }] },
			});
			expect(await named.exit).toBe(0);
			expect(parseJsonOutput(named)).toMatchObject({ exit_code: 0, message: "No Entries found on Branch main in Namespace scratch.", data: { exported: [], output_dir: namedOutputDir } });
			await expect(readFile(namedOutputDir, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("supports shell exit code mode for empty export selection", async () => {
		const root = await makeTempDir();
		try {
			const outputDir = join(root, "empty-shell");
			const run = runScenario(["export", "--output-dir", outputDir, "--format", "json", "--shell-exit-code"], {
				fake: { entries: [{ namespace: "scratch", branch: "main", key: "other.md", content: "other" }] },
			});
			expect(await run.exit).toBe(1);
			expect(parseJsonOutput(run)).toMatchObject({ exit_code: 1, message: "No base Entries found on Branch main." });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("handles overwrite, target conflicts, and no partial writes", async () => {
		const root = await makeTempDir();
		try {
			const conflictDir = join(root, "conflict");
			await mkdir(conflictDir);
			await writeFile(join(conflictDir, "a.md"), "old", "utf8");
			const conflict = runScenario(["export", "--output-dir", conflictDir, "--format", "json"], {
				fake: { entries: [{ namespace: "base", branch: "main", key: "a.md", content: "new" }, { namespace: "base", branch: "main", key: "b.md", content: "sibling" }] },
			});
			expect(await conflict.exit).toBe(2);
			expect(parseJsonOutput(conflict)).toMatchObject({ error_type: "target_exists" });
			expect(await readFile(join(conflictDir, "a.md"), "utf8")).toBe("old");
			await expect(readFile(join(conflictDir, "b.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });

			const overwrite = runScenario(["export", "--output-dir", conflictDir, "--overwrite", "--format", "json"], {
				fake: { entries: [{ namespace: "base", branch: "main", key: "a.md", content: "new" }] },
			});
			expect(await overwrite.exit).toBe(0);
			expect(await readFile(join(conflictDir, "a.md"), "utf8")).toBe("new");

			await mkdir(join(root, "dir-target"));
			await mkdir(join(root, "dir-target", "target.md"));
			const dirTarget = runScenario(["export", "--output-dir", join(root, "dir-target"), "--format", "json"], {
				fake: { entries: [{ namespace: "base", branch: "main", key: "target.md", content: "new" }] },
			});
			expect(await dirTarget.exit).toBe(2);
			expect(parseJsonOutput(dirTarget)).toMatchObject({ error_type: "target_is_directory" });

			const outputFile = join(root, "not-dir");
			await writeFile(outputFile, "file", "utf8");
			const notDir = runScenario(["export", "--output-dir", outputFile, "--format", "json"], {
				fake: { entries: [{ namespace: "base", branch: "main", key: "x.md", content: "x" }] },
			});
			expect(await notDir.exit).toBe(2);
			expect(parseJsonOutput(notDir)).toMatchObject({ error_type: "output_dir_not_directory" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("keeps dry-run non-mutating while still performing preflight", async () => {
		const root = await makeTempDir();
		try {
			const safeDir = join(root, "safe");
			const safe = runScenario(["export", "--output-dir", safeDir, "--dry-run", "--format", "json"], {
				fake: { entries: [{ namespace: "base", branch: "main", key: "dry.md", content: "dry" }] },
			});
			expect(await safe.exit).toBe(0);
			expect(parseJsonOutput(safe)).toMatchObject({ data: { dry_run: true, exported: [{ key: "dry.md" }] } });
			await expect(readFile(join(safeDir, "dry.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });

			const conflictDir = join(root, "conflict");
			await mkdir(conflictDir);
			await writeFile(join(conflictDir, "dry.md"), "old", "utf8");
			const conflict = runScenario(["export", "--output-dir", conflictDir, "--dry-run", "--format", "json"], {
				fake: { entries: [{ namespace: "base", branch: "main", key: "dry.md", content: "new" }] },
			});
			expect(await conflict.exit).toBe(2);
			expect(parseJsonOutput(conflict)).toMatchObject({ error_type: "target_exists" });

			const overwrite = runScenario(["export", "--output-dir", conflictDir, "--dry-run", "--overwrite"], {
				fake: { entries: [{ namespace: "base", branch: "main", key: "dry.md", content: "new" }] },
			});
			expect(await overwrite.exit).toBe(0);
			expect(overwrite.stdout.join("")).toContain("Would export");
			expect(await readFile(join(conflictDir, "dry.md"), "utf8")).toBe("old");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects symlink and parent path hazards", async () => {
		const root = await makeTempDir();
		try {
			const outputLink = join(root, "broken-output");
			await symlink(join(root, "missing-output"), outputLink);
			const brokenOutput = runScenario(["export", "--output-dir", outputLink, "--format", "json"], {
				fake: { entries: [{ namespace: "base", branch: "main", key: "x.md", content: "x" }] },
			});
			expect(await brokenOutput.exit).toBe(2);
			expect(parseJsonOutput(brokenOutput)).toMatchObject({ error_type: "unsafe_output_dir" });

			const targetDir = join(root, "target-link");
			await mkdir(targetDir);
			await symlink(join(root, "missing-target"), join(targetDir, "x.md"));
			const targetLink = runScenario(["export", "--output-dir", targetDir, "--format", "json"], {
				fake: { entries: [{ namespace: "base", branch: "main", key: "x.md", content: "x" }] },
			});
			expect(await targetLink.exit).toBe(2);
			expect(parseJsonOutput(targetLink)).toMatchObject({ error_type: "unsafe_target_path" });

			const parentFileDir = join(root, "parent-file");
			await mkdir(parentFileDir);
			await writeFile(join(parentFileDir, "parent"), "file", "utf8");
			const parentFile = runScenario(["export", "--output-dir", parentFileDir, "--format", "json"], {
				fake: { entries: [{ namespace: "base", branch: "main", key: "parent/x.md", content: "x" }] },
			});
			expect(await parentFile.exit).toBe(2);
			expect(parseJsonOutput(parentFile)).toMatchObject({ error_type: "parent_not_directory" });

			const parentLinkDir = join(root, "parent-link");
			await mkdir(parentLinkDir);
			await mkdir(join(root, "real-parent"));
			await symlink(join(root, "real-parent"), join(parentLinkDir, "parent"));
			const parentLink = runScenario(["export", "--output-dir", parentLinkDir, "--format", "json"], {
				fake: { entries: [{ namespace: "base", branch: "main", key: "parent/x.md", content: "x" }] },
			});
			expect(await parentLink.exit).toBe(2);
			expect(parseJsonOutput(parentLink)).toMatchObject({ error_type: "unsafe_parent_path" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects symlink parent hazards before following the symlink target type", async () => {
		const root = await makeTempDir();
		try {
			const outputDir = join(root, "parent-link-to-file");
			await mkdir(outputDir);
			const regularTarget = join(root, "regular-target");
			await writeFile(regularTarget, "file", "utf8");
			await symlink(regularTarget, join(outputDir, "parent"));
			const run = runScenario(["export", "--output-dir", outputDir, "--format", "json"], {
				fake: { entries: [{ namespace: "base", branch: "main", key: "parent/x.md", content: "x" }] },
			});
			expect(await run.exit).toBe(2);
			expect(parseJsonOutput(run)).toMatchObject({ error_type: "unsafe_parent_path" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("reports unsafe keys, duplicate targets, missing diagnostics, missing content, and gateway failures", async () => {
		const root = await makeTempDir();
		try {
			const unsafe = runScenario(["export", "--output-dir", join(root, "unsafe"), "--format", "json"], {
				fake: { entries: [{ namespace: "base", branch: "main", key: "a/./b.md", content: "x" }] },
			});
			expect(await unsafe.exit).toBe(2);
			expect(parseJsonOutput(unsafe)).toMatchObject({ error_type: "unsafe_key" });

			const duplicate = runScenario(["export", "--output-dir", join(root, "duplicate"), "--format", "json"], { gateway: new DuplicateListGateway() });
			expect(await duplicate.exit).toBe(2);
			expect(parseJsonOutput(duplicate)).toMatchObject({ error_type: "duplicate_target_path" });

			const missingDiagnostic = runScenario(["export", "--output-dir", join(root, "missing-diagnostic"), "--format", "json"], { gateway: new MissingCheckGateway() });
			expect(await missingDiagnostic.exit).toBe(2);
			expect(parseJsonOutput(missingDiagnostic)).toMatchObject({ error_type: "entry_diagnostic_missing" });

			const missingContent = runScenario(["export", "--output-dir", join(root, "missing-content"), "--format", "json"], { gateway: new MissingGetGateway() });
			expect(await missingContent.exit).toBe(2);
			expect(parseJsonOutput(missingContent)).toMatchObject({ error_type: "entry_content_missing" });

			const listFailure = runScenario(["export", "--output-dir", join(root, "list-failure"), "--format", "json"], {
				fake: { operationErrors: { list: { code: "git_failure", message: "boom" } } },
			});
			expect(await listFailure.exit).toBe(2);
			expect(parseJsonOutput(listFailure)).toMatchObject({ error_type: "git_failure", message: "boom" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("wires public export through RealGitBrmemGateway", async () => {
		const repo = createTempGitRepo();
		const root = await makeTempDir();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			expect((await gateway.putEntry({ namespace: "base", branch: "source", key: "base.md", content: "base\n" })).type).toBe("ok");
			expect((await gateway.putEntry({ namespace: "scratch", branch: "source", key: "scratch.md", content: "scratch\n" })).type).toBe("ok");
			const outputDir = join(root, "real");
			const run = runScenario(["export", "--branch", "source", "--output-dir", outputDir, "--format", "json"], { gateway, cwd: repo.path });
			expect(await run.exit).toBe(0);
			expect(parseJsonOutput(run)).toMatchObject({ data: { exported: [{ key: "base.md", ref_name: "refs/brmem/base/source:base.md" }] } });
			expect(await readFile(join(outputDir, "base.md"), "utf8")).toBe("base\n");
			await expect(readFile(join(outputDir, "scratch.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			repo.cleanup();
			await rm(root, { recursive: true, force: true });
		}
	});
});

class DuplicateListGateway extends FakeBrmemGateway {
	constructor() {
		super({ entries: [{ namespace: "base", branch: "main", key: "same.md", content: "same" }] });
	}

	override async listEntries(_options: { namespace: string; key?: string | undefined; branch?: string | undefined }) {
		const entry = { ...mustEntryRef("base", "same.md", "main"), updatedAt: "2026-01-01T00:00:01+00:00" };
		return brmemOk<readonly ListedEntry[]>([entry, entry]);
	}
}

class MissingCheckGateway extends FakeBrmemGateway {
	constructor() {
		super({ entries: [{ namespace: "base", branch: "main", key: "missing.md", content: "missing" }] });
	}

	override async checkEntry(_options: { namespace: string; key: string; branch: string; at?: string | undefined }) {
		return brmemMissing<EntryDiagnostic>();
	}
}

class MissingGetGateway extends FakeBrmemGateway {
	constructor() {
		super({ entries: [{ namespace: "base", branch: "main", key: "missing.md", content: "missing" }] });
	}

	override async getEntry(_options: { namespace: string; key: string; branch: string; at?: string | undefined }) {
		return brmemMissing<EntryContent>();
	}
}

async function makeTempDir(): Promise<string> {
	return await mkdtemp(join(tmpdir(), "brmem-export-test-"));
}
