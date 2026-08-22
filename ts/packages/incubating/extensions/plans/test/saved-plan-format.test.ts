import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import {
	deriveDeterministicSavedPlanSlug,
	findLatestSavedPlanFile,
	listSavedPlans,
	parseSavedPlanFileName,
	savePlanContentBytes,
} from "../src/index.ts";
import { InMemoryPlanStoreGateway } from "../src/testing.ts";

const commands = {
	exec: async () => ({ type: "exited" as const, stdout: "", stderr: "", code: 0, signal: null }),
};
const git = new InMemoryGitGateway({
	repoRoot: "/repo",
	originUrl: "git@github.com:owner/repo.git",
	currentBranch: "feature/plans",
});

describe("timestamped durable Saved Plans", () => {
	test("derives a validated slug from the first eligible H1 and falls back to exact-byte SHA256", () => {
		const linked = new TextEncoder().encode(
			"# [Ship `Plan` API](https://example.test) <em>Now</em>\n",
		);
		expect(deriveDeterministicSavedPlanSlug(linked, new TextDecoder().decode(linked))).toBe(
			"ship-plan-api-now",
		);
		const fallback = new Uint8Array([0xef, 0xbb, 0xbf, 0x23, 0x20, 0x78, 0x0d, 0x0a]);
		expect(deriveDeterministicSavedPlanSlug(fallback, new TextDecoder().decode(fallback))).toMatch(
			/^saved-plan-[a-f0-9]{12}$/,
		);
	});

	test("publishes exact bytes at one plus the greatest timestamp sequence and selects numerically", async () => {
		const store = new InMemoryPlanStoreGateway();
		const content = new Uint8Array([
			0xef, 0xbb, 0xbf, 0x23, 0x20, 0x53, 0x68, 0x69, 0x70, 0x20, 0x50, 0x6c, 0x61, 0x6e, 0x20,
			0x53, 0x74, 0x6f, 0x72, 0x65, 0x0d, 0x0a,
		]);
		const options = {
			cwd: "/repo",
			planStoreRoot: "/plans",
			git,
			planStoreGateway: store,
			clock: { nowMs: () => new Date(2026, 0, 2, 3, 4, 5).getTime() },
		};
		const first = await savePlanContentBytes(commands, content, options);
		store.writeFile(
			"/plans/gh--owner--repo/feature---plans/other-valid-plan--26-01-02T03-04-05--10.md",
			"# Existing\n",
		);
		const second = await savePlanContentBytes(commands, content, options);

		expect(first.fileName).toBe("ship-plan-store--26-01-02T03-04-05--1.md");
		expect(second.fileName).toBe("ship-plan-store--26-01-02T03-04-05--11.md");
		expect(store.readBytes(first.filePath)).toEqual(content);
		expect((await findLatestSavedPlanFile(commands, options)).sequence).toBe(11);
	});

	test("lists legacy files but excludes them from implicit latest selection", async () => {
		const store = new InMemoryPlanStoreGateway();
		const directory = "/plans/gh--owner--repo/feature---plans";
		store.writeFile(`${directory}/legacy-plan-file.md`, "# Legacy\n");
		const options = { cwd: "/repo", planStoreRoot: "/plans", git, planStoreGateway: store };
		expect(await listSavedPlans(commands, options)).toMatchObject([
			{ format: "legacy", slug: "legacy-plan-file" },
		]);
		await expect(findLatestSavedPlanFile(commands, options)).rejects.toMatchObject({
			reason: "no-plan-files",
			message: expect.stringMatching(/Pass an explicit .* path, or save the plan again/),
		});
	});

	test("requires canonical positive sequences and valid local timestamps", () => {
		expect(parseSavedPlanFileName("specific-saved-plan--26-01-01T00-00-00--10.md")).toMatchObject({
			format: "timestamped",
			sequence: 10,
		});
		expect(
			parseSavedPlanFileName("specific-saved-plan--26-01-01T00-00-00--010.md"),
		).toBeUndefined();
		expect(parseSavedPlanFileName("specific-saved-plan--26-02-30T00-00-00--1.md")).toBeUndefined();
	});

	test("ignores fenced headings and normalizes links, code, HTML, and Unicode in the first H1", () => {
		const content = new TextEncoder().encode(
			"```md\n# Ignore This Fenced Heading\n```\n# [Déploy `Café`](https://example.test) <em>API</em> — Safely ###\n# Later Heading\n",
		);
		expect(deriveDeterministicSavedPlanSlug(content, new TextDecoder().decode(content))).toBe(
			"deploy-cafe-api-safely",
		);
	});

	test("rejects fatal UTF-8 and whitespace-only content", async () => {
		const options = {
			cwd: "/repo",
			planStoreRoot: "/plans",
			git,
			planStoreGateway: new InMemoryPlanStoreGateway(),
		};
		await expect(savePlanContentBytes(commands, new Uint8Array([0xff]), options)).rejects.toThrow(
			"valid UTF-8",
		);
		await expect(
			savePlanContentBytes(commands, new TextEncoder().encode(" \r\n\t"), options),
		).rejects.toThrow("non-whitespace");
	});
});
