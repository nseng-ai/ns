import { describe, expect, test } from "vitest";

import type { GitOptionalResult, GitResult } from "@nseng-ai/foundation/git";
import type { SessionStartEventLike } from "@nseng-ai/extension-kit/pi-types";

import {
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	failedCallerPane,
	resolvedCallerPane,
} from "./herdr-test-harness.ts";
import {
	registerHerdrRepositoryMetadata,
	repositoryTokenPatch,
} from "../src/pi/repository-metadata.ts";

class RepositoryGit {
	readonly calls: string[] = [];
	private readonly roots: Readonly<Record<string, GitOptionalResult<string>>>;
	private readonly commonDirs: Readonly<Record<string, GitResult<string>>>;

	constructor(
		roots: Readonly<Record<string, GitOptionalResult<string>>>,
		commonDirs: Readonly<Record<string, GitResult<string>>>,
	) {
		this.roots = roots;
		this.commonDirs = commonDirs;
	}

	async optionalRepoRoot(options: { cwd: string }): Promise<GitOptionalResult<string>> {
		this.calls.push(options.cwd);
		return this.roots[options.cwd] ?? { type: "missing" };
	}

	async gitCommonDir(options: { cwd: string }): Promise<GitResult<string>> {
		this.calls.push(options.cwd);
		return (
			this.commonDirs[options.cwd] ?? {
				ok: false,
				error: { code: "git_common_dir_failed", message: "missing test common dir" },
			}
		);
	}
}

const SET_NS = { source: "ns:pi-repo", name: "repo", value: "ns" } as const;
const CLEAR_REPO = { source: "ns:pi-repo", name: "repo", value: null } as const;
const STABLE_NS = {
	type: "resolved" as const,
	candidates: [{ paneId: "root-pane", cwd: "/work/ns" }],
};

async function run(options: {
	cwd?: string;
	roots?: Readonly<Record<string, GitOptionalResult<string>>>;
	commonDirs?: Readonly<Record<string, GitResult<string>>>;
	herdr?: FakeHerdrGateway;
	reason?: SessionStartEventLike["reason"];
}) {
	const commands = new FakePi();
	const roots =
		options.roots ??
		({
			"/work/ns/subdir": { type: "found", value: "/work/ns" },
			"/work/ns": { type: "found", value: "/work/ns" },
		} as const);
	const commonDirs =
		options.commonDirs ??
		Object.fromEntries(
			Object.entries(roots).flatMap(([cwd, root]) =>
				root.type === "found" ? [[cwd, { ok: true as const, value: `${root.value}/.git` }]] : [],
			),
		);
	const git = new RepositoryGit(roots, commonDirs);
	const herdr =
		options.herdr ?? new FakeHerdrGateway({ workspaceIdentityResults: [STABLE_NS, STABLE_NS] });
	registerHerdrRepositoryMetadata({ commands, git, herdr });
	const ctx = new FakeCommandContext({ cwd: options.cwd ?? "/work/ns/subdir" });
	await commands.emitSessionStart({ reason: options.reason ?? "startup" }, ctx);
	return { commands, git, herdr, ctx };
}

describe("repositoryTokenPatch", () => {
	test.each([
		["linked-worktree common directory", "/work/ns/.git", "ns"],
		["bare common directory", "/work/clinkr.git", "clinkr"],
		["filesystem root", "/", null],
		["outside Git", null, null],
	])("derives %s", (_name, commonDir, expected) => {
		expect(repositoryTokenPatch(commonDir)).toEqual({ value: expected });
	});
});

