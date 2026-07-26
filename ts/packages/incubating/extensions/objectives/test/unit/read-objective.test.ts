import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { describe, expect, test } from "vitest";

import type { ObjectiveCliContext } from "../../src/core/context.ts";
import {
	FakeObjectiveStorageGateway,
	type FakeObjectiveStorageGatewayOptions,
} from "../../src/core/fake-storage.ts";
import {
	readObjectiveRequestSchema,
	renderReadObjective,
	runReadObjective,
} from "../../src/core/operations/read-objective.ts";
import { ObjectiveStorage, type ObjectiveMarkdownReadResult } from "../../src/core/storage.ts";

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

describe("objective update reads", () => {
	test("defaults to update inventory without reading update contents", async () => {
		const gateway = new RecordingObjectiveStorageGateway({
			records: [
				{
					slug: "alpha",
					objectiveMd: OBJECTIVE_BODY,
					updates: {
						"20260711T120000Z-first.md": "# First update\n",
						"20260712T120000Z-second.md": "# Second update\n",
					},
				},
			],
		});

		const exit = await runParsedReadObjective(contextWithStorageGateway(gateway), {
			slug: "alpha",
		});

		if (exit.type !== "ok" || exit.data.status !== "ok") throw new Error("expected ok exit");
		expect(exit.data.updates.map((update) => update.name)).toEqual([
			"20260711T120000Z-first.md",
			"20260712T120000Z-second.md",
		]);
		expect(exit.data.updateCount).toBe(2);
		expect(Object.hasOwn(exit.data.markdownFiles, "updates")).toBe(false);
		expect(gateway.readTextFileCalls).not.toContain(
			".ns/objectives/alpha/updates/20260711T120000Z-first.md",
		);
		expect(gateway.readTextFileCalls).not.toContain(
			".ns/objectives/alpha/updates/20260712T120000Z-second.md",
		);

		const rendered = renderReadObjective(exit.data);
		expect(rendered).toContain(
			"2 update files (contents omitted; pass `--include-updates` to include them):",
		);
		expect(rendered).toContain("- `20260711T120000Z-first.md`");
		expect(rendered).toContain("- `20260712T120000Z-second.md`");
		expect(rendered).not.toContain("# First update");
	});

	test("includeUpdates restores full update contents", async () => {
		const gateway = new RecordingObjectiveStorageGateway({
			records: [
				{
					slug: "alpha",
					objectiveMd: OBJECTIVE_BODY,
					updates: { "20260712T120000Z-update.md": "# Included update\n" },
				},
			],
		});

		const exit = await runParsedReadObjective(contextWithStorageGateway(gateway), {
			slug: "alpha",
			includeUpdates: true,
		});

		if (exit.type !== "ok" || exit.data.status !== "ok") throw new Error("expected ok exit");
		expect(exit.data.markdownFiles.updates).toEqual([
			{
				update: {
					name: "20260712T120000Z-update.md",
					path: ".ns/objectives/alpha/updates/20260712T120000Z-update.md",
				},
				content: { type: "ok", content: "# Included update\n" },
			},
		]);
		expect(gateway.readTextFileCalls).toContain(
			".ns/objectives/alpha/updates/20260712T120000Z-update.md",
		);

		const rendered = renderReadObjective(exit.data);
		expect(rendered).toContain("## updates/20260712T120000Z-update.md");
		expect(rendered).toContain("# Included update");
		expect(rendered).not.toContain("contents omitted");
	});

	test.each([false, true])(
		"preserves the missing updates directory message when includeUpdates is $includeUpdates",
		async (includeUpdates) => {
			const exit = await runParsedReadObjective(
				contextWithFakeStorage({
					directories: [".ns/objectives/alpha"],
					files: {
						".ns/objectives/alpha/objective.md": OBJECTIVE_BODY,
						".ns/objectives/alpha/roadmap.md": "# Roadmap\n",
					},
				}),
				{ slug: "alpha", includeUpdates },
			);

			if (exit.type !== "ok" || exit.data.status !== "ok") {
				throw new Error("expected ok exit");
			}
			expect(renderReadObjective(exit.data)).toContain("_Missing `updates/` directory._");
		},
	);

	test.each([false, true])(
		"preserves the empty updates directory message when includeUpdates is $includeUpdates",
		async (includeUpdates) => {
			const exit = await runParsedReadObjective(
				contextWithFakeStorage({ records: [{ slug: "alpha", objectiveMd: OBJECTIVE_BODY }] }),
				{ slug: "alpha", includeUpdates },
			);

			if (exit.type !== "ok" || exit.data.status !== "ok") {
				throw new Error("expected ok exit");
			}
			expect(renderReadObjective(exit.data)).toContain("_No direct update Markdown files found._");
		},
	);
});

