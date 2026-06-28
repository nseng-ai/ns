import { FakeBrmemGateway } from "@sdl/brmem";
import { InMemoryGitGateway } from "@sdl/core/git/testing";
import { describe, expect, test } from "vitest";

import { handoffCreateSdlCommand } from "@sdl/handoff/sdl/commands/create";
import { handoffDeleteSdlCommand } from "@sdl/handoff/sdl/commands/delete";
import { handoffGcSdlCommand } from "@sdl/handoff/sdl/commands/gc";
import { handoffListSdlCommand } from "@sdl/handoff/sdl/commands/list";
import { handoffPickupSdlCommand } from "@sdl/handoff/sdl/commands/pickup";

import {
	FakeHandoffSourceReader,
	createFakeHandoffSdlApi,
	fakeHandoffInteraction,
	getHandoffContent,
	putHandoffEntry,
	runHandoffCommand,
} from "./handoff-sdl-command-fakes.ts";

describe("handoff SDL command objects", () => {
	test("list returns branch-scoped entries from fake storage", async () => {
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "alpha" });
		await putHandoffEntry(brmem, { key: "bravo.md", branch: "feat/y", content: "bravo" });
		const git = new InMemoryGitGateway({
			currentBranch: "feat/x",
			existingBranches: ["feat/x", "feat/y"],
		});

		const exit = await runHandoffCommand(
			handoffListSdlCommand,
			{},
			{
				api: createFakeHandoffSdlApi({ brmem, git }),
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
		const api = createFakeHandoffSdlApi({ brmem, git });

		const missingYes = await runHandoffCommand(handoffDeleteSdlCommand, { slug: "alpha" }, { api });
		expect(missingYes).toMatchObject({
			type: "usageError",
			data: { missingFlag: "--yes" },
		});
		expect(await getHandoffContent(brmem, { key: "alpha.md", branch: "feat/x" })).toBe("alpha");

		const confirmed = await runHandoffCommand(
			handoffDeleteSdlCommand,
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
		const api = createFakeHandoffSdlApi({
			brmem,
			git,
			interaction: fakeHandoffInteraction({ confirmations: ["declined"] }),
		});

		const exit = await runHandoffCommand(handoffDeleteSdlCommand, { slug: "alpha" }, { api });

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
			handoffCreateSdlCommand,
			{ slug: "alpha" },
			{
				api: createFakeHandoffSdlApi({ brmem, git, sourceReader }),
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
			handoffCreateSdlCommand,
			{ slug: "file-alpha", file: "artifact.md", branch: "feat/y" },
			{ api: createFakeHandoffSdlApi({ brmem, git, sourceReader }) },
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

	test("create requires a valid slug and refuses an existing key", async () => {
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "old" });
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });
		const sourceReader = new FakeHandoffSourceReader({ stdin: "new" });
		const api = createFakeHandoffSdlApi({ brmem, git, sourceReader });

		const missingSlug = await runHandoffCommand(handoffCreateSdlCommand, {}, { api });
		expect(missingSlug).toMatchObject({ type: "usageError" });

		const invalidSlug = await runHandoffCommand(
			handoffCreateSdlCommand,
			{ slug: "bad/slug" },
			{ api },
		);
		expect(invalidSlug).toMatchObject({
			type: "failure",
			errorType: "invalid_handoff_slug",
		});

		const existing = await runHandoffCommand(handoffCreateSdlCommand, { slug: "alpha" }, { api });
		expect(existing).toMatchObject({
			type: "failure",
			errorType: "handoff_already_exists",
		});
		expect(await getHandoffContent(brmem, { key: "alpha.md", branch: "feat/x" })).toBe("old");
	});

	test("create reports detached head and source read failures without writing", async () => {
		const brmem = new FakeBrmemGateway();
		const detachedGit = new InMemoryGitGateway({ currentBranch: { type: "detached" } });
		const sourceReader = new FakeHandoffSourceReader({ files: {} });

		const detached = await runHandoffCommand(
			handoffCreateSdlCommand,
			{ slug: "alpha" },
			{
				api: createFakeHandoffSdlApi({ brmem, git: detachedGit, sourceReader }),
			},
		);
		expect(detached).toMatchObject({
			type: "failure",
			errorType: "detached_head",
		});

		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });
		const missingFile = await runHandoffCommand(
			handoffCreateSdlCommand,
			{ slug: "file-alpha", file: "missing.md" },
			{ api: createFakeHandoffSdlApi({ brmem, git, sourceReader }) },
		);
		expect(missingFile).toMatchObject({
			type: "failure",
			errorType: "source_file_missing",
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
			handoffPickupSdlCommand,
			{ slug: "alpha" },
			{
				api: createFakeHandoffSdlApi({ brmem, git }),
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
			handoffPickupSdlCommand,
			{ slug: "alpha", branch: "feat/y" },
			{
				api: createFakeHandoffSdlApi({ brmem, git }),
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
		const api = createFakeHandoffSdlApi({ brmem, git });

		const missingSlug = await runHandoffCommand(handoffPickupSdlCommand, {}, { api });
		expect(missingSlug).toMatchObject({ type: "usageError" });

		const missingHandoff = await runHandoffCommand(
			handoffPickupSdlCommand,
			{ slug: "missing" },
			{ api },
		);
		expect(missingHandoff).toMatchObject({
			type: "failure",
			errorType: "handoff_not_found",
		});
		expect(await getHandoffContent(brmem, { key: "alpha.md", branch: "feat/x" })).toBe("alpha");

		const detachedGit = new InMemoryGitGateway({ currentBranch: { type: "detached" } });
		const detached = await runHandoffCommand(
			handoffPickupSdlCommand,
			{ slug: "alpha" },
			{
				api: createFakeHandoffSdlApi({ brmem, git: detachedGit }),
			},
		);
		expect(detached).toMatchObject({
			type: "failure",
			errorType: "detached_head",
		});
	});

	test("gc dry-run previews deleted-branch handoffs and force deletes them", async () => {
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "stale.md", branch: "feat/stale", content: "stale" });
		const git = new InMemoryGitGateway({ currentBranch: "main", existingBranches: ["main"] });
		const api = createFakeHandoffSdlApi({ brmem, git });

		const forceRequired = await runHandoffCommand(handoffGcSdlCommand, {}, { api });
		expect(forceRequired).toMatchObject({
			type: "usageError",
			data: { missingFlag: "--force" },
		});

		const dryRun = await runHandoffCommand(handoffGcSdlCommand, { dryRun: true }, { api });
		expect(dryRun).toMatchObject({
			type: "ok",
			data: expect.objectContaining({ dryRun: true, wouldDeleteCount: 1, deletedCount: 0 }),
		});
		expect(await getHandoffContent(brmem, { key: "stale.md", branch: "feat/stale" })).toBe("stale");

		const forced = await runHandoffCommand(handoffGcSdlCommand, { force: true }, { api });
		expect(forced).toMatchObject({
			type: "ok",
			data: expect.objectContaining({ dryRun: false, wouldDeleteCount: 0, deletedCount: 1 }),
		});
		expect(
			await getHandoffContent(brmem, { key: "stale.md", branch: "feat/stale" }),
		).toBeUndefined();
	});
});
