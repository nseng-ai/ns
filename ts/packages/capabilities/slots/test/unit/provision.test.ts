import { createFakeClinkrInteraction } from "@nseng-ai/clinkr/testing";
import { createManualClock } from "@nseng-ai/foundation/time/testing";
import { FakeGraphiteStackGateway } from "@nseng-ai/capability-kit/graphite/testing";
import { describe, expect, it } from "vitest";

import type { RepoSlotContext } from "../../src/core/context.ts";
import { FakeClipboardGateway } from "../../src/core/gateways/clipboard.ts";
import { FakeSlotCommandGateway } from "../../src/core/gateways/fakes/command.ts";
import { FakeSlotPrGateway } from "../../src/core/gateways/fakes/pr.ts";
import {
	FakeSlotProvisionFilesGateway,
	type FakeSlotProvisionFilesGatewayOptions,
} from "../../src/core/gateways/fakes/provision-files.ts";
import {
	FakeSlotRepositoryGateway,
	type FakeSlotRepositoryGatewayOptions,
} from "../../src/core/gateways/fakes/repository.ts";
import { FakeSlotStorageGateway } from "../../src/core/gateways/fakes/storage.ts";
import {
	applyProvisionedFiles,
	fillProvisionGapsForPlacement,
	importProvisionedFiles,
	provisionStoreRoot,
} from "../../src/lifecycle/provision.ts";
import { repoContext, slotWorktree } from "../support/run-scenario.ts";

const DECLARED_ENV = '[slots]\nprovision = [".env.local"]\n';
const STORE_ROOT = "/slots/repos/repo/provision/default";
const SLOT_01 = slotWorktree("slot-01").path;
const TARGET = { slotName: "slot-01", path: SLOT_01 };

describe("provisionStoreRoot", () => {
	it("derives the profile-shaped store path from the repo dir", () => {
		expect(provisionStoreRoot(repoContext())).toBe(STORE_ROOT);
	});
});

describe("fillProvisionGapsForPlacement", () => {
	it("returns null when no ns.toml exists", async () => {
		const ctx = context({});
		expect(await fillProvisionGapsForPlacement(ctx, [TARGET])).toBeNull();
	});

	it("returns null when nothing is declared", async () => {
		const ctx = context({ provisionFiles: { projectConfigByRoot: { "/repo": "[slots]\n" } } });
		expect(await fillProvisionGapsForPlacement(ctx, [TARGET])).toBeNull();
	});

	it("copies a declared file that is missing from the worktree", async () => {
		const ctx = context({
			provisionFiles: {
				projectConfigByRoot: { "/repo": DECLARED_ENV },
				files: { [`${STORE_ROOT}/.env.local`]: "SECRET=1\n" },
			},
		});
		const report = await fillProvisionGapsForPlacement(ctx, [TARGET]);
		expect(report).toEqual({
			copied: [{ slotName: "slot-01", path: ".env.local" }],
			notices: [],
		});
		expect(ctx.provisionFiles.fileAt(`${SLOT_01}/.env.local`)).toEqual({ content: "SECRET=1\n" });
	});

	it("never touches an existing worktree file, even when it differs", async () => {
		const ctx = context({
			provisionFiles: {
				projectConfigByRoot: { "/repo": DECLARED_ENV },
				files: {
					[`${STORE_ROOT}/.env.local`]: "SECRET=1\n",
					[`${SLOT_01}/.env.local`]: "LOCAL=EDIT\n",
				},
			},
		});
		const report = await fillProvisionGapsForPlacement(ctx, [TARGET]);
		expect(report).toEqual({ copied: [], notices: [] });
		expect(ctx.provisionFiles.fileAt(`${SLOT_01}/.env.local`)).toEqual({ content: "LOCAL=EDIT\n" });
		expect(ctx.provisionFiles.operations()).toEqual([]);
	});

	it("reports a config error as a notice instead of failing", async () => {
		const ctx = context({
			provisionFiles: { projectConfigByRoot: { "/repo": '[slots]\nprovision = ["/abs"]\n' } },
		});
		const report = await fillProvisionGapsForPlacement(ctx, [TARGET]);
		expect(report?.copied).toEqual([]);
		expect(report?.notices).toMatchObject([{ kind: "config-error", path: null, slotName: null }]);
	});

	it("reports missing store files, non-file targets, non-file store entries, and copy failures", async () => {
		const ctx = context({
			provisionFiles: {
				projectConfigByRoot: {
					"/repo": '[slots]\nprovision = ["missing.env", "dir.env", "storedir.env", "fail.env"]\n',
				},
				files: {
					[`${SLOT_01}/dir.env`]: { content: "", kind: "directory" },
					[`${STORE_ROOT}/dir.env`]: "unused\n",
					[`${STORE_ROOT}/storedir.env`]: { content: "", kind: "symlink" },
					[`${STORE_ROOT}/fail.env`]: "x\n",
				},
				copyFailures: { [`${SLOT_01}/fail.env`]: "disk full" },
			},
		});
		const report = await fillProvisionGapsForPlacement(ctx, [TARGET]);
		expect(report?.copied).toEqual([]);
		expect(report?.notices).toMatchObject([
			{ kind: "missing-in-store", path: "missing.env", slotName: "slot-01" },
			{ kind: "target-not-a-file", path: "dir.env", slotName: "slot-01" },
			{ kind: "store-not-a-file", path: "storedir.env", slotName: "slot-01" },
			{ kind: "copy-failed", path: "fail.env", slotName: "slot-01" },
		]);
	});
});

