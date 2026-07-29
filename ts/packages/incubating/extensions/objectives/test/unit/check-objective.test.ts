import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { describe, expect, test } from "vitest";

import type { ObjectiveCliContext } from "../../src/core/context.ts";
import {
	FakeObjectiveStorageGateway,
	type FakeObjectiveStorageGatewayOptions,
} from "../../src/core/fake-storage.ts";
import { FakeObjectiveOwnerGateway } from "../../src/core/owner-gateway.ts";
import { runCheckObjective } from "../../src/core/operations/check-objective.ts";
import { ObjectiveStorage } from "../../src/core/storage.ts";
import { runObjectiveCheckCommand } from "../../src/ns/commands/check.ts";

const OWNER = "tester";

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

const OWNER_ONLY_FRONTMATTER = ["---", `owner: ${OWNER}`, "---", ""].join("\n");

const FRONTMATTER = [
	"---",
	`owner: ${OWNER}`,
	"blocked: Gated on checkout-free distribution landing.",
	"edges:",
	"  - objective: tester/checkout-free-sdl-distribution",
	"    annotation: Hard dependency consumed by this record.",
	"---",
	"",
].join("\n");

const MIRROR_COUNTERPART = {
	owner: OWNER,
	slug: "checkout-free-sdl-distribution",
	objectiveMd: [
		"---",
		`owner: ${OWNER}`,
		"edges:",
		"  - objective: tester/alpha",
		"    annotation: Must land before alpha ships externally.",
		"---",
		"",
		COMPLETE_OBJECTIVE_MD,
	].join("\n"),
	roadmapMd: ROADMAP_MD,
};

