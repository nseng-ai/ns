import { describe, expect, test } from "vitest";

import type { GitOptionalResult, GitResult } from "@nseng-ai/foundation/git";
import type {
	HerdrMetadataGateway,
	HerdrMetadataReportResult,
	HerdrMetadataTarget,
	HerdrMetadataToken,
} from "@nseng-ai/herdr/api";

import { registerHerdrRepositoryMetadata } from "../src/pi/repository-metadata.ts";
import {
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	failedCallerPane,
} from "./herdr-test-harness.ts";

class RepositoryGit {
	private readonly root: GitOptionalResult<string>;
	private readonly commonDir: GitResult<string>;

	constructor(root: GitOptionalResult<string>, commonDir: GitResult<string>) {
		this.root = root;
		this.commonDir = commonDir;
	}

	async optionalRepoRoot(): Promise<GitOptionalResult<string>> {
		return this.root;
	}

	async gitCommonDir(): Promise<GitResult<string>> {
		return this.commonDir;
	}
}

interface MetadataCall {
	readonly target: HerdrMetadataTarget;
	readonly token: HerdrMetadataToken;
}

class FakeMetadataGateway implements HerdrMetadataGateway {
	readonly calls: MetadataCall[] = [];

	async reportToken(
		target: HerdrMetadataTarget,
		token: HerdrMetadataToken,
	): Promise<HerdrMetadataReportResult> {
		this.calls.push({ target, token });
		return { type: "reported" };
	}
}

const FOUND = { type: "found" as const, value: "/state/slots/repos/ns/worktrees/slot-12" };
const COMMON_DIR = { ok: true as const, value: "/code/ns/.git" };
const REPO_TOKEN = { source: "ns:pi-repo", name: "repo", value: "ns" } as const;
const CLEAR_TOKEN = { source: "ns:pi-repo", name: "repo", value: null } as const;

async function run(options: {
	root?: GitOptionalResult<string>;
	commonDir?: GitResult<string>;
	herdr?: FakeHerdrGateway;
}) {
	const commands = new FakePi();
	const metadata = new FakeMetadataGateway();
	registerHerdrRepositoryMetadata({
		commands,
		git: new RepositoryGit(options.root ?? FOUND, options.commonDir ?? COMMON_DIR),
		herdr: options.herdr ?? new FakeHerdrGateway(),
		metadata,
	});
	const ctx = new FakeCommandContext({ cwd: "/state/slots/repos/ns/worktrees/slot-12" });
	await commands.emitSessionStart({ reason: "startup" }, ctx);
	return { ctx, metadata };
}

describe("Herdr repository metadata", () => {
	test("reports the Git common-directory repository to the caller pane and workspace", async () => {
		const { metadata } = await run({});

		expect(metadata.calls).toEqual([
			{ target: { type: "pane", id: "caller-pane" }, token: REPO_TOKEN },
			{ target: { type: "workspace", id: "caller-workspace" }, token: REPO_TOKEN },
		]);
	});

	test("clears stale tokens outside Git", async () => {
		const { metadata } = await run({ root: { type: "missing" } });

		expect(metadata.calls.map((call) => call.token)).toEqual([CLEAR_TOKEN, CLEAR_TOKEN]);
	});

	test("does nothing outside Herdr", async () => {
		const { ctx, metadata } = await run({
			herdr: new FakeHerdrGateway({ callerPaneResult: failedCallerPane() }),
		});

		expect(metadata.calls).toEqual([]);
		expect(ctx.notifications).toEqual([]);
	});

	test("warns and skips reporting when Git identity fails", async () => {
		const { ctx, metadata } = await run({
			commonDir: {
				ok: false,
				error: { code: "git_common_dir_failed", message: "git failed" },
			},
		});

		expect(metadata.calls).toEqual([]);
		expect(ctx.notifications).toEqual([
			{ message: "Could not resolve Herdr repository metadata: git failed", level: "warning" },
		]);
	});
});
