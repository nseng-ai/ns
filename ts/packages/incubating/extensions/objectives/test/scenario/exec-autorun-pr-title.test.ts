import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { objectiveExecAutorunPrTitleNsCommand } from "../../src/ns/commands/exec-autorun-pr-title.ts";
import { FakeObjectiveNsApi, runObjectiveCommand } from "../support/ns-command-harness.ts";

const SLUG = "remediate-high-severity-repeated-switches";

describe("ns objective exec autorun-pr-title scenarios", () => {
	let repoRoot: string;

	beforeEach(async () => {
		repoRoot = await mkdtemp(join(tmpdir(), "ns-objective-pr-title-"));
	});

	afterEach(async () => {
		await rm(repoRoot, { recursive: true, force: true });
	});

	test("computes the default canonical title without any external command", async () => {
		const api = new FakeObjectiveNsApi({ cwd: repoRoot });

		const exit = await runObjectiveCommand(
			objectiveExecAutorunPrTitleNsCommand,
			{
				objectiveSlug: SLUG,
				autorunOrdinal: 1,
				existingTitle: "Centralize Review Harness Execution Diagnostics",
			},
			{ api },
		);

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data).toEqual({
			type: "resolved",
			pointId: "objective.autorun.pr-title",
			source: {
				type: "default",
				label: "manifest default ../publication/templates/autorun-pr-title-default.txt",
			},
			objectiveSlug: SLUG,
			autorunOrdinal: 1,
			existingTitle: "Centralize Review Harness Execution Diagnostics",
			normalizedExistingTitle: "Centralize Review Harness Execution Diagnostics",
			isCanonicalPrefixStripped: false,
			title: `[obj:${SLUG}] [autorun:1] Centralize Review Harness Execution Diagnostics`,
		});
	});

	test("recomputing from an already annotated title returns the same title", async () => {
		const api = new FakeObjectiveNsApi({ cwd: repoRoot });
		const annotated = `[obj:${SLUG}] [autorun:1] Centralize Diagnostics`;

		const exit = await runObjectiveCommand(
			objectiveExecAutorunPrTitleNsCommand,
			{ objectiveSlug: SLUG, autorunOrdinal: 1, existingTitle: annotated },
			{ api },
		);

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data).toMatchObject({
			type: "resolved",
			isCanonicalPrefixStripped: true,
			title: annotated,
		});
	});

	test("uses a repository ns.toml template installation", async () => {
		await writeFile(
			join(repoRoot, "ns.toml"),
			'[points]\n"objective.autorun.pr-title" = "title-template.txt"\n',
		);
		await writeFile(
			join(repoRoot, "title-template.txt"),
			"{{existingTitle}} ({{objectiveSlug}} slice {{autorunOrdinal}})\n",
		);
		const api = new FakeObjectiveNsApi({ cwd: repoRoot });

		const exit = await runObjectiveCommand(
			objectiveExecAutorunPrTitleNsCommand,
			{ objectiveSlug: SLUG, autorunOrdinal: 2, existingTitle: "Fix diagnostics" },
			{ api },
		);

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data).toMatchObject({
			type: "resolved",
			source: { type: "ns.toml", label: "ns.toml text-content title-template.txt" },
			title: `Fix diagnostics (${SLUG} slice 2)`,
		});
	});

	test("uses a conventional .ns/text-content installation", async () => {
		await mkdir(join(repoRoot, ".ns", "text-content"), { recursive: true });
		await writeFile(
			join(repoRoot, ".ns", "text-content", "objective.autorun.pr-title.txt"),
			"[{{objectiveSlug}}/{{autorunOrdinal}}] {{existingTitle}}\n",
		);
		const api = new FakeObjectiveNsApi({ cwd: repoRoot });

		const exit = await runObjectiveCommand(
			objectiveExecAutorunPrTitleNsCommand,
			{ objectiveSlug: SLUG, autorunOrdinal: 3, existingTitle: "Fix diagnostics" },
			{ api },
		);

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data).toMatchObject({
			type: "resolved",
			source: {
				type: "conventional",
				label: ".ns/text-content/objective.autorun.pr-title.txt",
			},
			title: `[${SLUG}/3] Fix diagnostics`,
		});
	});

	test("refuses an unreadable selected template without falling back to the default", async () => {
		await writeFile(
			join(repoRoot, "ns.toml"),
			'[points]\n"objective.autorun.pr-title" = "missing-template.txt"\n',
		);
		const api = new FakeObjectiveNsApi({ cwd: repoRoot });

		const exit = await runObjectiveCommand(
			objectiveExecAutorunPrTitleNsCommand,
			{ objectiveSlug: SLUG, autorunOrdinal: 1, existingTitle: "Fix diagnostics" },
			{ api },
		);

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.data).toMatchObject({ type: "refused", code: "template-source-unreadable" });
	});

	test("refuses an invalid selected template", async () => {
		await writeFile(
			join(repoRoot, "ns.toml"),
			'[points]\n"objective.autorun.pr-title" = "title-template.txt"\n',
		);
		await writeFile(join(repoRoot, "title-template.txt"), "{{existingTitle}} only\n");
		const api = new FakeObjectiveNsApi({ cwd: repoRoot });

		const exit = await runObjectiveCommand(
			objectiveExecAutorunPrTitleNsCommand,
			{ objectiveSlug: SLUG, autorunOrdinal: 1, existingTitle: "Fix diagnostics" },
			{ api },
		);

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.data).toMatchObject({ type: "refused", code: "invalid-template" });
	});

	test("performs no external command execution", async () => {
		const api = new FakeObjectiveNsApi({ cwd: repoRoot });

		await runObjectiveCommand(
			objectiveExecAutorunPrTitleNsCommand,
			{ objectiveSlug: SLUG, autorunOrdinal: 1, existingTitle: "Fix diagnostics" },
			{ api },
		);

		expect(api.execCalls.filter((call) => call.command !== "git")).toEqual([]);
	});
});
