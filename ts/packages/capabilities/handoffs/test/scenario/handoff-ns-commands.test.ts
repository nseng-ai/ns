import { FakeBrmemGateway } from "@nseng-ai/brmem";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { describe, expect, test } from "vitest";

import { handoffCreateNsCommand } from "@nseng-ai/handoffs/ns/commands/create";
import { handoffDeleteNsCommand } from "@nseng-ai/handoffs/ns/commands/delete";
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

describe("handoff ns command objects", () => {
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

	test("delete requires confirmation when non-interactive and deletes with yes", async () => {
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "alpha" });
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });
		const api = createFakeHandoffNsApi({ brmem, git });

		const missingYes = await runHandoffCommand(handoffDeleteNsCommand, { slug: "alpha" }, { api });
		expect(missingYes).toMatchObject({
			type: "usageError",
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

	test("create stores stdin content on the current branch", async () => {
		const brmem = new FakeBrmemGateway();
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });
		const sourceReader = new FakeHandoffSourceReader({ stdin: "# Alpha\n" });

		const exit = await runHandoffCommand(
			handoffCreateNsCommand,
			{ slug: "alpha" },
			{
				api: createFakeHandoffNsApi({ brmem, git, sourceReader }),
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
				sourceFile: "<stdin>",
			},
		});
		expect(await getHandoffContent(brmem, { key: "alpha.md", branch: "feat/x" })).toBe("# Alpha\n");
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

		const missingSlug = await runHandoffCommand(handoffCreateNsCommand, {}, { api });
		expect(missingSlug).toMatchObject({ type: "usageError" });

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

		const forceRequired = await runHandoffCommand(handoffGcNsCommand, {}, { api });
		expect(forceRequired).toMatchObject({
			type: "usageError",
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
