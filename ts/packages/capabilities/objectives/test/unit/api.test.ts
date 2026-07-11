import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { describe, expect, test } from "vitest";

import { createObjectiveClient, type ObjectiveClientOptions } from "../../src/api/index.ts";
import type { ObjectiveCliContext } from "../../src/core/context.ts";
import { FakeObjectiveStorageGateway } from "../../src/core/fake-storage.ts";
import { ObjectiveStorage } from "../../src/core/storage.ts";

const OBJECTIVE_MD = "# Title\n\n## Thesis\n\nDo the thing.\n";
const ROADMAP_MD = "# Roadmap\n\n## Work\n\n- [ ] Step\n\n## Parked\n";

function buildContext(): ObjectiveCliContext {
	const storage = new ObjectiveStorage(
		new FakeObjectiveStorageGateway({
			records: [
				{ slug: "alpha", objectiveMd: OBJECTIVE_MD, roadmapMd: ROADMAP_MD },
				{ slug: "bravo", objectiveMd: OBJECTIVE_MD, roadmapMd: ROADMAP_MD, isClosed: true },
			],
		}),
	);
	return {
		cwd: "/repo",
		env: {},
		repoRoot: "/repo",
		trunkBranch: "master",
		storage,
		git: new InMemoryGitGateway({
			localBranchTips: [{ name: "master", headIso: "2026-05-01T00:00:00Z" }],
		}),
	};
}

function buildClient(): ReturnType<typeof createObjectiveClient> {
	const options: ObjectiveClientOptions = { cwd: "/repo", context: buildContext() };
	return createObjectiveClient(options);
}

describe("createObjectiveClient", () => {
	test("listActiveCandidates returns only open records", async () => {
		const result = await buildClient().listActiveCandidates();
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.candidates).toEqual([{ slug: "alpha", status: "open" }]);
	});

	test("listObjectives defaults to active status and surfaces open records", async () => {
		const result = await buildClient().listObjectives();
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.result.statusFilter).toBe("active");
		expect(result.result.records.map((record) => record.slug)).toEqual(["alpha"]);
	});

	test("listObjectives honors an explicit status filter override", async () => {
		const result = await buildClient().listObjectives({ status: "all" });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.result.records.map((record) => record.slug).sort()).toEqual(["alpha", "bravo"]);
	});

	test("readObjective returns an ok record for a known slug", async () => {
		const result = await buildClient().readObjective("alpha");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.result.status).toBe("ok");
		expect(result.result.slug).toBe("alpha");
	});

	test("readObjective reports not_found for an unknown slug without throwing", async () => {
		const result = await buildClient().readObjective("missing");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.result.status).toBe("not-found");
	});

	test("surfaces storage failures as ok:false instead of throwing", async () => {
		const storage = new ObjectiveStorage(
			new FakeObjectiveStorageGateway({
				failures: { ".ns/objectives": { code: "storage-error", message: "boom" } },
			}),
		);
		const client = createObjectiveClient({
			cwd: "/repo",
			context: {
				cwd: "/repo",
				env: {},
				repoRoot: "/repo",
				trunkBranch: "master",
				storage,
				git: new InMemoryGitGateway({
					localBranchTips: [{ name: "master", headIso: "2026-05-01T00:00:00Z" }],
				}),
			},
		});
		const result = await client.listActiveCandidates();
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.failure.errorType).toBe("storage-error");
	});
});
