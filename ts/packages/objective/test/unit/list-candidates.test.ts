import { describe, expect, test } from "vitest";

import type { ObjectiveCliContext } from "../../src/context.ts";
import { FakeObjectiveGitFactsGateway } from "../../src/fake-git-facts.ts";
import { FakeObjectiveStorageGateway, type FakeObjectiveStorageGatewayOptions } from "../../src/fake-storage.ts";
import { legacyListCandidatesMachine, renderListCandidates, runListCandidates } from "../../src/operations/list-candidates.ts";
import { ObjectiveStorage } from "../../src/storage.ts";

describe("objective list-candidates operation", () => {
	test("selects active open checkout records without archive records or git facts", async () => {
		const ctx = contextWithFakeStorage({
			records: [{ slug: "alpha" }, { slug: "bravo", closed: true }, { slug: "charlie" }],
			directories: [".asdl/objective-archive/archived"],
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
		expect(ctx.gitFacts.hasUncommittedChangesUnderCalls).toEqual([]);
	});

	test("renders TSV rows and legacy machine shape used by Pi autocomplete consumers", async () => {
		const ctx = contextWithFakeStorage({ records: [{ slug: "alpha" }, { slug: "charlie" }] });
		const exit = await runListCandidates(ctx, {});
		if (exit.type !== "ok") throw new Error("expected ok exit");

		expect(renderListCandidates(exit.data)).toBe("alpha\topen\ncharlie\topen");
		expect(legacyListCandidatesMachine(exit)).toEqual({
			exitCode: 0,
			body: {
				exit_code: 0,
				data: {
					records: [
						{ slug: "alpha", status: "open" },
						{ slug: "charlie", status: "open" },
					],
				},
			},
		});
	});
});

interface FakeObjectiveCliContext extends ObjectiveCliContext {
	gitFacts: FakeObjectiveGitFactsGateway;
}

function contextWithFakeStorage(fake: FakeObjectiveStorageGatewayOptions): FakeObjectiveCliContext {
	return {
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
		repoRoot: "/repo",
		trunkBranch: "master",
		storage: new ObjectiveStorage(new FakeObjectiveStorageGateway(fake)),
		gitFacts: new FakeObjectiveGitFactsGateway(),
	};
}
