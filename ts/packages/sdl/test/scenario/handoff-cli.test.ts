import { rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FakeBrmemGateway } from "@sdl/brmem";
import { InMemoryGitGateway } from "@sdl/core/git/testing";
import { afterEach, describe, expect, test } from "vitest";

import { installCheckedInHandoffExtension } from "../helpers/handoff-extension.ts";
import { parseJsonOutput, runCliWithFakes } from "./sdl-cli-fakes.ts";

const tempDirs: string[] = [];
const HANDOFF_NAMESPACE = "handoff" as const;

afterEach(async () => {
	for (const directory of tempDirs.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("sdl handoff commands", () => {
	test("checked-in handoff extension lists commands in help", async () => {
		const cwd = await createHandoffProject();

		const help = runHandoffCli({ args: ["handoff", "--help"], cwd });
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("");
		expect(output).toContain("Usage: sdl handoff");
		expect(output).toContain("list");
		expect(output).toContain("delete");
		expect(output).toContain("gc");
		expect(help.stderr.join("")).toBe("");
	});

	test("handoff list returns branch-scoped entries from fake storage", async () => {
		const cwd = await createHandoffProject();
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "alpha" });
		await putHandoffEntry(brmem, { key: "bravo.md", branch: "feat/y", content: "bravo" });
		const git = new InMemoryGitGateway({
			currentBranch: "feat/x",
			existingBranches: ["feat/x", "feat/y"],
		});

		const run = runHandoffCli({
			args: ["handoff", "list", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git }) },
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				scope: "branch",
				branch: "feat/x",
				handoffs: [expect.objectContaining({ slug: "alpha", branch: "feat/x" })],
			},
		});
	});

	test("handoff delete requires --yes when non-interactive and deletes with confirmation", async () => {
		const cwd = await createHandoffProject();
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "alpha.md", branch: "feat/x", content: "alpha" });
		const git = new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] });

		const missingYes = runHandoffCli({
			args: ["handoff", "delete", "alpha", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git }) },
		});
		expect(await missingYes.exit).toBe(2);
		expect(parseJsonOutput(missingYes)).toMatchObject({
			status: "usageError",
			data: { missingFlag: "--yes" },
		});
		expect(await getHandoffContent(brmem, { key: "alpha.md", branch: "feat/x" })).toBe("alpha");

		const confirmed = runHandoffCli({
			args: ["handoff", "delete", "--yes", "alpha", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git }) },
		});
		expect(await confirmed.exit).toBe(0);
		expect(parseJsonOutput(confirmed)).toMatchObject({
			status: "ok",
			data: expect.objectContaining({ deleted: true, slug: "alpha" }),
		});
		const remaining = await getHandoffContent(brmem, { key: "alpha.md", branch: "feat/x" });
		expect(remaining).toBeUndefined();
	});

	test("handoff gc dry-run previews deletions and --force is required for mutation", async () => {
		const cwd = await createHandoffProject();
		const brmem = new FakeBrmemGateway();
		await putHandoffEntry(brmem, { key: "stale.md", branch: "feat/stale", content: "stale" });
		const git = new InMemoryGitGateway({ currentBranch: "main", existingBranches: ["main"] });

		const forceRequired = runHandoffCli({
			args: ["handoff", "gc", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git }) },
		});
		expect(await forceRequired.exit).toBe(2);
		expect(parseJsonOutput(forceRequired)).toMatchObject({
			status: "usageError",
			data: { missingFlag: "--force" },
		});

		const dryRun = runHandoffCli({
			args: ["handoff", "gc", "--dry-run", "--format", "json"],
			cwd,
			state: { extensions: handoffExtensionOverrides({ brmem, git }) },
		});
		expect(await dryRun.exit).toBe(0);
		expect(parseJsonOutput(dryRun)).toMatchObject({
			status: "ok",
			data: expect.objectContaining({ dry_run: true, would_delete_count: 1 }),
		});
	});
});

function runHandoffCli(options: {
	args: readonly string[];
	cwd: string;
	state?: Parameters<typeof runCliWithFakes>[0]["state"];
}) {
	return runCliWithFakes(
		{ args: options.args, cwd: options.cwd, state: options.state },
		{ execResponses: () => [], textGenerationResults: () => [] },
	);
}

async function createHandoffProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-handoff-extension-"));
	tempDirs.push(directory);
	installCheckedInHandoffExtension(directory);
	return directory;
}

async function putHandoffEntry(
	gateway: FakeBrmemGateway,
	options: { key: string; branch: string; content: string },
): Promise<void> {
	const result = await gateway.putEntry({
		namespace: HANDOFF_NAMESPACE,
		key: options.key,
		branch: options.branch,
		content: options.content,
	});
	if (result.type === "error") throw new Error(result.error.message);
}

async function getHandoffContent(
	gateway: FakeBrmemGateway,
	options: { key: string; branch: string },
): Promise<string | undefined> {
	const result = await gateway.getEntry({
		namespace: HANDOFF_NAMESPACE,
		key: options.key,
		branch: options.branch,
	});
	if (result.type === "error") throw new Error(result.error.message);
	if (result.type === "missing") return undefined;
	return result.value.content;
}

function handoffExtensionOverrides(overrides: {
	brmem: FakeBrmemGateway;
	git: InMemoryGitGateway;
}) {
	return { handoff: { brmem: overrides.brmem, git: overrides.git } } as const;
}