describe("applyProvisionedFiles", () => {
	it("fails on config errors", async () => {
		const ctx = context({
			provisionFiles: { projectConfigByRoot: { "/repo": '[slots]\nprovision = ["../x"]\n' } },
		});
		const result = await applyProvisionedFiles(ctx, { shouldForce: false });
		expect(result).toMatchObject({
			type: "failure",
			failure: { errorType: "invalid-provision-path" },
		});
	});

	it("returns empty entries when nothing is declared or no slots exist", async () => {
		const undeclared = await applyProvisionedFiles(context({}), { shouldForce: false });
		expect(undeclared).toEqual({ type: "ok", outcome: { entries: [], storeRoot: STORE_ROOT } });

		const noSlots = await applyProvisionedFiles(
			context({
				provisionFiles: { projectConfigByRoot: { "/repo": DECLARED_ENV } },
				git: { worktrees: [{ path: "/repo", branch: "master" }] },
			}),
			{ shouldForce: false },
		);
		expect(noSlots).toEqual({ type: "ok", outcome: { entries: [], storeRoot: STORE_ROOT } });
	});

	it("copies gaps, keeps equal copies, and reports differing copies without --force", async () => {
		const slot02 = slotWorktree("slot-02").path;
		const slot03 = slotWorktree("slot-03").path;
		const ctx = context({
			provisionFiles: {
				projectConfigByRoot: { "/repo": DECLARED_ENV },
				files: {
					[`${STORE_ROOT}/.env.local`]: "SECRET=1\n",
					[`${slot02}/.env.local`]: "SECRET=1\n",
					[`${slot03}/.env.local`]: "DIFFERENT\n",
				},
			},
			git: {
				worktrees: [
					{ path: "/repo", branch: "master" },
					slotWorktree("slot-01"),
					slotWorktree("slot-02"),
					slotWorktree("slot-03"),
				],
			},
		});
		const result = await applyProvisionedFiles(ctx, { shouldForce: false });
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.outcome.entries).toMatchObject([
			{ slotName: "slot-01", path: ".env.local", action: "copied" },
			{ slotName: "slot-02", path: ".env.local", action: "up-to-date" },
			{ slotName: "slot-03", path: ".env.local", action: "differs" },
		]);
		expect(ctx.provisionFiles.fileAt(`${slot03}/.env.local`)).toEqual({ content: "DIFFERENT\n" });
	});

	it("overwrites differing copies with --force", async () => {
		const ctx = context({
			provisionFiles: {
				projectConfigByRoot: { "/repo": DECLARED_ENV },
				files: {
					[`${STORE_ROOT}/.env.local`]: { content: "SECRET=1\n", mode: 0o600 },
					[`${SLOT_01}/.env.local`]: { content: "DIFFERENT\n", mode: 0o644 },
				},
			},
			git: { worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")] },
		});
		const result = await applyProvisionedFiles(ctx, { shouldForce: true });
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.outcome.entries).toMatchObject([{ action: "overwritten" }]);
		expect(ctx.provisionFiles.fileAt(`${SLOT_01}/.env.local`)).toEqual({
			content: "SECRET=1\n",
			mode: 0o600,
		});
	});

	it("reports missing store entries and non-file paths", async () => {
		const ctx = context({
			provisionFiles: {
				projectConfigByRoot: { "/repo": '[slots]\nprovision = ["missing.env", "dir.env"]\n' },
				files: {
					[`${STORE_ROOT}/dir.env`]: "x\n",
					[`${SLOT_01}/dir.env`]: { content: "", kind: "directory" },
				},
			},
			git: { worktrees: [{ path: "/repo", branch: "master" }, slotWorktree("slot-01")] },
		});
		const result = await applyProvisionedFiles(ctx, { shouldForce: false });
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.outcome.entries).toMatchObject([
			{ path: "missing.env", action: "missing-in-store" },
			{ path: "dir.env", action: "skipped-not-a-file" },
		]);
	});
});