describe("objective check with Record Frontmatter", () => {
	test("record with mirrored frontmatter checks identically to the same record with owner-only frontmatter", async () => {
		const withoutEdges = await runCheckObjective(
			contextWithFakeStorage({
				records: [
					{
						owner: OWNER,
						slug: "alpha",
						objectiveMd: `${OWNER_ONLY_FRONTMATTER}${COMPLETE_OBJECTIVE_MD}`,
						roadmapMd: ROADMAP_MD,
					},
				],
			}),
			{ slug: "alpha" },
		);
		const withEdges = await runCheckObjective(
			contextWithFakeStorage({
				records: [
					{
						owner: OWNER,
						slug: "alpha",
						objectiveMd: `${FRONTMATTER}${COMPLETE_OBJECTIVE_MD}`,
						roadmapMd: ROADMAP_MD,
					},
					MIRROR_COUNTERPART,
				],
			}),
			{ slug: "alpha" },
		);

		if (withoutEdges.type !== "ok") throw new Error("expected ok exit");
		expect(withoutEdges.data.status).toBe("ok");
		expect(withoutEdges.data.errorCount).toBe(0);
		expect(withEdges).toEqual(withoutEdges);
	});

	test("bare slugs resolve inside the authenticated owner's namespace with locator facts", async () => {
		const exit = await runCheckObjective(
			contextWithFakeStorage({
				records: [
					{
						owner: OWNER,
						slug: "alpha",
						objectiveMd: `${OWNER_ONLY_FRONTMATTER}${COMPLETE_OBJECTIVE_MD}`,
						roadmapMd: ROADMAP_MD,
					},
				],
			}),
			{ slug: "alpha" },
		);
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data).toMatchObject({
			status: "ok",
			owner: OWNER,
			slug: "alpha",
			locator: "tester/alpha",
			path: ".ns/objectives/tester/alpha",
		});
	});

	test("full locators resolve without the owner gateway", async () => {
		const ownerGateway = new FakeObjectiveOwnerGateway({});
		const exit = await runCheckObjective(
			contextWithFakeStorage(
				{
					records: [
						{
							owner: OWNER,
							slug: "alpha",
							objectiveMd: `${OWNER_ONLY_FRONTMATTER}${COMPLETE_OBJECTIVE_MD}`,
							roadmapMd: ROADMAP_MD,
						},
					],
				},
				ownerGateway,
			),
			{ slug: "tester/alpha" },
		);
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.locator).toBe("tester/alpha");
		expect(ownerGateway.callCount).toBe(0);
	});

	test("bare slug never falls back to another owner's unique record", async () => {
		const exit = await runCheckObjective(
			contextWithFakeStorage({
				records: [
					{
						owner: "someone-else",
						slug: "alpha",
						objectiveMd: ["---", "owner: someone-else", "---", "", COMPLETE_OBJECTIVE_MD].join(
							"\n",
						),
						roadmapMd: ROADMAP_MD,
					},
				],
			}),
			{ slug: "alpha" },
		);
		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.data?.status).toBe("not-found");
	});

	test("bare slug without an authenticated owner fails with locator guidance", async () => {
		const exit = await runCheckObjective(
			contextWithFakeStorage(
				{
					records: [
						{
							owner: OWNER,
							slug: "alpha",
							objectiveMd: `${OWNER_ONLY_FRONTMATTER}${COMPLETE_OBJECTIVE_MD}`,
							roadmapMd: ROADMAP_MD,
						},
					],
				},
				new FakeObjectiveOwnerGateway({}),
			),
			{ slug: "alpha" },
		);
		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.data?.status).toBe("owner-unavailable");
		expect(exit.message).toContain("<owner>/<slug>");
	});

	test("malformed frontmatter is an error while heading lints still evaluate the full content", async () => {
		const unclosedFence = `---\nblocked: never closed\n\n${COMPLETE_OBJECTIVE_MD}`;
		const exit = await runCheckObjective(
			contextWithFakeStorage({
				records: [
					{ owner: OWNER, slug: "alpha", objectiveMd: unclosedFence, roadmapMd: ROADMAP_MD },
				],
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

	test("missing owner frontmatter is an error", async () => {
		const exit = await runCheckObjective(
			contextWithFakeStorage({
				records: [
					{
						owner: OWNER,
						slug: "alpha",
						objectiveMd: COMPLETE_OBJECTIVE_MD,
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
			"objective.md declares required owner frontmatter",
		]);
	});

	test("owner/path disagreement for nested records is an error", async () => {
		const exit = await runCheckObjective(
			contextWithFakeStorage({
				records: [
					{
						owner: OWNER,
						slug: "alpha",
						objectiveMd: `---\nowner: someone-else\n---\n\n${COMPLETE_OBJECTIVE_MD}`,
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
			"objective.md owner matches the owner path segment",
		]);
	});

	test("closure heading lint for closed records reads the frontmatter-stripped body", async () => {
		const exit = await runCheckObjective(
			contextWithFakeStorage({
				records: [
					{
						owner: OWNER,
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

	test("per-locator check reports a dangling edge endpoint as an error", async () => {
		const exit = await runCheckObjective(
			contextWithFakeStorage({
				records: [
					{
						owner: OWNER,
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
			"objective.md edge tester/checkout-free-sdl-distribution endpoint exists",
		]);
	});

	test("edge to an owner-tagged legacy flat closed counterpart is mirrored across layouts", async () => {
		const exit = await runCheckObjective(
			contextWithFakeStorage({
				records: [
					{
						owner: OWNER,
						slug: "alpha",
						objectiveMd: [
							"---",
							`owner: ${OWNER}`,
							"edges:",
							"  - objective: tester/legacy-closed",
							"    annotation: Historical dependency.",
							"---",
							"",
							COMPLETE_OBJECTIVE_MD,
						].join("\n"),
						roadmapMd: ROADMAP_MD,
					},
					{
						owner: OWNER,
						slug: "legacy-closed",
						layout: "legacy-flat-closed",
						objectiveMd: [
							"---",
							`owner: ${OWNER}`,
							"edges:",
							"  - objective: tester/alpha",
							"    annotation: Mirror back-edge.",
							"---",
							"",
							COMPLETE_OBJECTIVE_MD,
							"## Closure",
							"",
						].join("\n"),
						roadmapMd: ROADMAP_MD,
					},
				],
			}),
			{ slug: "alpha" },
		);

		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.status).toBe("ok");
	});
});

describe("objective check --all structural sweep", () => {
	test("rejects a locator combined with --all", async () => {
		const exit = await runObjectiveCheckCommand(
			contextWithFakeStorage({
				records: [
					{
						owner: OWNER,
						slug: "alpha",
						objectiveMd: `${OWNER_ONLY_FRONTMATTER}${COMPLETE_OBJECTIVE_MD}`,
						roadmapMd: ROADMAP_MD,
					},
				],
			}),
			{ slug: "alpha", all: true },
		);

		expect(exit.type).toBe("usageError");
	});

	test("sweep passes on mirrored records and owner-only records", async () => {
		const exit = await runObjectiveCheckCommand(
			contextWithFakeStorage({
				records: [
					{
						owner: OWNER,
						slug: "alpha",
						objectiveMd: `${FRONTMATTER}${COMPLETE_OBJECTIVE_MD}`,
						roadmapMd: ROADMAP_MD,
					},
					MIRROR_COUNTERPART,
					{
						owner: OWNER,
						slug: "plain",
						objectiveMd: `${OWNER_ONLY_FRONTMATTER}${COMPLETE_OBJECTIVE_MD}`,
						roadmapMd: ROADMAP_MD,
					},
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

	test("sweep covers records and aggregates frontmatter violations", async () => {
		const exit = await runObjectiveCheckCommand(
			contextWithFakeStorage({
				records: [
					{
						owner: OWNER,
						slug: "alpha",
						objectiveMd: `${FRONTMATTER}${COMPLETE_OBJECTIVE_MD}`,
						roadmapMd: ROADMAP_MD,
					},
					{
						owner: OWNER,
						slug: "active-dangler",
						objectiveMd: [
							"---",
							`owner: ${OWNER}`,
							"edges:",
							"  - objective: tester/no-such-record",
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
			"objective.md edge tester/no-such-record endpoint exists",
			"objective.md edge tester/checkout-free-sdl-distribution endpoint exists",
		]);
	});

	test("sweep surfaces structural hygiene findings with concrete paths", async () => {
		const exit = await runObjectiveCheckCommand(
			contextWithFakeStorage({
				records: [
					{
						owner: OWNER,
						slug: "alpha",
						objectiveMd: `${OWNER_ONLY_FRONTMATTER}${COMPLETE_OBJECTIVE_MD}`,
						roadmapMd: ROADMAP_MD,
					},
				],
				files: {
					".ns/objectives/flat-open/objective.md": `${OWNER_ONLY_FRONTMATTER}# flat open\n`,
				},
			}),
			{ all: true },
		);

		if (exit.type !== "negative") throw new Error("expected negative exit");
		if (exit.data?.status !== "sweep-failed") throw new Error("expected sweep-failed result");
		expect(exit.data.violations).toEqual([
			{
				path: ".ns/objectives/flat-open",
				label: "Active Objective Root structure is well-formed",
				isPassed: false,
				severity: "error",
				detail: expect.stringContaining("flat open Objective record"),
			},
		]);
	});
});

function contextWithFakeStorage(
	fake: FakeObjectiveStorageGatewayOptions,
	owner: FakeObjectiveOwnerGateway = new FakeObjectiveOwnerGateway({ owner: OWNER }),
): ObjectiveCliContext {
	return {
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
		repoRoot: "/repo",
		trunkBranch: "master",
		storage: new ObjectiveStorage(new FakeObjectiveStorageGateway(fake)),
		git: new InMemoryGitGateway(),
		owner,
	};
}
