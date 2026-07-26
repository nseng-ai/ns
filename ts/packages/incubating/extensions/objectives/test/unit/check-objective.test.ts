import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { describe, expect, test } from "vitest";

import type { ObjectiveCliContext } from "../../src/core/context.ts";
import {
	FakeObjectiveStorageGateway,
	type FakeObjectiveStorageGatewayOptions,
} from "../../src/core/fake-storage.ts";
import { runCheckObjective } from "../../src/core/operations/check-objective.ts";
import { ObjectiveStorage } from "../../src/core/storage.ts";
import { runObjectiveCheckCommand } from "../../src/ns/commands/check.ts";

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

const MIRROR_COUNTERPART = {
	slug: "checkout-free-sdl-distribution",
	objectiveMd: [
		"---",
		"edges:",
		"  - objective: alpha",
		"    annotation: Must land before alpha ships externally.",
		"---",
		"",
		COMPLETE_OBJECTIVE_MD,
	].join("\n"),
	roadmapMd: ROADMAP_MD,
};

describe("objective check with Record Frontmatter", () => {
	test("record with mirrored frontmatter checks identically to the same record without it", async () => {
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
					MIRROR_COUNTERPART,
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
					MIRROR_COUNTERPART,
				],
			}),
			{ slug: "alpha" },
		);

		if (withoutFrontmatter.type !== "negative") throw new Error("expected negative exit");
		expect(withoutFrontmatter.data?.status).toBe("failed");
		expect(withFrontmatter).toEqual(withoutFrontmatter);
	});

	test("malformed frontmatter is an error while heading lints still evaluate the full content", async () => {
		const unclosedFence = `---\nblocked: never closed\n\n${COMPLETE_OBJECTIVE_MD}`;
		const exit = await runCheckObjective(
			contextWithFakeStorage({
				records: [{ slug: "alpha", objectiveMd: unclosedFence, roadmapMd: ROADMAP_MD }],
			}),
			{ slug: "alpha" },
		);

		if (exit.type !== "negative") throw new Error("expected negative exit");
		if (exit.data?.status !== "failed") throw new Error("expected failed result");
		expect(exit.data.errorCount).toBe(1);
		const failing = exit.data.checks.filter((check) => !check.isPassed);
		expect(failing).toHaveLength(1);
		expect(failing[0]?.label).toBe("objective.md Record Frontmatter parses");
		const headingChecks = exit.data.checks.filter((check) => check.label.includes("##"));
		expect(headingChecks.length).toBeGreaterThan(0);
		expect(headingChecks.every((check) => check.isPassed)).toBe(true);
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
					MIRROR_COUNTERPART,
				],
			}),
			{ slug: "alpha" },
		);

		if (exit.type !== "ok") throw new Error("expected ok exit");
		if (exit.data.status !== "ok") throw new Error("expected ok result");
		const closureCheck = exit.data.checks.find((check) =>
			check.label.includes("## Closure for closed Objective"),
		);
		expect(closureCheck?.isPassed).toBe(true);
	});

	test("per-slug check reports a dangling edge endpoint as an error", async () => {
		const exit = await runCheckObjective(
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

		if (exit.type !== "negative") throw new Error("expected negative exit");
		if (exit.data?.status !== "failed") throw new Error("expected failed result");
		const failing = exit.data.checks.filter((check) => !check.isPassed);
		expect(failing.map((check) => check.label)).toEqual([
			"objective.md edge checkout-free-sdl-distribution endpoint exists",
		]);
	});

	test("blocked record with a closed counterpart passes with a warning, not an error", async () => {
		const exit = await runCheckObjective(
			contextWithFakeStorage({
				records: [
					{
						slug: "alpha",
						objectiveMd: `${FRONTMATTER}${COMPLETE_OBJECTIVE_MD}`,
						roadmapMd: ROADMAP_MD,
					},
					{ ...MIRROR_COUNTERPART, isClosed: true },
				],
			}),
			{ slug: "alpha" },
		);

		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.status).toBe("ok");
		expect(exit.data.errorCount).toBe(0);
		expect(exit.data.warningCount).toBe(1);
		const warning = exit.data.checks.find(
			(check) => check.severity === "warning" && !check.isPassed,
		);
		expect(warning?.label).toBe("objective.md Blocked Sentence has no closed edge counterparts");
		expect(warning?.detail).toContain("checkout-free-sdl-distribution");
	});
});

describe("objective check --all edge sweep", () => {
	test("rejects a slug combined with --all", async () => {
		const exit = await runObjectiveCheckCommand(
			contextWithFakeStorage({
				records: [{ slug: "alpha", objectiveMd: COMPLETE_OBJECTIVE_MD, roadmapMd: ROADMAP_MD }],
			}),
			{ slug: "alpha", all: true },
		);

		expect(exit.type).toBe("usageError");
	});

	test("sweep passes on mirrored records and records without frontmatter", async () => {
		const exit = await runObjectiveCheckCommand(
			contextWithFakeStorage({
				records: [
					{
						slug: "alpha",
						objectiveMd: `${FRONTMATTER}${COMPLETE_OBJECTIVE_MD}`,
						roadmapMd: ROADMAP_MD,
					},
					MIRROR_COUNTERPART,
					{ slug: "plain", objectiveMd: COMPLETE_OBJECTIVE_MD, roadmapMd: ROADMAP_MD },
				],
			}),
			{ all: true },
		);

		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.status).toBe("sweep-ok");
		if (exit.data.status !== "sweep-ok") throw new Error("expected sweep-ok result");
		expect(exit.data.recordCount).toBe(3);
		expect(exit.data.violations).toEqual([]);
	});

	test("sweep stays sweep-ok when only blocked/closed-counterpart warnings exist", async () => {
		const exit = await runObjectiveCheckCommand(
			contextWithFakeStorage({
				records: [
					{
						slug: "alpha",
						objectiveMd: `${FRONTMATTER}${COMPLETE_OBJECTIVE_MD}`,
						roadmapMd: ROADMAP_MD,
					},
					{ ...MIRROR_COUNTERPART, isClosed: true },
				],
			}),
			{ all: true },
		);

		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.status).toBe("sweep-ok");
		if (exit.data.status !== "sweep-ok") throw new Error("expected sweep-ok result");
		expect(exit.data.errorCount).toBe(0);
		expect(exit.data.warningCount).toBe(1);
		expect(exit.data.violations.map((item) => item.severity)).toEqual(["warning"]);
	});

	test("sweep covers active records and aggregates violations", async () => {
		const exit = await runObjectiveCheckCommand(
			contextWithFakeStorage({
				records: [
					{
						slug: "alpha",
						objectiveMd: `${FRONTMATTER}${COMPLETE_OBJECTIVE_MD}`,
						roadmapMd: ROADMAP_MD,
					},
					{
						slug: "active-dangler",
						objectiveMd: [
							"---",
							"edges:",
							"  - objective: no-such-record",
							"    annotation: Points nowhere.",
							"---",
							"",
							COMPLETE_OBJECTIVE_MD,
						].join("\n"),
						roadmapMd: ROADMAP_MD,
					},
				],
			}),
			{ all: true },
		);

		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.data?.status).toBe("sweep-failed");
		if (exit.data?.status !== "sweep-failed") throw new Error("expected sweep-failed result");
		expect(exit.data.recordCount).toBe(2);
		expect(exit.data.violations.map((item) => item.label)).toEqual([
			"objective.md edge no-such-record endpoint exists",
			"objective.md edge checkout-free-sdl-distribution endpoint exists",
		]);
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
