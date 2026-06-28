import { rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FakeBrmemGateway, type BrmemSourceReader, type SourceBytesResult } from "@sdl/brmem";
import { InMemoryGitGateway } from "@sdl/core/git/testing";
import { afterEach, describe, expect, test } from "vitest";

import { installCheckedInHandoffExtension } from "../helpers/handoff-extension.ts";
import { parseJsonOutput, runCliWithFakes } from "./sdl-cli-fakes.ts";

const tempDirs: string[] = [];
const HANDOFF_NAMESPACE = "handoff" as const;

afterEach(async () => {
	for (const directory of tempDirs.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("sdl handoff commands", () => {
	test("checked-in handoff extension lists commands in help", async () => {
		const cwd = await createHandoffProject();

		const help = runHandoffCli({ args: ["handoff", "--help"], cwd });
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("");
		expect(output).toContain("Usage: sdl handoff");
		expect(output).toContain("list");
		expect(output).toContain("delete");
		expect(output).toContain("gc");
		expect(output).toContain("create");
		expect(output).toContain("pickup");
		expect(help.stderr.join("")).toBe("");
	});

	test("handoff list returns branch-scoped entries from fake storage", async () => {
		const cwd = await createHandoffProject();
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "alpha" });
		await putHandoffEntry(brmem, { key: "bravo.md", branch: "feat/y", content: "bravo" });
		const git = new InMemoryGitGateway({
			currentBranch: "feat/x",
			existingBranches: ["feat/x", "feat/y"],
		});

		const run = runHandoffCli({
			args: ["handoff", "list", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git }) },
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				scope: "branch",
				branch: "feat/x",
				handoffs: [expect.objectContaining({ slug: "alpha", branch: "feat/x" })],
			},
		});
	});

	test("handoff delete requires --yes when non-interactive and deletes with confirmation", async () => {
		const cwd = await createHandoffProject();
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "alpha" });
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });

		const missingYes = runHandoffCli({
			args: ["handoff", "delete", "alpha", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git }) },
		});
		expect(await missingYes.exit).toBe(2);
		expect(parseJsonOutput(missingYes)).toMatchObject({
			status: "usageError",
			data: { missingFlag: "--yes" },
		});
		expect(await getHandoffContent(brmem, { key: "alpha.md", branch: "feat/x" })).toBe("alpha");

		const confirmed = runHandoffCli({
			args: ["handoff", "delete", "--yes", "alpha", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git }) },
		});
		expect(await confirmed.exit).toBe(0);
		expect(parseJsonOutput(confirmed)).toMatchObject({
			status: "ok",
			data: expect.objectContaining({ deleted: true, slug: "alpha" }),
		});
		const remaining = await getHandoffContent(brmem, { key: "alpha.md", branch: "feat/x" });
		expect(remaining).toBeUndefined();
	});

	test("handoff create stores stdin content on the current branch", async () => {
		const cwd = await createHandoffProject();
		const brmem = new FakeBrmemGateway();
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });
		const sourceReader = new FakeHandoffSourceReader({ stdin: "# Alpha\n" });

		const run = runHandoffCli({
			args: ["handoff", "create", "--slug", "alpha", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git, sourceReader }) },
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				namespace: "handoff",
				branch: "feat/x",
				slug: "alpha",
				key: "alpha.md",
				entry_locator: "refs/brmem/ns/handoff/feat---x:alpha.md",
				source_file: "<stdin>",
			},
		});
		expect(await getHandoffContent(brmem, { key: "alpha.md", branch: "feat/x" })).toBe("# Alpha\n");
	});

	test("handoff create stores file content on an explicit branch", async () => {
		const cwd = await createHandoffProject();
		const brmem = new FakeBrmemGateway();
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });
		const sourceReader = new FakeHandoffSourceReader({
			files: { "artifact.md": "# File artifact\n" },
		});

		const run = runHandoffCli({
			args: [
				"handoff",
				"create",
				"--slug",
				"file-alpha",
				"--file",
				"artifact.md",
				"--branch",
				"feat/y",
				"--format",
				"json",
			],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git, sourceReader }) },
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				branch: "feat/y",
				slug: "file-alpha",
				key: "file-alpha.md",
				source_file: "artifact.md",
			},
		});
		expect(await getHandoffContent(brmem, { key: "file-alpha.md", branch: "feat/y" })).toBe(
			"# File artifact\n",
		);
	});

	test("handoff create requires slug and refuses existing key", async () => {
		const cwd = await createHandoffProject();
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "old" });
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });
		const sourceReader = new FakeHandoffSourceReader({ stdin: "new" });

		const missingSlug = runHandoffCli({
			args: ["handoff", "create", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git, sourceReader }) },
		});
		expect(await missingSlug.exit).toBe(2);
		expect(parseJsonOutput(missingSlug)).toMatchObject({ status: "usageError" });

		const existing = runHandoffCli({
			args: ["handoff", "create", "--slug", "alpha", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git, sourceReader }) },
		});
		expect(await existing.exit).toBe(2);
		expect(parseJsonOutput(existing)).toMatchObject({
			status: "failure",
			errorType: "handoff_already_exists",
		});
		expect(await getHandoffContent(brmem, { key: "alpha.md", branch: "feat/x" })).toBe("old");
	});

	test("handoff create reports detached head and source read failures without writing", async () => {
		const cwd = await createHandoffProject();
		const brmem = new FakeBrmemGateway();
		const detachedGit = new InMemoryGitGateway({ currentBranch: { type: "detached" } });
		const sourceReader = new FakeHandoffSourceReader({ files: {} });

		const detached = runHandoffCli({
			args: ["handoff", "create", "--slug", "alpha", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git: detachedGit, sourceReader }) },
		});
		expect(await detached.exit).toBe(2);
		expect(parseJsonOutput(detached)).toMatchObject({
			status: "failure",
			errorType: "detached_head",
		});

		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });
		const missingFile = runHandoffCli({
			args: [
				"handoff",
				"create",
				"--slug",
				"file-alpha",
				"--file",
				"missing.md",
				"--format",
				"json",
			],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git, sourceReader }) },
		});
		expect(await missingFile.exit).toBe(2);
		expect(parseJsonOutput(missingFile)).toMatchObject({
			status: "failure",
			errorType: "source_file_missing",
		});
		expect(
			await getHandoffContent(brmem, { key: "file-alpha.md", branch: "feat/x" }),
		).toBeUndefined();
	});

	test("handoff pickup returns content and metadata for the current branch", async () => {
		const cwd = await createHandoffProject();
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "# Alpha\n" });
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });

		const run = runHandoffCli({
			args: ["handoff", "pickup", "alpha", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git }) },
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				namespace: "handoff",
				branch: "feat/x",
				slug: "alpha",
				key: "alpha.md",
				entry_locator: "refs/brmem/ns/handoff/feat---x:alpha.md",
				content: "# Alpha\n",
				summary: expect.objectContaining({
					branch: "feat/x",
					branch_state: "active",
					slug: "alpha",
				}),
			},
		});
	});

	test("handoff pickup reads an explicit branch", async () => {
		const cwd = await createHandoffProject();
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "wrong" });
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/y", content: "right" });
		const git = new InMemoryGitGateway({
			currentBranch: "feat/x",
			existingBranches: ["feat/x", "feat/y"],
		});

		const run = runHandoffCli({
			args: ["handoff", "pickup", "alpha", "--branch", "feat/y", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git }) },
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: { branch: "feat/y", slug: "alpha", content: "right" },
		});
	});

	test("handoff pickup reports usage, missing artifacts, and detached HEAD without mutation", async () => {
		const cwd = await createHandoffProject();
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "alpha" });
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });

		const missingSlug = runHandoffCli({
			args: ["handoff", "pickup", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git }) },
		});
		expect(await missingSlug.exit).toBe(2);
		expect(parseJsonOutput(missingSlug)).toMatchObject({ status: "usageError" });

		const missingHandoff = runHandoffCli({
			args: ["handoff", "pickup", "missing", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git }) },
		});
		expect(await missingHandoff.exit).toBe(2);
		expect(parseJsonOutput(missingHandoff)).toMatchObject({
			status: "failure",
			errorType: "handoff_not_found",
		});
		expect(await getHandoffContent(brmem, { key: "alpha.md", branch: "feat/x" })).toBe("alpha");

		const detachedGit = new InMemoryGitGateway({ currentBranch: { type: "detached" } });
		const detached = runHandoffCli({
			args: ["handoff", "pickup", "alpha", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git: detachedGit }) },
		});
		expect(await detached.exit).toBe(2);
		expect(parseJsonOutput(detached)).toMatchObject({
			status: "failure",
			errorType: "detached_head",
		});
	});

	test("handoff pickup publishes its JSON schema", async () => {
		const cwd = await createHandoffProject();

		const run = runHandoffCli({ args: ["handoff", "pickup", "--json-schema"], cwd });

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toHaveProperty("inputJsonSchema");
		expect(run.stderr.join("")).toBe("");
	});

	test("handoff gc dry-run previews deletions and --force is required for mutation", async () => {
		const cwd = await createHandoffProject();
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "stale.md", branch: "feat/stale", content: "stale" });
		const git = new InMemoryGitGateway({ currentBranch: "main", existingBranches: ["main"] });

		const forceRequired = runHandoffCli({
			args: ["handoff", "gc", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git }) },
		});
		expect(await forceRequired.exit).toBe(2);
		expect(parseJsonOutput(forceRequired)).toMatchObject({
			status: "usageError",
			data: { missingFlag: "--force" },
		});

		const dryRun = runHandoffCli({
			args: ["handoff", "gc", "--dry-run", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git }) },
		});
		expect(await dryRun.exit).toBe(0);
		expect(parseJsonOutput(dryRun)).toMatchObject({
			status: "ok",
			data: expect.objectContaining({ dry_run: true, would_delete_count: 1 }),
		});
	});
});

