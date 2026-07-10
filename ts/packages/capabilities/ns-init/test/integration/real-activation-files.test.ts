import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RealActivationFilesGateway } from "../../src/real-activation-files.ts";

describe("RealActivationFilesGateway", () => {
	let repoRoot: string;
	const gateway = new RealActivationFilesGateway();

	beforeEach(async () => {
		repoRoot = await mkdtemp(join(tmpdir(), "ns-init-files-"));
	});

	afterEach(async () => {
		await rm(repoRoot, { recursive: true, force: true });
	});

	it("reads and writes activation files, creating parent directories", async () => {
		expect(await gateway.readActivationFile({ repoRoot, file: "generated-instructions" })).toEqual({
			type: "missing",
		});
		expect(
			await gateway.compareAndWriteActivationFile({
				repoRoot,
				file: "generated-instructions",
				expected: { type: "missing" },
				content: "generated\n",
			}),
		).toEqual({ type: "applied" });
		expect(await gateway.readActivationFile({ repoRoot, file: "generated-instructions" })).toEqual({
			type: "found",
			content: "generated\n",
		});
		expect(await readFile(join(repoRoot, ".ns/instructions.md"), "utf8")).toBe("generated\n");
	});

	it("reads and writes .gitignore through the managed extensions duty", async () => {
		expect(
			await gateway.readActivationFile({ repoRoot, file: "managed-extensions-ignore" }),
		).toEqual({ type: "missing" });
		await gateway.compareAndWriteActivationFile({
			repoRoot,
			file: "managed-extensions-ignore",
			expected: { type: "missing" },
			content: "node_modules/\n.ns/managed-extensions/\n",
		});
		expect(await readFile(join(repoRoot, ".gitignore"), "utf8")).toBe(
			"node_modules/\n.ns/managed-extensions/\n",
		);
	});

	it("creates consumer directories with .gitkeep and preserves consumer data", async () => {
		const path = ".ns/data";
		expect(await gateway.inspectConsumerDirectory({ repoRoot, relativePath: path })).toEqual({
			type: "missing",
		});
		await gateway.compareAndEnsureConsumerDirectory({
			repoRoot,
			relativePath: path,
			expected: { type: "missing" },
		});
		await writeFile(join(repoRoot, path, "customer.md"), "keep\n", "utf8");
		expect(await gateway.inspectConsumerDirectory({ repoRoot, relativePath: path })).toEqual({
			type: "directory",
			gitkeep: "file",
		});
		expect(await readFile(join(repoRoot, path, ".gitkeep"), "utf8")).toBe("");
		expect(await readFile(join(repoRoot, path, "customer.md"), "utf8")).toBe("keep\n");
	});

	it("does not truncate bytes when prepared content comparison fails", async () => {
		const target = join(repoRoot, "AGENTS.md");
		await writeFile(target, "changed after prepare\n", "utf8");
		const result = await gateway.compareAndWriteActivationFile({
			repoRoot,
			file: "agents-instructions",
			expected: { type: "file", content: "prepared bytes\n" },
			content: "replacement\n",
		});
		expect(result).toMatchObject({ type: "mismatch", details: { type: "content" } });
		expect(await readFile(target, "utf8")).toBe("changed after prepare\n");
	});

	it("reports a non-file .gitignore without mutating it", async () => {
		await mkdir(join(repoRoot, ".gitignore"));
		expect(
			await gateway.readActivationFile({ repoRoot, file: "managed-extensions-ignore" }),
		).toEqual({ type: "not-file" });
	});

	it("reports file collisions without mutating them", async () => {
		await mkdir(join(repoRoot, ".ns"), { recursive: true });
		await writeFile(join(repoRoot, ".ns/data"), "consumer data\n", "utf8");
		expect(await gateway.inspectConsumerDirectory({ repoRoot, relativePath: ".ns/data" })).toEqual({
			type: "not-directory",
		});
		expect(await readFile(join(repoRoot, ".ns/data"), "utf8")).toBe("consumer data\n");
	});
});
