import { InMemoryGitGateway } from "@ns/capability-kit/git/testing";
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
import { ObjectiveStorage } from "../../src/core/storage.ts";

describe("objective list-candidates operation", () => {
	test("selects active open checkout records without archive records or git facts", async () => {
		const ctx = contextWithFakeStorage({
			records: [{ slug: "alpha" }, { slug: "bravo", isClosed: true }, { slug: "charlie" }],
			directories: [".ns/objective-archive/archived"],
		});

		const exit = await runListCandidates(ctx, {});

		expect(exit).toEqual({
			type: "ok",
			data: {
				records: [
					{ slug: "alpha", status: "open" },
					{ slug: "charlie", status: "open" },
				],
			},
		});
		expect(ctx.git.hasUncommittedChangesUnderCalls).toEqual([]);
	});

	test("renders TSV rows used by Pi autocomplete consumers", async () => {
		const ctx = contextWithFakeStorage({ records: [{ slug: "alpha" }, { slug: "charlie" }] });
		const exit = await runListCandidates(ctx, {});
		if (exit.type !== "ok") throw new Error("expected ok exit");

		expect(renderListCandidates(exit.data)).toBe("alpha\topen\ncharlie\topen");
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
	};
}