describe("session-start repository metadata", () => {
	test.each(["startup", "reload", "new", "resume", "fork"] as const)(
		"refreshes on %s",
		async (reason) => {
			const { herdr } = await run({ reason });
			expect(herdr.paneMetadataCalls).toEqual([{ resourceId: "caller-pane", token: SET_NS }]);
			expect(herdr.workspaceMetadataCalls).toEqual([
				{ resourceId: "caller-workspace", token: SET_NS },
			]);
		},
	);

	test("outside Herdr is a silent no-op before Git work", async () => {
		const herdr = new FakeHerdrGateway({ callerPaneResult: failedCallerPane() });
		const { git, ctx } = await run({ herdr });
		expect(git.calls).toEqual([]);
		expect(herdr.paneMetadataCalls).toEqual([]);
		expect(ctx.notifications).toEqual([]);
	});

	test("clears pane and workspace tokens when all evidence is outside Git", async () => {
		const herdr = new FakeHerdrGateway({
			workspaceIdentityResults: [STABLE_NS, STABLE_NS],
		});
		const { ctx } = await run({ roots: {}, herdr });
		expect(herdr.paneMetadataCalls).toEqual([{ resourceId: "caller-pane", token: CLEAR_REPO }]);
		expect(herdr.workspaceMetadataCalls).toEqual([
			{ resourceId: "caller-workspace", token: CLEAR_REPO },
		]);
		expect(ctx.notifications).toEqual([]);
	});

	test("reports the repository rather than the linked-worktree directory", async () => {
		const slotCwd = "/state/slots/repos/ns/worktrees/slot-12";
		const herdr = new FakeHerdrGateway({
			workspaceIdentityResults: [
				{ type: "resolved", candidates: [{ paneId: "slot-pane", cwd: slotCwd }] },
				{ type: "resolved", candidates: [{ paneId: "slot-pane", cwd: slotCwd }] },
			],
		});
		const { herdr: result } = await run({
			cwd: slotCwd,
			herdr,
			roots: { [slotCwd]: { type: "found", value: slotCwd } },
			commonDirs: { [slotCwd]: { ok: true, value: "/code/ns/.git" } },
		});

		expect(result.paneMetadataCalls[0]?.token).toEqual(SET_NS);
		expect(result.workspaceMetadataCalls[0]?.token).toEqual(SET_NS);
	});

	test("reports unanimous split-pane repository identity", async () => {
		const candidates = {
			type: "resolved" as const,
			candidates: [
				{ paneId: "p1", cwd: "/work/ns/a" },
				{ paneId: "p2", cwd: "/work/ns/b" },
			],
		};
		const herdr = new FakeHerdrGateway({ workspaceIdentityResults: [candidates, candidates] });
		await run({
			herdr,
			roots: {
				"/work/ns/subdir": { type: "found", value: "/work/ns" },
				"/work/ns/a": { type: "found", value: "/work/ns" },
				"/work/ns/b": { type: "found", value: "/work/ns" },
			},
		});
		expect(herdr.workspaceMetadataCalls[0]?.token).toEqual(SET_NS);
	});

	test.each([
		[
			"different repositories",
			{
				"/first": { type: "found", value: "/repos/ns" },
				"/second": { type: "found", value: "/repos/clinkr" },
			},
		],
		[
			"found and missing",
			{ "/first": { type: "found", value: "/repos/ns" }, "/second": { type: "missing" } },
		],
	] as const)("does not mutate workspace for %s", async (_name, candidateRoots) => {
		const candidates = {
			type: "resolved" as const,
			candidates: [
				{ paneId: "p1", cwd: "/first" },
				{ paneId: "p2", cwd: "/second" },
			],
		};
		const herdr = new FakeHerdrGateway({ workspaceIdentityResults: [candidates] });
		await run({ roots: candidateRoots, herdr });
		expect(herdr.workspaceMetadataCalls).toEqual([]);
	});

	test("later-tab caller uses first-tab evidence for workspace metadata", async () => {
		const herdr = new FakeHerdrGateway({
			callerPaneResult: resolvedCallerPane("w1", "later-tab", "later-pane"),
			workspaceIdentityResults: [STABLE_NS, STABLE_NS],
		});
		await run({
			cwd: "/work/clinkr",
			herdr,
			roots: {
				"/work/clinkr": { type: "found", value: "/work/clinkr" },
				"/work/ns": { type: "found", value: "/work/ns" },
			},
		});
		expect(herdr.paneMetadataCalls[0]?.token.value).toBe("clinkr");
		expect(herdr.workspaceMetadataCalls[0]?.token.value).toBe("ns");
	});

	test("candidate drift on re-read prevents workspace mutation", async () => {
		const changed = {
			type: "resolved" as const,
			candidates: [{ paneId: "replacement", cwd: "/work/ns" }],
		};
		const herdr = new FakeHerdrGateway({ workspaceIdentityResults: [STABLE_NS, changed] });
		await run({ herdr });
		expect(herdr.workspaceMetadataCalls).toEqual([]);
	});

	test("Git and report failures warn without rejecting startup", async () => {
		const herdr = new FakeHerdrGateway({
			workspaceIdentityResults: [STABLE_NS],
			paneMetadataResult: { type: "failed", message: "pane unavailable" },
		});
		const { ctx } = await run({
			herdr,
			roots: {
				"/work/ns/subdir": { type: "found", value: "/work/ns" },
				"/work/ns": { type: "error", error: { code: "git-failed", message: "git failed" } },
			},
		});
		expect(ctx.notifications.map((notification) => notification.level)).toEqual([
			"warning",
			"warning",
		]);
		expect(herdr.workspaceMetadataCalls).toEqual([]);
	});

	test("ambiguous topology is silent and does not block pane reporting", async () => {
		const herdr = new FakeHerdrGateway({ workspaceIdentityResults: [{ type: "ambiguous" }] });
		const { ctx } = await run({ herdr });
		expect(herdr.paneMetadataCalls).toHaveLength(1);
		expect(herdr.workspaceMetadataCalls).toEqual([]);
		expect(ctx.notifications).toEqual([]);
	});
});
