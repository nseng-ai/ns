import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { describe, expect, test } from "vitest";

import type { ObjectiveCliContext } from "../../src/core/context.ts";
import {
	FakeObjectiveStorageGateway,
	type FakeObjectiveStorageGatewayOptions,
} from "../../src/core/fake-storage.ts";
import { renderReadObjective, runReadObjective } from "../../src/core/operations/read-objective.ts";
import { ObjectiveStorage } from "../../src/core/storage.ts";

const OBJECTIVE_BODY = "# Objective alpha\n\n## Thesis\n\nBody text.\n";

const FRONTMATTER = [
	"---",
	"blocked: Gated on checkout-free distribution landing.",
	"edges:",
	"  - objective: checkout-free-sdl-distribution",
	"    annotation: Hard dependency consumed by this record.",
	"---",
	"",
].join("\n");

describe("objective read with Record Frontmatter", () => {
	test("record without frontmatter omits the recordFrontmatter key entirely", async () => {
		const exit = await runReadObjective(
			contextWithFakeStorage({ records: [{ slug: "alpha", objectiveMd: OBJECTIVE_BODY }] }),
			{ slug: "alpha" },
		);

		if (exit.type !== "ok" || exit.data.status !== "ok") throw new Error("expected ok exit");
		expect(Object.hasOwn(exit.data, "recordFrontmatter")).toBe(false);
		expect(exit.data.markdownFiles.objectiveMd).toEqual({ type: "ok", content: OBJECTIVE_BODY });
	});

	test("record with frontmatter exposes the parse and keeps content verbatim", async () => {
		const content = `${FRONTMATTER}${OBJECTIVE_BODY}`;
		const exit = await runReadObjective(
			contextWithFakeStorage({ records: [{ slug: "alpha", objectiveMd: content }] }),
			{ slug: "alpha" },
		);

		if (exit.type !== "ok" || exit.data.status !== "ok") throw new Error("expected ok exit");
		expect(exit.data.recordFrontmatter).toEqual({
			type: "frontmatter",
			frontmatter: {
				blocked: "Gated on checkout-free distribution landing.",
				edges: [
					{
						objective: "checkout-free-sdl-distribution",
						annotation: "Hard dependency consumed by this record.",
					},
				],
			},
		});
		expect(exit.data.markdownFiles.objectiveMd).toEqual({ type: "ok", content });
	});

	test("renders identically for the shared body with and without frontmatter, plus the verbatim block", async () => {
		const withoutFrontmatter = await runReadObjective(
			contextWithFakeStorage({ records: [{ slug: "alpha", objectiveMd: OBJECTIVE_BODY }] }),
			{ slug: "alpha" },
		);
		const withFrontmatter = await runReadObjective(
			contextWithFakeStorage({
				records: [{ slug: "alpha", objectiveMd: `${FRONTMATTER}${OBJECTIVE_BODY}` }],
			}),
			{ slug: "alpha" },
		);
		if (withoutFrontmatter.type !== "ok" || withoutFrontmatter.data.status !== "ok") {
			throw new Error("expected ok exits");
		}
		if (withFrontmatter.type !== "ok" || withFrontmatter.data.status !== "ok") {
			throw new Error("expected ok exits");
		}

		const renderedWithout = renderReadObjective(withoutFrontmatter.data);
		const renderedWith = renderReadObjective(withFrontmatter.data);
		expect(renderedWith).toBe(
			renderedWithout.replace(OBJECTIVE_BODY, `${FRONTMATTER}${OBJECTIVE_BODY}`),
		);
	});

	test("malformed frontmatter is reported as malformed without disturbing content", async () => {
		const content = `---\nkind: blocking\n---\n${OBJECTIVE_BODY}`;
		const exit = await runReadObjective(
			contextWithFakeStorage({ records: [{ slug: "alpha", objectiveMd: content }] }),
			{ slug: "alpha" },
		);

		if (exit.type !== "ok" || exit.data.status !== "ok") throw new Error("expected ok exit");
		expect(exit.data.recordFrontmatter).toMatchObject({ type: "malformed" });
		expect(exit.data.markdownFiles.objectiveMd).toEqual({ type: "ok", content });
	});

	test("missing objective.md still reads without a recordFrontmatter key", async () => {
		const exit = await runReadObjective(
			contextWithFakeStorage({ records: [{ slug: "alpha", objectiveMd: null }] }),
			{ slug: "alpha" },
		);

		if (exit.type !== "ok" || exit.data.status !== "ok") throw new Error("expected ok exit");
		expect(Object.hasOwn(exit.data, "recordFrontmatter")).toBe(false);
		expect(exit.data.markdownFiles.objectiveMd).toEqual({ type: "missing" });
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
