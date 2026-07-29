import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { describe, expect, test } from "vitest";

import type { ObjectiveCliContext } from "../../src/core/context.ts";
import {
	FakeObjectiveStorageGateway,
	type FakeObjectiveStorageGatewayOptions,
} from "../../src/core/fake-storage.ts";
import {
	renderListCandidates,
	runListCandidates,
} from "../../src/core/operations/list-candidates.ts";
import { FakeObjectiveOwnerGateway } from "../../src/core/owner-gateway.ts";
import { ObjectiveStorage } from "../../src/core/storage.ts";

describe("objective list-candidates operation", () => {
	test("selects active open checkout records without non-active records or git facts", async () => {
		const ctx = contextWithFakeStorage({
			records: [
				{ owner: "tester", slug: "alpha" },
				{ owner: "tester", slug: "bravo", isClosed: true },
				{ owner: "tester", slug: "charlie" },
			],
			directories: [".ns/not-objectives/ignored"],
		});

		const exit = await runListCandidates(ctx, { allOwners: false });

		expect(exit).toEqual({
			type: "ok",
			data: {
				records: [
					{ owner: "tester", slug: "alpha", locator: "tester/alpha", status: "open" },
					{ owner: "tester", slug: "charlie", locator: "tester/charlie", status: "open" },
				],
			},
		});
		expect(ctx.git.hasUncommittedChangesUnderCalls).toEqual([]);
	});

	test("renders TSV rows used by Pi autocomplete consumers", async () => {
		const ctx = contextWithFakeStorage({
			records: [
				{ owner: "tester", slug: "alpha" },
				{ owner: "tester", slug: "charlie" },
			],
		});
		const exit = await runListCandidates(ctx, { allOwners: false });
		if (exit.type !== "ok") throw new Error("expected ok exit");

		expect(renderListCandidates(exit.data)).toBe("tester/alpha\topen\ntester/charlie\topen");
	});
});

interface FakeObjectiveCliContext extends ObjectiveCliContext {
	git: InMemoryGitGateway;
}

function contextWithFakeStorage(fake: FakeObjectiveStorageGatewayOptions): FakeObjectiveCliContext {
	return {
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
		repoRoot: "/repo",
		trunkBranch: "master",
		storage: new ObjectiveStorage(new FakeObjectiveStorageGateway(fake)),
		git: new InMemoryGitGateway(),
		owner: new FakeObjectiveOwnerGateway({ owner: "tester" }),
	};
}