function runHandoffCli(options: {
	args: readonly string[];
	cwd: string;
	state?: Parameters<typeof runCliWithFakes>[0]["state"];
}) {
	return runCliWithFakes(
		{ args: options.args, cwd: options.cwd, state: options.state },
		{ execResponses: () => [], textGenerationResults: () => [] },
	);
}

async function createHandoffProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-handoff-extension-"));
	tempDirs.push(directory);
	installCheckedInHandoffExtension(directory);
	return directory;
}

async function putHandoffEntry(
	gateway: FakeBrmemGateway,
	options: { key: string; branch: string; content: string },
): Promise<void> {
	const result = await gateway.putEntry({
		namespace: HANDOFF_NAMESPACE,
		key: options.key,
		branch: options.branch,
		content: options.content,
	});
	if (result.type === "error") throw new Error(result.error.message);
}

async function getHandoffContent(
	gateway: FakeBrmemGateway,
	options: { key: string; branch: string },
): Promise<string | undefined> {
	const result = await gateway.getEntry({
		namespace: HANDOFF_NAMESPACE,
		key: options.key,
		branch: options.branch,
	});
	if (result.type === "error") throw new Error(result.error.message);
	if (result.type === "missing") return undefined;
	return result.value.content;
}

function handoffExtensionOverrides(overrides: {
	brmem: FakeBrmemGateway;
	git: InMemoryGitGateway;
	sourceReader?: BrmemSourceReader | undefined;
}) {
	return {
		handoff: {
			brmem: overrides.brmem,
			git: overrides.git,
			...(overrides.sourceReader === undefined ? {} : { sourceReader: overrides.sourceReader }),
		},
	} as const;
}

class FakeHandoffSourceReader implements BrmemSourceReader {
	private readonly stdin: string;
	private readonly files: Readonly<Record<string, string>>;

	constructor(options: { stdin?: string | undefined; files?: Readonly<Record<string, string>> }) {
		this.stdin = options.stdin ?? "";
		this.files = { ...(options.files ?? {}) };
	}

	async readFileBytes(path: string, _options: { cwd: string }): Promise<SourceBytesResult> {
		const content = this.files[path];
		if (content === undefined) return { type: "missing" };
		return { type: "ok", bytes: new TextEncoder().encode(content) };
	}

	async readStdinBytes(): Promise<Uint8Array> {
		return new TextEncoder().encode(this.stdin);
	}
}
