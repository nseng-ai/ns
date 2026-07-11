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
			await gateway.writeActivationFile({
				repoRoot,
				file: "generated-instructions",
				content: "generated\n",
			}),
		).toEqual({ ok: true });
		expect(await gateway.readActivationFile({ repoRoot, file: "generated-instructions" })).toEqual({
			type: "found",
			content: "generated\n",
		});
		expect(await readFile(join(repoRoot, ".ns/instructions.md"), "utf8")).toBe("generated\n");
	});

	it("creates consumer directories with .gitkeep and preserves consumer data", async () => {
		const path = ".ns/data";
		expect(await gateway.inspectConsumerDirectory({ repoRoot, relativePath: path })).toEqual({
			type: "missing",
		});
		await gateway.ensureConsumerDirectory({ repoRoot, relativePath: path });
		await writeFile(join(repoRoot, path, "customer.md"), "keep\n", "utf8");
		expect(await gateway.inspectConsumerDirectory({ repoRoot, relativePath: path })).toEqual({
			type: "directory",
			gitkeep: "file",
		});
		expect(await readFile(join(repoRoot, path, ".gitkeep"), "utf8")).toBe("");
		expect(await readFile(join(repoRoot, path, "customer.md"), "utf8")).toBe("keep\n");
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
