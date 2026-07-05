import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { OBJECTIVES_DIRECTORY_RELATIVE_PATH } from "../../src/activation-files.ts";
import { RealActivationFilesGateway } from "../../src/real-activation-files.ts";

describe("RealActivationFilesGateway", () => {
	let repoRoot: string;
	const gateway = new RealActivationFilesGateway();

	beforeEach(async () => {
		repoRoot = await mkdtemp(path.join(os.tmpdir(), "ns-init-activation-files-"));
	});

	afterEach(async () => {
		await rm(repoRoot, { recursive: true, force: true });
	});

	it("reports a missing instruction file", async () => {
		const result = await gateway.readInstructionFile({ repoRoot, file: "AGENTS.md" });
		expect(result).toEqual({ type: "missing" });
	});

	it("round-trips an instruction file write", async () => {
		const write = await gateway.writeInstructionFile({
			repoRoot,
			file: "AGENTS.md",
			content: "# Hello\n",
		});
		expect(write).toEqual({ ok: true });
		const read = await gateway.readInstructionFile({ repoRoot, file: "AGENTS.md" });
		expect(read).toEqual({ type: "found", content: "# Hello\n" });
	});

	it("creates the objectives directory with a .gitkeep once", async () => {
		const first = await gateway.ensureObjectivesDirectory({ repoRoot });
		expect(first).toEqual({ ok: true, value: { created: true } });
		const gitkeep = await readFile(
			path.join(repoRoot, OBJECTIVES_DIRECTORY_RELATIVE_PATH, ".gitkeep"),
			"utf8",
		);
		expect(gitkeep).toBe("");

		const second = await gateway.ensureObjectivesDirectory({ repoRoot });
		expect(second).toEqual({ ok: true, value: { created: false } });
	});

	it("does not disturb an existing populated objectives directory", async () => {
		const objectiveDir = path.join(repoRoot, OBJECTIVES_DIRECTORY_RELATIVE_PATH, "my-objective");
		await mkdir(objectiveDir, { recursive: true });
		await writeFile(path.join(objectiveDir, "objective.md"), "# My objective\n", "utf8");

		const result = await gateway.ensureObjectivesDirectory({ repoRoot });
		expect(result).toEqual({ ok: true, value: { created: false } });
		const kept = await readFile(path.join(objectiveDir, "objective.md"), "utf8");
		expect(kept).toBe("# My objective\n");
	});

	it("rejects an objectives path that is not a directory", async () => {
		await mkdir(path.join(repoRoot, ".ns"), { recursive: true });
		await writeFile(path.join(repoRoot, OBJECTIVES_DIRECTORY_RELATIVE_PATH), "not a dir", "utf8");

		const result = await gateway.ensureObjectivesDirectory({ repoRoot });
		expect(result).toMatchObject({
			ok: false,
			error: { code: "objectives-path-not-directory" },
		});
	});
});