describe("objective read with Record Frontmatter", () => {
	test("record without frontmatter omits the recordFrontmatter key entirely", async () => {
		const exit = await runParsedReadObjective(
			contextWithFakeStorage({ records: [{ slug: "alpha", objectiveMd: OBJECTIVE_BODY }] }),
			{ slug: "alpha" },
		);

		if (exit.type !== "ok" || exit.data.status !== "ok") throw new Error("expected ok exit");
		expect(Object.hasOwn(exit.data, "recordFrontmatter")).toBe(false);
		expect(exit.data.markdownFiles.objectiveMd).toEqual({ type: "ok", content: OBJECTIVE_BODY });
	});

	test("record with frontmatter exposes the parse and keeps content verbatim", async () => {
		const content = `${FRONTMATTER}${OBJECTIVE_BODY}`;
		const exit = await runParsedReadObjective(
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
		const withoutFrontmatter = await runParsedReadObjective(
			contextWithFakeStorage({ records: [{ slug: "alpha", objectiveMd: OBJECTIVE_BODY }] }),
			{ slug: "alpha" },
		);
		const withFrontmatter = await runParsedReadObjective(
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
		const exit = await runParsedReadObjective(
			contextWithFakeStorage({ records: [{ slug: "alpha", objectiveMd: content }] }),
			{ slug: "alpha" },
		);

		if (exit.type !== "ok" || exit.data.status !== "ok") throw new Error("expected ok exit");
		expect(exit.data.recordFrontmatter).toMatchObject({ type: "malformed" });
		expect(exit.data.markdownFiles.objectiveMd).toEqual({ type: "ok", content });
	});

	test("missing objective.md still reads without a recordFrontmatter key", async () => {
		const exit = await runParsedReadObjective(
			contextWithFakeStorage({ records: [{ slug: "alpha", objectiveMd: null }] }),
			{ slug: "alpha" },
		);

		if (exit.type !== "ok" || exit.data.status !== "ok") throw new Error("expected ok exit");
		expect(Object.hasOwn(exit.data, "recordFrontmatter")).toBe(false);
		expect(exit.data.markdownFiles.objectiveMd).toEqual({ type: "missing" });
	});
});

async function runParsedReadObjective(
	ctx: ObjectiveCliContext,
	request: { slug?: string; includeUpdates?: boolean },
) {
	return await runReadObjective(ctx, readObjectiveRequestSchema.parse(request));
}

function contextWithFakeStorage(fake: FakeObjectiveStorageGatewayOptions): ObjectiveCliContext {
	return contextWithStorageGateway(new FakeObjectiveStorageGateway(fake));
}

function contextWithStorageGateway(gateway: FakeObjectiveStorageGateway): ObjectiveCliContext {
	return {
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
		repoRoot: "/repo",
		trunkBranch: "master",
		storage: new ObjectiveStorage(gateway),
		git: new InMemoryGitGateway(),
	};
}

class RecordingObjectiveStorageGateway extends FakeObjectiveStorageGateway {
	readonly readTextFileCalls: string[] = [];

	override async readTextFile(relativePath: string): Promise<ObjectiveMarkdownReadResult> {
		this.readTextFileCalls.push(relativePath);
		return await super.readTextFile(relativePath);
	}
}