describe("importProvisionedFiles", () => {
	it("fails on config errors and undeclared explicit paths", async () => {
		const configError = await importProvisionedFiles(
			context({
				provisionFiles: { projectConfigByRoot: { "/repo": '[slots]\nprovision = "x"\n' } },
			}),
			[],
		);
		expect(configError).toMatchObject({
			type: "failure",
			failure: { errorType: "invalid-provision" },
		});

		const undeclared = await importProvisionedFiles(
			context({ provisionFiles: { projectConfigByRoot: { "/repo": DECLARED_ENV } } }),
			["other.env"],
		);
		expect(undeclared).toMatchObject({ type: "failure", failure: { errorType: "not-declared" } });
	});

	it("creates, replaces, and keeps store entries from the current worktree", async () => {
		const ctx = context({
			provisionFiles: {
				projectConfigByRoot: {
					"/repo": '[slots]\nprovision = ["created.env", "replaced.env", "unchanged.env"]\n',
				},
				files: {
					"/repo/created.env": "NEW\n",
					"/repo/replaced.env": "NEWER\n",
					[`${STORE_ROOT}/replaced.env`]: "OLD\n",
					"/repo/unchanged.env": "SAME\n",
					[`${STORE_ROOT}/unchanged.env`]: "SAME\n",
				},
			},
		});
		const result = await importProvisionedFiles(ctx, []);
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.outcome).toMatchObject({ storeRoot: STORE_ROOT, sourceRoot: "/repo" });
		expect(result.outcome.entries).toMatchObject([
			{ path: "created.env", action: "created" },
			{ path: "replaced.env", action: "replaced" },
			{ path: "unchanged.env", action: "unchanged" },
		]);
		expect(ctx.provisionFiles.fileAt(`${STORE_ROOT}/created.env`)).toEqual({ content: "NEW\n" });
		expect(ctx.provisionFiles.fileAt(`${STORE_ROOT}/replaced.env`)).toEqual({ content: "NEWER\n" });
	});

	it("treats a missing declared file as a notice-level entry", async () => {
		const ctx = context({
			provisionFiles: { projectConfigByRoot: { "/repo": DECLARED_ENV } },
		});
		const result = await importProvisionedFiles(ctx, []);
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.outcome.entries).toMatchObject([
			{ path: ".env.local", action: "missing-in-worktree" },
		]);
	});

	it("imports only the requested declared paths", async () => {
		const ctx = context({
			provisionFiles: {
				projectConfigByRoot: { "/repo": '[slots]\nprovision = ["a.env", "b.env"]\n' },
				files: { "/repo/a.env": "A\n", "/repo/b.env": "B\n" },
			},
		});
		const result = await importProvisionedFiles(ctx, ["b.env"]);
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.outcome.entries).toMatchObject([{ path: "b.env", action: "created" }]);
		expect(ctx.provisionFiles.fileAt(`${STORE_ROOT}/a.env`)).toBeNull();
	});
});

function context(options: {
	provisionFiles?: FakeSlotProvisionFilesGatewayOptions;
	git?: FakeSlotRepositoryGatewayOptions;
}): RepoSlotContext & { provisionFiles: FakeSlotProvisionFilesGateway } {
	return {
		repo: repoContext(),
		git: new FakeSlotRepositoryGateway(options.git),
		gt: new FakeGraphiteStackGateway(),
		pr: new FakeSlotPrGateway(),
		storage: new FakeSlotStorageGateway(),
		provisionFiles: new FakeSlotProvisionFilesGateway(options.provisionFiles),
		clipboard: new FakeClipboardGateway(),
		command: new FakeSlotCommandGateway(),
		clock: createManualClock(0).clock,
		cwd: "/repo",
		renderCapabilities: { canEmitAnsi: false },
		interaction: createFakeClinkrInteraction().interaction,
		stderr: () => {},
		env: { PATH: "/fake/bin" },
		slotsRoot: "/slots",
		shouldWriteCdDirective: false,
	};
}
