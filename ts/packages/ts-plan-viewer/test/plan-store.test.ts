import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	encodeSavedTsPlanId,
	listSavedTsPlans,
	readSavedTsPlanSource,
	resolveSavedTsPlanPathFromId,
} from "../src/plan-store.ts";

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "ts-plan-viewer-plan-store-"));
	tempRoots.push(root);
	return root;
}

afterEach(async () => {
	await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("saved TypeScript plan store discovery", () => {
	test("scans only repo/branch .plan.ts files and sorts newest first", async () => {
		const root = await createTempRoot();
		const firstDirectory = join(root, "gh--owner--repo", "main");
		const secondDirectory = join(root, "gh--owner--repo", "feature---branch");
		await mkdir(firstDirectory, { recursive: true });
		await mkdir(secondDirectory, { recursive: true });
		await writeFile(join(firstDirectory, "older.plan.ts"), "export default 1;");
		await writeFile(join(firstDirectory, "ignored.md"), "# ignored");
		await writeFile(join(secondDirectory, "newer.plan.ts"), "export default 2;");

		const plans = await listSavedTsPlans(root);

		expect(plans.map((plan) => plan.fileName)).toEqual(["newer.plan.ts", "older.plan.ts"]);
		expect(plans[0]?.source).toBe("saved");
		expect(plans[0]?.repoKey).toBe("gh--owner--repo");
		expect(plans[0]?.branchKey).toBe("feature---branch");
		expect(plans[0]?.slug).toBe("newer");
		expect(plans[0]?.id).toBe(encodeSavedTsPlanId("gh--owner--repo/feature---branch/newer.plan.ts"));
	});

	test("missing plan store root returns an empty list", async () => {
		const root = join(await createTempRoot(), "missing");

		await expect(listSavedTsPlans(root)).resolves.toEqual([]);
	});

	test("resolves opaque ids and reads source through the configured root", async () => {
		const root = await createTempRoot();
		const directory = join(root, "repo", "main");
		await mkdir(directory, { recursive: true });
		await writeFile(join(directory, "sample.plan.ts"), "export default 'sample';");
		const id = encodeSavedTsPlanId("repo/main/sample.plan.ts");

		const resolved = resolveSavedTsPlanPathFromId(root, id);
		expect(resolved.type).toBe("success");
		if (resolved.type !== "success") return;
		expect(resolved.plan.relativePath).toBe("repo/main/sample.plan.ts");

		const source = await readSavedTsPlanSource(root, id);
		expect(source.type).toBe("success");
		if (source.type !== "success") return;
		expect(source.source).toBe("export default 'sample';");
	});

	test("rejects traversal, absolute, and non-TypeScript-plan ids", () => {
		const root = "/tmp/plan-store";
		const traversal = resolveSavedTsPlanPathFromId(root, encodeSavedTsPlanId("repo/../sample.plan.ts"));
		const absolute = resolveSavedTsPlanPathFromId(root, encodeSavedTsPlanId("/repo/main/sample.plan.ts"));
		const markdown = resolveSavedTsPlanPathFromId(root, encodeSavedTsPlanId("repo/main/sample.md"));
		const rawPath = resolveSavedTsPlanPathFromId(root, "repo/main/sample.plan.ts");

		expect(traversal.type).toBe("failure");
		expect(absolute.type).toBe("failure");
		expect(markdown.type).toBe("failure");
		expect(rawPath.type).toBe("failure");
	});
});
