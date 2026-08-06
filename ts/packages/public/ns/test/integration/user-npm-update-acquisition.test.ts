import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { userManagedNpmStorage } from "@nseng-ai/sdk/project-config";
import { FakeExtensionAcquisitionGateway } from "@nseng-ai/sdk/testing";
import { afterEach, describe, expect, test } from "vitest";

import {
	RealUserNpmUpdateAcquisitionGateway,
	type PreparedUserNpmUpdate,
} from "../../src/init/extension-acquisition.ts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("real staged User npm update acquisition", () => {
	test("promotes and rolls back only the targeted package", async () => {
		const fixture = await preparedFixture("@acme/tools", true);
		await writeFile(join(fixture.prepared.canonicalProjectRoot, "version"), "old");
		await writeFile(join(fixture.prepared.candidateProjectRoot, "version"), "new");
		const sibling = join(fixture.storage.npmRoot, "@acme", "sibling");
		await mkdir(sibling, { recursive: true });
		await writeFile(join(sibling, "version"), "sibling");

		const promoted = await fixture.gateway.promote(fixture.prepared);
		expect(promoted.type).toBe("promoted");
		expect(await readFile(join(fixture.prepared.canonicalProjectRoot, "version"), "utf8")).toBe(
			"new",
		);
		expect(await readFile(join(fixture.prepared.backupProjectRoot, "version"), "utf8")).toBe("old");
		if (promoted.type !== "promoted") throw new Error("Expected promotion.");
		await expect(fixture.gateway.settle(promoted.promoted, "rollback")).resolves.toEqual({
			type: "settled",
		});
		expect(await readFile(join(fixture.prepared.canonicalProjectRoot, "version"), "utf8")).toBe(
			"old",
		);
		expect(await readFile(join(sibling, "version"), "utf8")).toBe("sibling");
	});

	test("commits promotion and removes retained operation state", async () => {
		const fixture = await preparedFixture("@acme/tools", true);
		await writeFile(join(fixture.prepared.canonicalProjectRoot, "version"), "old");
		await writeFile(join(fixture.prepared.candidateProjectRoot, "version"), "new");

		const promoted = await fixture.gateway.promote(fixture.prepared);
		if (promoted.type !== "promoted") throw new Error("Expected promotion.");
		await expect(fixture.gateway.settle(promoted.promoted, "commit")).resolves.toEqual({
			type: "settled",
		});
		expect(await readFile(join(fixture.prepared.canonicalProjectRoot, "version"), "utf8")).toBe(
			"new",
		);
		await expect(lstat(fixture.prepared.operationRoot)).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("rolls back a newly promoted package when no canonical package existed", async () => {
		const fixture = await preparedFixture("tools", false);
		await writeFile(join(fixture.prepared.candidateProjectRoot, "version"), "new");

		const promoted = await fixture.gateway.promote(fixture.prepared);
		if (promoted.type !== "promoted") throw new Error("Expected promotion.");
		await expect(fixture.gateway.settle(promoted.promoted, "rollback")).resolves.toEqual({
			type: "settled",
		});
		await expect(lstat(fixture.prepared.canonicalProjectRoot)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("recovers promotion interrupted after retaining the backup", async () => {
		const fixture = await preparedFixture("@acme/tools", true);
		await writeFile(join(fixture.prepared.canonicalProjectRoot, "version"), "old");
		await writeFile(join(fixture.prepared.candidateProjectRoot, "version"), "new");
		await mkdir(fixture.prepared.backupProjectRoot, { recursive: true });
		await writeFile(join(fixture.prepared.backupProjectRoot, "version"), "old");
		await rm(fixture.prepared.canonicalProjectRoot, { recursive: true });

		const promoted = await fixture.gateway.promote(fixture.prepared);
		expect(promoted.type).toBe("promoted");
		expect(await readFile(join(fixture.prepared.canonicalProjectRoot, "version"), "utf8")).toBe(
			"new",
		);
	});

	test("rejects prepared source identity that does not match the target package", async () => {
		const fixture = await preparedFixture("tools", false);

		const result = await fixture.gateway.promote({
			...fixture.prepared,
			sourceSpec: "npm:sibling",
		});
		expect(result).toMatchObject({ type: "failed" });
		await expect(lstat(fixture.prepared.canonicalProjectRoot)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("rejects prepared paths that do not match the package-specific candidate layout", async () => {
		const fixture = await preparedFixture("tools", false);
		const siblingCandidate = join(fixture.storage.npmRoot, ".updates", "sibling", "candidate");

		const result = await fixture.gateway.promote({
			...fixture.prepared,
			candidateProjectRoot: siblingCandidate,
			candidateModuleRoot: join(siblingCandidate, "node_modules", "tools"),
		});
		expect(result).toMatchObject({ type: "failed" });
		await expect(lstat(fixture.prepared.canonicalProjectRoot)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("rejects a symbolic-link trusted ancestor before promotion", async () => {
		const fixture = await preparedFixture("tools", false);
		const updatesRoot = join(fixture.storage.npmRoot, ".updates");
		await rm(updatesRoot, { recursive: true });
		const outside = join(fixture.root, "outside");
		await mkdir(outside);
		await symlink(outside, updatesRoot);

		const result = await fixture.gateway.promote(fixture.prepared);
		expect(result).toMatchObject({
			type: "failed",
			retainedPaths: expect.arrayContaining([fixture.prepared.operationRoot]),
		});
		await expect(lstat(fixture.prepared.canonicalProjectRoot)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});
});

async function preparedFixture(packageName: string, canonicalExisted: boolean) {
	const root = await mkdtemp(join(tmpdir(), "ns-user-npm-update-"));
	roots.push(root);
	const extensionsRoot = join(root, "ns", "extensions");
	const storage = userManagedNpmStorage(extensionsRoot);
	await mkdir(storage.npmRoot, { recursive: true });
	const operationId = "operation-1";
	const operationRoot = join(storage.npmRoot, ".updates", ...packageName.split("/"), operationId);
	const candidateProjectRoot = join(operationRoot, "candidate", ...packageName.split("/"));
	const canonicalProjectRoot = join(storage.npmRoot, ...packageName.split("/"));
	await mkdir(candidateProjectRoot, { recursive: true });
	if (canonicalExisted) await mkdir(canonicalProjectRoot, { recursive: true });
	const prepared: PreparedUserNpmUpdate = {
		storage,
		operationId,
		packageName,
		sourceSpec: `npm:${packageName}`,
		intent: "refresh-floating",
		outcome: canonicalExisted ? "refreshed" : "restored",
		candidateModuleRoot: join(candidateProjectRoot, "node_modules", ...packageName.split("/")),
		candidateProjectRoot,
		operationRoot,
		canonicalProjectRoot,
		backupProjectRoot: join(operationRoot, "backup"),
		canonicalExisted,
	};
	return {
		root,
		storage,
		prepared,
		gateway: new RealUserNpmUpdateAcquisitionGateway(new FakeExtensionAcquisitionGateway()),
	};
}
