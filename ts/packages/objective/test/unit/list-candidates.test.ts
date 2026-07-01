import { describe, expect, test } from "vitest";

import type { FakeObjectiveStorageGatewayOptions } from "../../src/fake-storage.ts";
import { renderListCandidates, runListCandidates } from "../../src/operations/list-candidates.ts";
import {
	createFakeObjectiveContext,
	type FakeObjectiveCliContext,
} from "../support/fake-objective-context.ts";

describe("objective list-candidates operation", () => {
	test("selects active open checkout records without archive records or git facts", async () => {
		const ctx = contextWithFakeStorage({
			records: [{ slug: "alpha" }, { slug: "bravo", isClosed: true }, { slug: "charlie" }],
			directories: [".sdl/objective-archive/archived"],
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

function contextWithFakeStorage(fake: FakeObjectiveStorageGatewayOptions): FakeObjectiveCliContext {
	return createFakeObjectiveContext({ storageState: fake, trunkBranch: "master" });
}
