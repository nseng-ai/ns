import { FakeBrmemGateway } from "@nseng-ai/brmem";
import type { CommandExecApi, ExecResult } from "@nseng-ai/foundation/exec";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import { describe, expect, test } from "vitest";

import { createResultSchema } from "../../src/core/operations/create.ts";
import { deriveSlugResultSchema } from "../../src/core/operations/derive-slug.ts";
import { handoffCreateNsCommand } from "@nseng-ai/handoffs/ns/commands/create";
import { handoffDeleteNsCommand } from "@nseng-ai/handoffs/ns/commands/delete";
import { handoffExecDeriveSlugNsCommand } from "@nseng-ai/handoffs/ns/commands/exec-derive-slug";
import { handoffExecMatchNsCommand } from "@nseng-ai/handoffs/ns/commands/exec-match";
import { handoffGcNsCommand } from "@nseng-ai/handoffs/ns/commands/gc";
import { handoffListNsCommand } from "@nseng-ai/handoffs/ns/commands/list";
import { handoffPickupNsCommand } from "@nseng-ai/handoffs/ns/commands/pickup";

import {
	FakeHandoffSourceReader,
	createFakeHandoffNsApi,
	fakeHandoffInteraction,
	getHandoffContent,
	putHandoffEntry,
	runHandoffCommand,
} from "./handoff-ns-command-fakes.ts";

const slugProjectConfig: ProjectConfigGateway = {
	readTextFile: () => ({
		type: "found",
		text: '[models.profiles.fast]\nmodel = "openai-codex/test-slug"\nthinking = "minimal"\n',
	}),
	pathExists: () => ({ type: "missing" }),
};

class FakeSlugCommands implements CommandExecApi {
	readonly calls: Array<{ command: string; args: string[] }> = [];
	private readonly result: ExecResult;

	constructor(
		result: ExecResult = {
			type: "exited",
			stdout: "continue-auth-token-refresh\n",
			stderr: "",
			code: 0,
			signal: null,
		},
	) {
		this.result = result;
	}

	async exec(command: string, args: string[]): Promise<ExecResult> {
		this.calls.push({ command, args: [...args] });
		return this.result;
	}
}

