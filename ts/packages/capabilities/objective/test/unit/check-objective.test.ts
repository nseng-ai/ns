import { InMemoryGitGateway } from "@ji/capability-kit/git/testing";
import { describe, expect, test } from "vitest";

import type { ObjectiveCliContext } from "../../src/core/context.ts";
import {
	FakeObjectiveStorageGateway,
	type FakeObjectiveStorageGatewayOptions,
} from "../../src/core/fake-storage.ts";
import { runCheckObjective } from "../../src/core/operations/check-objective.ts";
import { ObjectiveStorage } from "../../src/core/storage.ts";

const COMPLETE_OBJECTIVE_MD = [
	"# Objective alpha",
	"",
	"## Thesis",
	"",
	"## Scope",
	"",
	"## Non-Goals",
	"",
	"## Completion Criteria",
	"",
	"## Assumptions and Risks",
	"",
	"## Open Questions",
	"",
].join("\n");

const ROADMAP_MD = "# Roadmap\n\n## Work\n\n## Parked\n";

const FRONTMATTER = [
	"---",
	"blocked: Gated on checkout-free distribution landing.",
	"edges:",
	"  - objective: checkout-free-sdl-distribution",
	"    annotation: Hard dependency consumed by this record.",
	"---",
	"",
].join("\n");

describe("objective check with Record Frontmatter", () => {
	test("record with frontmatter checks identically to the same record without it", async () => {
		const withoutFrontmatter = await runCheckObjective(
			contextWithFakeStorage({
				records: [{ slug: "alpha", objectiveMd: COMPLETE_OBJECTIVE_MD, roadmapMd: ROADMAP_MD }],
			}),
			{ slug: "alpha" },
		);
		const withFrontmatter = await runCheckObjective(
			contextWithFakeStorage({
				records: [
					{
						slug: "alpha",
						objectiveMd: `${FRONTMATTER}${COMPLETE_OBJECTIVE_MD}`,
						roadmapMd: ROADMAP_MD,
					},
				],
			}),
			{ slug: "alpha" },
		);

		if (withoutFrontmatter.type !== "ok") throw new Error("expected ok exit");
		expect(withoutFrontmatter.data.status).toBe("ok");
		expect(withoutFrontmatter.data.errorCount).toBe(0);
		expect(withFrontmatter).toEqual(withoutFrontmatter);
	});

	test("frontmatter does not mask a missing required heading", async () => {
		const objectiveMdMissingThesis = COMPLETE_OBJECTIVE_MD.replace("## Thesis\n\n", "");
		const withoutFrontmatter = await runCheckObjective(
			contextWithFakeStorage({
				records: [{ slug: "alpha", objectiveMd: objectiveMdMissingThesis, roadmapMd: ROADMAP_MD }],
			}),
			{ slug: "alpha" },
		);
		const withFrontmatter = await runCheckObjective(
			contextWithFakeStorage({
				records: [
					{
						slug: "alpha",
						objectiveMd: `${FRONTMATTER}${objectiveMdMissingThesis}`,
						roadmapMd: ROADMAP_MD,
					},
				],
			}),
			{ slug: "alpha" },
		);

		if (withoutFrontmatter.type !== "negative") throw new Error("expected negative exit");
		expect(withoutFrontmatter.data?.status).toBe("failed");
		expect(withFrontmatter).toEqual(withoutFrontmatter);
	});

	test("malformed frontmatter keeps heading lints evaluating on the full content", async () => {
		const unclosedFence = `---\nblocked: never closed\n\n${COMPLETE_OBJECTIVE_MD}`;
		const exit = await runCheckObjective(
			contextWithFakeStorage({
				records: [{ slug: "alpha", objectiveMd: unclosedFence, roadmapMd: ROADMAP_MD }],
			}),
			{ slug: "alpha" },
		);

		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.status).toBe("ok");
		expect(exit.data.errorCount).toBe(0);
	});

	test("closure heading lint for closed records reads the frontmatter-stripped body", async () => {
		const exit = await runCheckObjective(
			contextWithFakeStorage({
				records: [
					{
						slug: "alpha",
						objectiveMd: `${FRONTMATTER}${COMPLETE_OBJECTIVE_MD}## Closure\n`,
						roadmapMd: ROADMAP_MD,
						isClosed: true,
					},
				],
			}),
			{ slug: "alpha" },
		);

		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.status).toBe("ok");
		const closureCheck = exit.data.checks.find((check) =>
			check.label.includes("## Closure for closed Objective"),
		);
		expect(closureCheck?.isPassed).toBe(true);
	});
});

function contextWithFakeStorage(fake: FakeObjectiveStorageGatewayOptions): ObjectiveCliContext {
	return {
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
		repoRoot: "/repo",
		trunkBranch: "master",
		storage: new ObjectiveStorage(new FakeObjectiveStorageGateway(fake)),
		git: new InMemoryGitGateway(),
	};
}
