import { describe, expect, test } from "vitest";

import { FakeBrmemGateway } from "../../src/fake-brmem-gateway.ts";

describe("FakeBrmemGateway", () => {
	test("lists, checks, timestamps, and deletes entries", async () => {
		const gateway = new FakeBrmemGateway();
		gateway.put("handoff", "alpha.md", "feat/x", "alpha");

		const listed = await gateway.listEntries({ namespace: "handoff", branch: "feat/x" });
		expect(listed).toEqual({
			type: "ok",
			value: [{ namespace: "handoff", key: "alpha.md", branch: "feat/x", entryLocator: "refs/brmem/ns/handoff/feat---x:alpha.md" }],
		});
		expect(await gateway.check({ namespace: "handoff", key: "alpha.md", branch: "feat/x" })).toMatchObject({ type: "found" });
		expect(await gateway.entryUpdatedAt({ namespace: "handoff", key: "alpha.md", branch: "feat/x" })).toEqual({ type: "found", value: "2026-01-01T00:00:01+00:00" });
		expect(await gateway.delete({ namespace: "handoff", key: "alpha.md", branch: "feat/x" })).toEqual({ type: "ok", value: { commit: "fake-0002" } });
		expect(await gateway.check({ namespace: "handoff", key: "alpha.md", branch: "feat/x" })).toEqual({ type: "missing" });
	});
});