describe("handoff ns command objects", () => {
	test("create and derive schemas publish discriminated slug and model evidence", () => {
		const base = {
			namespace: "handoff",
			branch: "feat/x",
			slug: "continue-auth-token-refresh",
			key: "continue-auth-token-refresh.md",
			entryLocator: "refs/brmem/ns/handoff/feat---x:continue-auth-token-refresh.md",
			commit: "abc123",
			sourceFile: "<stdin>",
		};
		expect(
			createResultSchema.safeParse({
				...base,
				slugSource: "content-derived",
				provider: "openai-codex",
				model: "test-slug",
			}).success,
		).toBe(true);
		expect(
			createResultSchema.safeParse({
				...base,
				slugSource: "explicit",
				requestedSlug: "Continue Auth Token Refresh",
			}).success,
		).toBe(true);
		expect(createResultSchema.safeParse({ ...base, slugSource: "content-derived" }).success).toBe(
			false,
		);
		expect(
			deriveSlugResultSchema.safeParse({
				slug: base.slug,
				key: base.key,
				provider: "openai-codex",
				model: "test-slug",
			}).success,
		).toBe(true);
	});

	test("list returns branch-scoped entries from fake storage", async () => {
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "alpha" });
		await putHandoffEntry(brmem, { key: "bravo.md", branch: "feat/y", content: "bravo" });
		const git = new InMemoryGitGateway({
			currentBranch: "feat/x",
			existingBranches: ["feat/x", "feat/y"],
		});

		const exit = await runHandoffCommand(
			handoffListNsCommand,
			{},
			{
				api: createFakeHandoffNsApi({ brmem, git }),
			},
		);

		expect(exit).toMatchObject({
			type: "ok",
			data: {
				scope: "branch",
				branch: "feat/x",
				includeDeleted: false,
				handoffs: [expect.objectContaining({ slug: "alpha", branch: "feat/x" })],
			},
		});
	});

	test("delete requires yes when confirmation is non-interactive and deletes with yes", async () => {
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "alpha" });
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });
		const api = createFakeHandoffNsApi({ brmem, git });

		const unavailable = await runHandoffCommand(handoffDeleteNsCommand, { slug: "alpha" }, { api });
		expect(unavailable).toMatchObject({
			type: "usageError",
			message: expect.stringContaining("requires --yes when non-interactive"),
			data: { missingFlag: "--yes" },
		});
		expect(await getHandoffContent(brmem, { key: "alpha.md", branch: "feat/x" })).toBe("alpha");

		const confirmed = await runHandoffCommand(
			handoffDeleteNsCommand,
			{ slug: "alpha", yes: true },
			{ api },
		);
		expect(confirmed).toMatchObject({
			type: "ok",
			data: expect.objectContaining({ deleted: true, cancelled: false, slug: "alpha" }),
		});
		expect(await getHandoffContent(brmem, { key: "alpha.md", branch: "feat/x" })).toBeUndefined();
	});

	test("delete keeps the handoff when an interactive confirmation is declined", async () => {
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "alpha" });
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });
		const api = createFakeHandoffNsApi({
			brmem,
			git,
			interaction: fakeHandoffInteraction({ confirmations: ["declined"] }),
		});

		const exit = await runHandoffCommand(handoffDeleteNsCommand, { slug: "alpha" }, { api });

		expect(exit).toMatchObject({
			type: "ok",
			data: expect.objectContaining({ deleted: false, cancelled: true, slug: "alpha" }),
		});
		expect(await getHandoffContent(brmem, { key: "alpha.md", branch: "feat/x" })).toBe("alpha");
	});

	test("create derives a slug and stores the exact stdin content once", async () => {
		const brmem = new FakeBrmemGateway();
		const git = new InMemoryGitGateway({
			currentBranch: "feat/x",
			existingBranches: ["feat/x"],
			repoRoot: "/work",
		});
		const sourceReader = new FakeHandoffSourceReader({ stdin: "# Continue auth token refresh\n" });
		const commands = new FakeSlugCommands();

		const exit = await runHandoffCommand(
			handoffCreateNsCommand,
			{},
			{
				api: createFakeHandoffNsApi({
					brmem,
					git,
					sourceReader,
					commands,
					projectConfig: slugProjectConfig,
				}),
			},
		);

		expect(exit).toMatchObject({
			type: "ok",
			data: {
				slugSource: "content-derived",
				slug: "continue-auth-token-refresh",
				key: "continue-auth-token-refresh.md",
				provider: "openai-codex",
				model: "test-slug",
				entryLocator: "refs/brmem/ns/handoff/feat---x:continue-auth-token-refresh.md",
			},
		});
		expect(
			await getHandoffContent(brmem, {
				key: "continue-auth-token-refresh.md",
				branch: "feat/x",
			}),
		).toBe("# Continue auth token refresh\n");
		expect(commands.calls).toHaveLength(1);
		expect(sourceReader.stdinReadCount).toBe(1);
		expect(sourceReader.fileReadCount).toBe(0);
	});

	test("derived create reads a file once and stores its exact content", async () => {
		const brmem = new FakeBrmemGateway();
		const git = new InMemoryGitGateway({
			currentBranch: "feat/x",
			existingBranches: ["feat/x"],
			repoRoot: "/work",
		});
		const content = "# Continue auth token refresh\n\nPreserve trailing whitespace.  \n";
		const sourceReader = new FakeHandoffSourceReader({ files: { "artifact.md": content } });

		const exit = await runHandoffCommand(
			handoffCreateNsCommand,
			{ file: "artifact.md" },
			{
				api: createFakeHandoffNsApi({
					brmem,
					git,
					sourceReader,
					commands: new FakeSlugCommands(),
					projectConfig: slugProjectConfig,
				}),
			},
		);

		expect(exit).toMatchObject({ type: "ok", data: { sourceFile: "artifact.md" } });
		expect(
			await getHandoffContent(brmem, {
				key: "continue-auth-token-refresh.md",
				branch: "feat/x",
			}),
		).toBe(content);
		expect(sourceReader.fileReadCount).toBe(1);
		expect(sourceReader.stdinReadCount).toBe(0);
	});

	test("model failure stops derived create before storage mutation", async () => {
		const brmem = new FakeBrmemGateway();
		const git = new InMemoryGitGateway({
			currentBranch: "feat/x",
			existingBranches: ["feat/x"],
			repoRoot: "/work",
		});
		const sourceReader = new FakeHandoffSourceReader({ stdin: "# Continue auth token refresh\n" });
		const commands = new FakeSlugCommands({
			type: "exited",
			stdout: "",
			stderr: "model unavailable",
			code: 1,
			signal: null,
		});

		const exit = await runHandoffCommand(
			handoffCreateNsCommand,
			{},
			{
				api: createFakeHandoffNsApi({
					brmem,
					git,
					sourceReader,
					commands,
					projectConfig: slugProjectConfig,
				}),
			},
		);

		expect(exit).toMatchObject({
			type: "failure",
			errorType: "handoff-slug-derivation-failed",
			message: expect.stringContaining("No continuation-focus or deterministic fallback"),
		});
		expect(sourceReader.stdinReadCount).toBe(1);
		expect(commands.calls).toHaveLength(1);
		expect(
			await getHandoffContent(brmem, {
				key: "continue-auth-token-refresh.md",
				branch: "feat/x",
			}),
		).toBeUndefined();
	});

	test("derived create refuses a collision without overwriting stored content", async () => {
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, {
			key: "continue-auth-token-refresh.md",
			branch: "feat/x",
			content: "old",
		});
		const git = new InMemoryGitGateway({
			currentBranch: "feat/x",
			existingBranches: ["feat/x"],
			repoRoot: "/work",
		});
		const sourceReader = new FakeHandoffSourceReader({ stdin: "new" });

		const exit = await runHandoffCommand(
			handoffCreateNsCommand,
			{},
			{
				api: createFakeHandoffNsApi({
					brmem,
					git,
					sourceReader,
					commands: new FakeSlugCommands(),
					projectConfig: slugProjectConfig,
				}),
			},
		);

		expect(exit).toMatchObject({ type: "failure", errorType: "handoff-already-exists" });
		expect(
			await getHandoffContent(brmem, {
				key: "continue-auth-token-refresh.md",
				branch: "feat/x",
			}),
		).toBe("old");
		expect(sourceReader.stdinReadCount).toBe(1);
	});

	test("exec derive-slug returns schema-first slug and model evidence without writing", async () => {
		const brmem = new FakeBrmemGateway();
		const git = new InMemoryGitGateway({ repoRoot: "/work" });
		const commands = new FakeSlugCommands();
		const sourceReader = new FakeHandoffSourceReader({ stdin: "# Continue auth token refresh\n" });

		const exit = await runHandoffCommand(
			handoffExecDeriveSlugNsCommand,
			{},
			{
				api: createFakeHandoffNsApi({
					brmem,
					git,
					commands,
					projectConfig: slugProjectConfig,
					sourceReader,
				}),
			},
		);

		expect(exit).toEqual({
			type: "ok",
			data: {
				slug: "continue-auth-token-refresh",
				key: "continue-auth-token-refresh.md",
				provider: "openai-codex",
				model: "test-slug",
			},
		});
		expect(
			await getHandoffContent(brmem, { key: "continue-auth-token-refresh.md", branch: "main" }),
		).toBeUndefined();
	});

	test("create stores stdin content on the current branch without invoking slug derivation", async () => {
		const brmem = new FakeBrmemGateway();
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });
		const sourceReader = new FakeHandoffSourceReader({ stdin: "# Alpha\n" });
		const commands = new FakeSlugCommands();

		const exit = await runHandoffCommand(
			handoffCreateNsCommand,
			{ slug: "alpha" },
			{
				api: createFakeHandoffNsApi({ brmem, git, sourceReader, commands }),
			},
		);

		expect(exit).toMatchObject({
			type: "ok",
			data: {
				namespace: "handoff",
				branch: "feat/x",
				slugSource: "explicit",
				slug: "alpha",
				requestedSlug: "alpha",
				key: "alpha.md",
				entryLocator: "refs/brmem/ns/handoff/feat---x:alpha.md",
				sourceFile: "<stdin>",
			},
		});
		expect(await getHandoffContent(brmem, { key: "alpha.md", branch: "feat/x" })).toBe("# Alpha\n");
		expect(sourceReader.stdinReadCount).toBe(1);
		expect(commands.calls).toEqual([]);
	});

	test("create stores file content on an explicit branch", async () => {
		const brmem = new FakeBrmemGateway();
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });
		const sourceReader = new FakeHandoffSourceReader({
			files: { "artifact.md": "# File artifact\n" },
		});

		const exit = await runHandoffCommand(
			handoffCreateNsCommand,
			{ slug: "file-alpha", file: "artifact.md", branch: "feat/y" },
			{ api: createFakeHandoffNsApi({ brmem, git, sourceReader }) },
		);

		expect(exit).toMatchObject({
			type: "ok",
			data: {
				branch: "feat/y",
				slug: "file-alpha",
				key: "file-alpha.md",
				sourceFile: "artifact.md",
			},
		});
		expect(await getHandoffContent(brmem, { key: "file-alpha.md", branch: "feat/y" })).toBe(
			"# File artifact\n",
		);
	});

	test("create requires a normalizable slug and refuses an existing key", async () => {
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "old" });
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });
		const sourceReader = new FakeHandoffSourceReader({ stdin: "new" });
		const api = createFakeHandoffNsApi({ brmem, git, sourceReader });

		const invalidSlug = await runHandoffCommand(handoffCreateNsCommand, { slug: "!!!" }, { api });
		expect(invalidSlug).toMatchObject({
			type: "failure",
			errorType: "invalid-handoff-slug",
		});

		const existing = await runHandoffCommand(handoffCreateNsCommand, { slug: "alpha" }, { api });
		expect(existing).toMatchObject({
			type: "failure",
			errorType: "handoff-already-exists",
		});
		expect(await getHandoffContent(brmem, { key: "alpha.md", branch: "feat/x" })).toBe("old");
		expect(sourceReader.stdinReadCount).toBe(0);
	});

	test("create normalizes a raw handoff name into the stored slug", async () => {
		const brmem = new FakeBrmemGateway();
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });
		const sourceReader = new FakeHandoffSourceReader({ stdin: "# Review\n" });

		const exit = await runHandoffCommand(
			handoffCreateNsCommand,
			{ slug: "Address Review: Feedback!" },
			{ api: createFakeHandoffNsApi({ brmem, git, sourceReader }) },
		);

		expect(exit).toMatchObject({
			type: "ok",
			data: {
				slugSource: "explicit",
				slug: "address-review-feedback",
				requestedSlug: "Address Review: Feedback!",
				key: "address-review-feedback.md",
				branch: "feat/x",
			},
		});
		expect(
			await getHandoffContent(brmem, { key: "address-review-feedback.md", branch: "feat/x" }),
		).toBe("# Review\n");

		const collision = await runHandoffCommand(
			handoffCreateNsCommand,
			{ slug: "address review   feedback" },
			{ api: createFakeHandoffNsApi({ brmem, git, sourceReader }) },
		);
		expect(collision).toMatchObject({
			type: "failure",
			errorType: "handoff-already-exists",
		});
	});

	test("create reports detached head and source read failures without writing", async () => {
		const brmem = new FakeBrmemGateway();
		const detachedGit = new InMemoryGitGateway({ currentBranch: { type: "detached" } });
		const sourceReader = new FakeHandoffSourceReader({ files: {} });

		const detached = await runHandoffCommand(
			handoffCreateNsCommand,
			{ slug: "alpha" },
			{
				api: createFakeHandoffNsApi({ brmem, git: detachedGit, sourceReader }),
			},
		);
		expect(detached).toMatchObject({
			type: "failure",
			errorType: "detached-head",
		});

		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });
		const missingFile = await runHandoffCommand(
			handoffCreateNsCommand,
			{ slug: "file-alpha", file: "missing.md" },
			{ api: createFakeHandoffNsApi({ brmem, git, sourceReader }) },
		);
		expect(missingFile).toMatchObject({
			type: "failure",
			errorType: "source-file-missing",
		});
		expect(
			await getHandoffContent(brmem, { key: "file-alpha.md", branch: "feat/x" }),
		).toBeUndefined();
	});

	test("pickup returns content and metadata for the current branch", async () => {
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "# Alpha\n" });
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });

		const exit = await runHandoffCommand(
			handoffPickupNsCommand,
			{ slug: "alpha" },
			{
				api: createFakeHandoffNsApi({ brmem, git }),
			},
		);

		expect(exit).toMatchObject({
			type: "ok",
			data: {
				namespace: "handoff",
				branch: "feat/x",
				slug: "alpha",
				key: "alpha.md",
				entryLocator: "refs/brmem/ns/handoff/feat---x:alpha.md",
				content: "# Alpha\n",
				summary: expect.objectContaining({
					branch: "feat/x",
					branchState: "active",
					slug: "alpha",
				}),
			},
		});
	});

	test("pickup reads an explicit branch", async () => {
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "wrong" });
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/y", content: "right" });
		const git = new InMemoryGitGateway({
			currentBranch: "feat/x",
			existingBranches: ["feat/x", "feat/y"],
		});

		const exit = await runHandoffCommand(
			handoffPickupNsCommand,
			{ slug: "alpha", branch: "feat/y" },
			{
				api: createFakeHandoffNsApi({ brmem, git }),
			},
		);

		expect(exit).toMatchObject({
			type: "ok",
			data: { branch: "feat/y", slug: "alpha", content: "right" },
		});
	});

	test("pickup reports usage, missing artifacts, and detached HEAD without mutation", async () => {
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "alpha" });
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });
		const api = createFakeHandoffNsApi({ brmem, git });

		const missingSlug = await runHandoffCommand(handoffPickupNsCommand, {}, { api });
		expect(missingSlug).toMatchObject({ type: "usageError" });

		const missingHandoff = await runHandoffCommand(
			handoffPickupNsCommand,
			{ slug: "missing" },
			{ api },
		);
		expect(missingHandoff).toMatchObject({
			type: "failure",
			errorType: "handoff-not-found",
		});
		expect(await getHandoffContent(brmem, { key: "alpha.md", branch: "feat/x" })).toBe("alpha");

		const detachedGit = new InMemoryGitGateway({ currentBranch: { type: "detached" } });
		const detached = await runHandoffCommand(
			handoffPickupNsCommand,
			{ slug: "alpha" },
			{
				api: createFakeHandoffNsApi({ brmem, git: detachedGit }),
			},
		);
		expect(detached).toMatchObject({
			type: "failure",
			errorType: "detached-head",
		});
	});

	test("exec match resolves term selectors with the selection ladder", async () => {
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, {
			key: "address-review-feedback.md",
			branch: "feat/x",
			content: "a",
		});
		await putHandoffEntry(brmem, {
			key: "add-pickup-handoff-command.md",
			branch: "feat/x",
			content: "b",
		});
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });
		const api = createFakeHandoffNsApi({ brmem, git });

		const uniqueTerms = await runHandoffCommand(
			handoffExecMatchNsCommand,
			{ selector: ["review", "feedback"] },
			{ api },
		);
		expect(uniqueTerms).toMatchObject({
			type: "ok",
			data: {
				scope: "branch",
				branch: "feat/x",
				resolution: "unique",
				matchedBy: "terms",
				terms: ["review", "feedback"],
				selected: expect.objectContaining({ slug: "address-review-feedback" }),
			},
		});

		const exactSlug = await runHandoffCommand(
			handoffExecMatchNsCommand,
			{ selector: ["add-pickup-handoff-command"] },
			{ api },
		);
		expect(exactSlug).toMatchObject({
			type: "ok",
			data: {
				resolution: "unique",
				matchedBy: "normalized-slug",
				selected: expect.objectContaining({ slug: "add-pickup-handoff-command" }),
			},
		});

		const noMatch = await runHandoffCommand(
			handoffExecMatchNsCommand,
			{ selector: ["add", "review"] },
			{ api },
		);
		expect(noMatch).toMatchObject({
			type: "ok",
			data: { resolution: "none", selected: null, candidates: [] },
		});

		const emptySelector = await runHandoffCommand(
			handoffExecMatchNsCommand,
			{ selector: [] },
			{ api },
		);
		expect(emptySelector).toMatchObject({
			type: "ok",
			data: { resolution: "ambiguous", selected: null, matchedBy: null },
		});
		expect(emptySelector.type === "ok" ? emptySelector.data.candidates : []).toHaveLength(2);
	});

	test("exec match spans branches with --all and rejects --branch with --all", async () => {
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "resume-plan.md", branch: "feat/x", content: "x" });
		await putHandoffEntry(brmem, { key: "resume-plan.md", branch: "feat/y", content: "y" });
		const git = new InMemoryGitGateway({
			currentBranch: "feat/x",
			existingBranches: ["feat/x", "feat/y"],
		});
		const api = createFakeHandoffNsApi({ brmem, git });

		const crossBranch = await runHandoffCommand(
			handoffExecMatchNsCommand,
			{ selector: ["resume-plan"], all: true },
			{ api },
		);
		expect(crossBranch).toMatchObject({
			type: "ok",
			data: { scope: "all-branches", branch: null, resolution: "ambiguous" },
		});
		expect(crossBranch.type === "ok" ? crossBranch.data.candidates : []).toHaveLength(2);

		const scoped = await runHandoffCommand(
			handoffExecMatchNsCommand,
			{ selector: ["resume-plan"], branch: "feat/y" },
			{ api },
		);
		expect(scoped).toMatchObject({
			type: "ok",
			data: {
				resolution: "unique",
				matchedBy: "normalized-slug",
				selected: expect.objectContaining({ branch: "feat/y", slug: "resume-plan" }),
			},
		});

		const conflict = await runHandoffCommand(
			handoffExecMatchNsCommand,
			{ selector: [], branch: "feat/x", all: true },
			{ api },
		);
		expect(conflict).toMatchObject({
			type: "failure",
			errorType: "branch-and-all-conflict",
		});
	});

	test("gc dry-run previews deleted-branch handoffs and force deletes them", async () => {
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "stale.md", branch: "feat/stale", content: "stale" });
		const git = new InMemoryGitGateway({ currentBranch: "main", existingBranches: ["main"] });
		const api = createFakeHandoffNsApi({ brmem, git });

		await expect(runHandoffCommand(handoffGcNsCommand, {}, { api })).resolves.toMatchObject({
			type: "usageError",
			message: expect.stringContaining("requires --force when non-interactive"),
			data: { missingFlag: "--force" },
		});

		const dryRun = await runHandoffCommand(handoffGcNsCommand, { dryRun: true }, { api });
		expect(dryRun).toMatchObject({
			type: "ok",
			data: expect.objectContaining({ dryRun: true, wouldDeleteCount: 1, deletedCount: 0 }),
		});
		expect(await getHandoffContent(brmem, { key: "stale.md", branch: "feat/stale" })).toBe("stale");

		const forced = await runHandoffCommand(handoffGcNsCommand, { force: true }, { api });
		expect(forced).toMatchObject({
			type: "ok",
			data: expect.objectContaining({ dryRun: false, wouldDeleteCount: 0, deletedCount: 1 }),
		});
		expect(
			await getHandoffContent(brmem, { key: "stale.md", branch: "feat/stale" }),
		).toBeUndefined();
	});
});
