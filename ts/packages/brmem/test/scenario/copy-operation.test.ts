import { describe, expect, it } from "vitest";

import { brmemMissing } from "../../src/contracts.ts";
import { FakeBrmemGateway } from "../../src/fake-gateway.ts";
import type { EntryDiagnostic } from "../../src/gateway.ts";
import { RealGitBrmemGateway } from "../../src/real-git-gateway.ts";
import { mustSnapshotRef } from "../../src/ref-layout.ts";
import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";
import { createTempGitRepo } from "../support/temp-git-repo.ts";

const sourceEntries = [
	{ namespace: "notes", branch: "master", key: "foo/body.md", content: "body\n", headSha: "source-head", blobSha: "blob-body" },
	{ namespace: "notes", branch: "master", key: "foo/sub/x.md", content: "nested\n", headSha: "source-head", blobSha: "blob-nested" },
];

describe("copy operation", () => {
	it("shows help and JSON schema surface", async () => {
		const help = runScenario(["copy", "-h"]);
		expect(await help.exit).toBe(0);
		const text = help.stdout.join("");
		for (const flag of ["--base", "--namespace", "--from-branch", "--to-branch", "--key-glob", "--overwrite", "--dry-run", "--format", "--json-schema"]) {
			expect(text).toContain(flag);
		}

		const schema = runScenario(["copy", "--json-schema"]);
		expect(await schema.exit).toBe(0);
		const document = JSON.parse(schema.stdout.join(""));
		expect(document).toHaveProperty("input_json_schema");
		expect(document).toHaveProperty("output_json_schema");
	});

	it("copies Base Namespace Entries and prints useful human output", async () => {
		const gateway = new FakeBrmemGateway({
			entries: [
				{ namespace: "base", branch: "master", key: "scratch.md", content: "scratch\n", headSha: "base-head", blobSha: "blob-scratch" },
			],
		});
		const run = runScenario(["copy", "--base", "--from-branch", "master", "--to-branch", "feat/x"], { gateway });
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Copied 1 Entry in Base Namespace from Branch master to Branch feat/x.");
		expect(output).toContain("Entry Key: scratch.md");
		expect(output).toContain("Source SHA: base-head");
		expect(output).toContain("Source Entry Locator: refs/brmem/base/master:scratch.md");
		expect(output).toContain("Destination Entry Locator: refs/brmem/base/feat---x:scratch.md");

		const get = runScenario(["get", "scratch.md", "--branch", "feat/x"], { gateway });
		expect(await get.exit).toBe(0);
		expect(get.stdout.join("")).toBe("scratch\n");
	});

	it("emits Python-compatible JSON fields for named Namespace copies", async () => {
		const run = runScenario(["copy", "--namespace", "notes", "--from-branch", "master", "--to-branch", "feat/x", "--format", "json"], {
			fake: { entries: sourceEntries },
		});
		expect(await run.exit).toBe(0);
		const parsed = JSON.parse(run.stdout.join(""));
		expect(parsed).toMatchObject({
			exit_code: 0,
			data: {
				namespace: "notes",
				from_branch: "master",
				to_branch: "feat/x",
				overwrite: false,
				dry_run: false,
				key_glob: null,
				copied: [
					{
						key: "foo/body.md",
						source_ref: "refs/brmem/ns/notes/master:foo/body.md",
						destination_ref: "refs/brmem/ns/notes/feat---x:foo/body.md",
						source_sha: "source-head",
					},
					{
						key: "foo/sub/x.md",
						source_ref: "refs/brmem/ns/notes/master:foo/sub/x.md",
						destination_ref: "refs/brmem/ns/notes/feat---x:foo/sub/x.md",
						source_sha: "source-head",
					},
				],
			},
		});
		const data = parsed.data as Record<string, unknown>;
		expect(Object.keys(data).sort()).toEqual(["copied", "dry_run", "from_branch", "key_glob", "namespace", "overwrite", "to_branch"]);
	});

	it("treats --namespace base as Base Namespace and still rejects an explicit scope conflict", async () => {
		const alias = runScenario(["copy", "--namespace", "base", "--from-branch", "master", "--to-branch", "feat/x", "--format", "json"], {
			fake: { entries: [{ namespace: "base", branch: "master", key: "a.md", content: "A", headSha: "head" }] },
		});
		expect(await alias.exit).toBe(0);
		expect(JSON.parse(alias.stdout.join(""))).toMatchObject({ data: { namespace: "base", copied: [{ destination_ref: "refs/brmem/base/feat---x:a.md" }] } });

		const conflict = runScenario(["copy", "--base", "--namespace", "base", "--from-branch", "master", "--to-branch", "feat/x", "--format", "json"]);
		expect(await conflict.exit).toBe(2);
		expect(JSON.parse(conflict.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: "base_and_namespace_conflict" });
	});

	it("validates scope and values with stable error types before gateway mutation", async () => {
		for (const [args, errorType] of [
			[["--from-branch", "master", "--to-branch", "feat/x"], "copy_scope_missing"],
			[["--namespace", "bad/ns", "--from-branch", "master", "--to-branch", "feat/x"], "invalid_namespace"],
			[["--base", "--from-branch", "bad---branch", "--to-branch", "feat/x"], "invalid_from_branch"],
			[["--base", "--from-branch", "master", "--to-branch", "bad---branch"], "invalid_to_branch"],
			[["--base", "--from-branch", "master", "--to-branch", "feat/x", "--key-glob", ""], "invalid_key_glob"],
		] as const) {
			const run = runScenario(["copy", ...args, "--format", "json"]);
			expect(await run.exit).toBe(2);
			expect(JSON.parse(run.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: errorType });
		}

		const missingFrom = runScenario(["copy", "--base", "--to-branch", "feat/x", "--format", "json"]);
		expect(await missingFrom.exit).toBe(2);
		expect(missingFrom.stderr.join("")).toContain("--from-branch");

		const missingTo = runScenario(["copy", "--base", "--from-branch", "master", "--format", "json"]);
		expect(await missingTo.exit).toBe(2);
		expect(missingTo.stderr.join("")).toContain("--to-branch");
	});

	it("reports empty source and zero glob matches without mutating destination", async () => {
		const gateway = new FakeBrmemGateway({
			entries: [{ namespace: "notes", branch: "feat/x", key: "keep.md", content: "keep\n" }],
		});
		const empty = runScenario(["copy", "--namespace", "notes", "--from-branch", "master", "--to-branch", "feat/x", "--format", "json"], { gateway });
		expect(await empty.exit).toBe(2);
		expect(JSON.parse(empty.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: "no_matching_entries" });

		const noGlob = runScenario(["copy", "--namespace", "notes", "--from-branch", "feat/source", "--to-branch", "feat/x", "--key-glob", "docs/*", "--format", "json"], {
			gateway: new FakeBrmemGateway({
				entries: [
					{ namespace: "notes", branch: "feat/source", key: "foo/body.md", content: "body\n" },
					{ namespace: "notes", branch: "feat/x", key: "keep.md", content: "keep\n" },
				],
			}),
		});
		expect(await noGlob.exit).toBe(2);
		expect(JSON.parse(noGlob.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: "no_matching_entries" });

		const keep = runScenario(["get", "keep.md", "--namespace", "notes", "--branch", "feat/x"], { gateway });
		expect(await keep.exit).toBe(0);
		expect(keep.stdout.join("")).toBe("keep\n");
	});

	it("fails destination conflicts without mutation and maps late copy conflicts", async () => {
		const gateway = new FakeBrmemGateway({
			entries: [
				{ namespace: "notes", branch: "master", key: "source.md", content: "source\n" },
				{ namespace: "notes", branch: "feat/x", key: "keep.md", content: "keep\n" },
			],
		});
		const conflict = runScenario(["copy", "--namespace", "notes", "--from-branch", "master", "--to-branch", "feat/x", "--format", "json"], { gateway });
		expect(await conflict.exit).toBe(2);
		expect(JSON.parse(conflict.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: "destination_conflict" });
		expect(await runScenario(["get", "keep.md", "--namespace", "notes", "--branch", "feat/x"], { gateway }).exit).toBe(0);
		const absent = runScenario(["get", "source.md", "--namespace", "notes", "--branch", "feat/x"], { gateway });
		expect(await absent.exit).toBe(2);

		const race = runScenario(["copy", "--namespace", "notes", "--from-branch", "master", "--to-branch", "feat/x", "--format", "json"], {
			fake: {
				entries: [{ namespace: "notes", branch: "master", key: "source.md", content: "source\n" }],
				operationErrors: { copy: { code: "copy_conflict", message: "late conflict" } },
			},
		});
		expect(await race.exit).toBe(2);
		expect(JSON.parse(race.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: "destination_conflict", message: "late conflict" });
	});

	it("supports overwrite for full-snapshot and key-glob Namespace Copies", async () => {
		const full = new FakeBrmemGateway({
			entries: [
				{ namespace: "notes", branch: "master", key: "source.md", content: "source\n" },
				{ namespace: "notes", branch: "feat/x", key: "keep.md", content: "keep\n" },
			],
		});
		expect(await runScenario(["copy", "--namespace", "notes", "--from-branch", "master", "--to-branch", "feat/x", "--overwrite"], { gateway: full }).exit).toBe(0);
		expect(await runScenario(["get", "source.md", "--namespace", "notes", "--branch", "feat/x"], { gateway: full }).exit).toBe(0);
		expect(await runScenario(["get", "keep.md", "--namespace", "notes", "--branch", "feat/x"], { gateway: full }).exit).toBe(2);

		const glob = new FakeBrmemGateway({
			entries: [
				{ namespace: "notes", branch: "master", key: "foo/body.md", content: "new body\n", headSha: "head" },
				{ namespace: "notes", branch: "master", key: "foo/sub/x.md", content: "nested\n", headSha: "head" },
				{ namespace: "notes", branch: "master", key: "foobar/body.md", content: "sibling\n", headSha: "head" },
				{ namespace: "notes", branch: "feat/x", key: "foo/body.md", content: "old body\n" },
				{ namespace: "notes", branch: "feat/x", key: "foo/orphan.md", content: "old orphan\n" },
				{ namespace: "notes", branch: "feat/x", key: "keep.md", content: "keep\n" },
			],
		});
		const run = runScenario(["copy", "--namespace", "notes", "--from-branch", "master", "--to-branch", "feat/x", "--key-glob", "foo/*", "--overwrite", "--format", "json"], { gateway: glob });
		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({ data: { key_glob: "foo/*", copied: [{ key: "foo/body.md" }, { key: "foo/sub/x.md" }] } });
		expect(await runScenario(["get", "foo/body.md", "--namespace", "notes", "--branch", "feat/x"], { gateway: glob }).exit).toBe(0);
		expect(await runScenario(["get", "foo/sub/x.md", "--namespace", "notes", "--branch", "feat/x"], { gateway: glob }).exit).toBe(0);
		expect(await runScenario(["get", "keep.md", "--namespace", "notes", "--branch", "feat/x"], { gateway: glob }).exit).toBe(0);
		expect(await runScenario(["get", "foo/orphan.md", "--namespace", "notes", "--branch", "feat/x"], { gateway: glob }).exit).toBe(2);
		expect(await runScenario(["get", "foobar/body.md", "--namespace", "notes", "--branch", "feat/x"], { gateway: glob }).exit).toBe(2);
	});

	it("keeps dry-run non-mutating while still checking conflicts", async () => {
		const gateway = new FakeBrmemGateway({
			entries: [
				{ namespace: "notes", branch: "master", key: "source.md", content: "source\n", headSha: "source-head" },
				{ namespace: "notes", branch: "feat/x", key: "source.md", content: "old\n" },
			],
		});
		const conflict = runScenario(["copy", "--namespace", "notes", "--from-branch", "master", "--to-branch", "feat/x", "--dry-run", "--format", "json"], { gateway });
		expect(await conflict.exit).toBe(2);
		expect(JSON.parse(conflict.stdout.join(""))).toMatchObject({ error_type: "destination_conflict" });

		const dryRun = runScenario(["copy", "--namespace", "notes", "--from-branch", "master", "--to-branch", "feat/x", "--dry-run", "--overwrite", "--format", "json"], { gateway });
		expect(await dryRun.exit).toBe(0);
		expect(JSON.parse(dryRun.stdout.join(""))).toMatchObject({ data: { dry_run: true, copied: [{ key: "source.md", source_sha: "source-head" }] } });
		const human = runScenario(["copy", "--namespace", "notes", "--from-branch", "master", "--to-branch", "dry", "--dry-run"], { gateway });
		expect(await human.exit).toBe(0);
		expect(human.stdout.join("")).toContain("Would copy");

		const after = runScenario(["get", "source.md", "--namespace", "notes", "--branch", "feat/x"], { gateway });
		expect(await after.exit).toBe(0);
		expect(after.stdout.join("")).toBe("old\n");
	});

	it("maps gateway failures and missing source SHA preflight to public failures", async () => {
		const copyFailure = runScenario(["copy", "--base", "--from-branch", "master", "--to-branch", "feat/x", "--format", "json"], {
			fake: {
				entries: [{ namespace: "base", branch: "master", key: "source.md", content: "source\n" }],
				operationErrors: { copy: { code: "git_update_ref_failed", message: "boom" } },
			},
		});
		expect(await copyFailure.exit).toBe(2);
		expect(parseJsonOutput(copyFailure)).toMatchObject({ exit_code: 2, error_type: "git_update_ref_failed", message: "boom" });

		const missingShaGateway = new MissingCheckGateway({ entries: [{ namespace: "base", branch: "master", key: "source.md", content: "source\n" }] });
		const missingSha = runScenario(["copy", "--base", "--from-branch", "master", "--to-branch", "feat/x", "--format", "json"], { gateway: missingShaGateway });
		expect(await missingSha.exit).toBe(2);
		expect(parseJsonOutput(missingSha)).toMatchObject({ exit_code: 2, error_type: "source_sha_unavailable" });
	});

	it("wires public copy through RealGitBrmemGateway and preserves dry-run refs", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			expect((await gateway.putEntry({ namespace: "base", branch: "source", key: "source.md", content: "source\n" })).type).toBe("ok");
			expect((await gateway.putEntry({ namespace: "base", branch: "dest", key: "dest.md", content: "dest\n" })).type).toBe("ok");
			const sourceRef = mustSnapshotRef("base", "source");
			const destRef = mustSnapshotRef("base", "dest");
			const sourceSha = repo.runGit(["rev-parse", sourceRef]).trim();
			const destBefore = repo.runGit(["rev-parse", destRef]).trim();

			const dryRun = runScenario(["copy", "--base", "--from-branch", "source", "--to-branch", "dest", "--overwrite", "--dry-run", "--format", "json"], {
				gateway,
				cwd: repo.path,
			});
			expect(await dryRun.exit).toBe(0);
			expect(parseJsonOutput(dryRun)).toMatchObject({ data: { dry_run: true, copied: [{ key: "source.md" }] } });
			expect(repo.runGit(["rev-parse", destRef]).trim()).toBe(destBefore);

			const copy = runScenario(["copy", "--base", "--from-branch", "source", "--to-branch", "dest", "--overwrite"], { gateway, cwd: repo.path });
			expect(await copy.exit).toBe(0);
			expect(repo.runGit(["rev-parse", destRef]).trim()).toBe(sourceSha);
			expect(repo.runGit(["show", `${destRef}:source.md`])).toBe("source\n");
		} finally {
			repo.cleanup();
		}
	});
});

class MissingCheckGateway extends FakeBrmemGateway {
	override async checkEntry(_options: { namespace: string; key: string; branch: string; at?: string | undefined }) {
		return brmemMissing<EntryDiagnostic>();
	}
}
