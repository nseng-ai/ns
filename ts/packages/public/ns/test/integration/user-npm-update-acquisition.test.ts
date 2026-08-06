import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { userManagedNpmStorage } from "@nseng-ai/sdk/project-config";
import { FakeExtensionAcquisitionGateway } from "@nseng-ai/sdk/testing";
import { afterEach, describe, expect, test } from "vitest";

import {
	RealUserNpmUpdateAcquisitionGateway,
	type PreparedUserNpmUpdate,
} from "../../src/init/user-npm-update-acquisition.ts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("real staged User npm update acquisition", () => {
	test("promotes and rolls back only the targeted package", async () => {
		const fixture = await preparedFixture("@acme/tools", true);
		await writeFile(join(fixture.paths.canonicalProjectRoot, "version"), "old");
		await writeFile(join(fixture.paths.candidateProjectRoot, "version"), "new");
		const sibling = join(fixture.storage.npmRoot, "@acme", "sibling");
		await mkdir(sibling, { recursive: true });
		await writeFile(join(sibling, "version"), "sibling");

		const promoted = await fixture.gateway.promote(fixture.prepared);
		expect(promoted.type).toBe("promoted");
		expect(await readFile(join(fixture.paths.canonicalProjectRoot, "version"), "utf8")).toBe("new");
		expect(await readFile(join(fixture.paths.backupProjectRoot, "version"), "utf8")).toBe("old");
		if (promoted.type !== "promoted") throw new Error("Expected promotion.");
		await expect(fixture.gateway.settle(promoted.promoted, "rollback")).resolves.toEqual({
			type: "settled",
		});
		expect(await readFile(join(fixture.paths.canonicalProjectRoot, "version"), "utf8")).toBe("old");
		expect(await readFile(join(sibling, "version"), "utf8")).toBe("sibling");
	});

	test("commits promotion and removes retained operation state", async () => {
		const fixture = await preparedFixture("@acme/tools", true);
		await writeFile(join(fixture.paths.canonicalProjectRoot, "version"), "old");
		await writeFile(join(fixture.paths.candidateProjectRoot, "version"), "new");

		const promoted = await fixture.gateway.promote(fixture.prepared);
		if (promoted.type !== "promoted") throw new Error("Expected promotion.");
		await expect(fixture.gateway.settle(promoted.promoted, "commit")).resolves.toEqual({
			type: "settled",
		});
		expect(await readFile(join(fixture.paths.canonicalProjectRoot, "version"), "utf8")).toBe("new");
		await expect(lstat(fixture.paths.operationRoot)).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("rolls back a newly promoted package when no canonical package existed", async () => {
		const fixture = await preparedFixture("tools", false);
		await writeFile(join(fixture.paths.candidateProjectRoot, "version"), "new");

		const promoted = await fixture.gateway.promote(fixture.prepared);
		if (promoted.type !== "promoted") throw new Error("Expected promotion.");
		await expect(fixture.gateway.settle(promoted.promoted, "rollback")).resolves.toEqual({
			type: "settled",
		});
		await expect(lstat(fixture.paths.canonicalProjectRoot)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("recovers promotion interrupted after retaining the backup", async () => {
		const fixture = await preparedFixture("@acme/tools", true);
		await writeFile(join(fixture.paths.canonicalProjectRoot, "version"), "old");
		await writeFile(join(fixture.paths.candidateProjectRoot, "version"), "new");
		await mkdir(fixture.paths.backupProjectRoot, { recursive: true });
		await writeFile(join(fixture.paths.backupProjectRoot, "version"), "old");
		await rm(fixture.paths.canonicalProjectRoot, { recursive: true });

		const promoted = await fixture.gateway.promote(fixture.prepared);
		expect(promoted.type).toBe("promoted");
		expect(await readFile(join(fixture.paths.canonicalProjectRoot, "version"), "utf8")).toBe("new");
	});

	test("rejects prepared source identity that does not match the target package", async () => {
		const fixture = await preparedFixture("tools", false);

		const result = await fixture.gateway.promote({
			...fixture.prepared,
			sourceSpec: "npm:sibling",
		});
		expect(result).toMatchObject({ type: "failed", retainedPaths: [] });
		await expect(lstat(fixture.paths.canonicalProjectRoot)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("rejects path-like operation identity without probing its derived paths", async () => {
		const fixture = await preparedFixture("tools", false);

		const result = await fixture.gateway.promote({
			...fixture.prepared,
			operationId: "../sibling",
		});
		expect(result).toMatchObject({ type: "failed", retainedPaths: [] });
		await expect(lstat(fixture.paths.canonicalProjectRoot)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("rejects a candidate module root outside the derived candidate project", async () => {
		const fixture = await preparedFixture("tools", false);

		const result = await fixture.gateway.promote({
			...fixture.prepared,
			candidateModuleRoot: join(fixture.storage.npmRoot, "sibling"),
		});
		expect(result).toMatchObject({ type: "failed" });
		await expect(lstat(fixture.paths.canonicalProjectRoot)).rejects.toMatchObject({
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
		expect(result).toMatchObject({ type: "failed", retainedPaths: [] });
		await expect(lstat(fixture.paths.canonicalProjectRoot)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("does not report residue when failed acquisition created no operation root", async () => {
		const root = await mkdtemp(join(tmpdir(), "ns-user-npm-update-"));
		roots.push(root);
		const storage = userManagedNpmStorage(join(root, "ns", "extensions"));
		await mkdir(storage.npmRoot, { recursive: true });
		const gateway = new RealUserNpmUpdateAcquisitionGateway(
			new FakeExtensionAcquisitionGateway({ failSpecs: ["npm:tools"] }),
		);

		const result = await gateway.prepare({
			repoRoot: root,
			sourceSpec: "npm:tools",
			managedNpmStorage: storage,
		});

		expect(result).toMatchObject({ type: "failed", retainedPaths: [] });
		if (result.type !== "failed") throw new Error("Expected preparation failure.");
		expect(result.diagnostics).toHaveLength(1);
	});
});

async function preparedFixture(packageName: string, canonicalExisted: boolean) {
	const root = await mkdtemp(join(tmpdir(), "ns-user-npm-update-"));
	roots.push(root);
	const extensionsRoot = join(root, "ns", "extensions");
	const storage = userManagedNpmStorage(extensionsRoot);
	await mkdir(storage.npmRoot, { recursive: true });
	const operationId = "operation-1";
	const packageSegments = packageName.split("/");
	const operationRoot = join(storage.npmRoot, ".updates", ...packageSegments, operationId);
	const paths = {
		operationRoot,
		candidateProjectRoot: join(operationRoot, "candidate", ...packageSegments),
		canonicalProjectRoot: join(storage.npmRoot, ...packageSegments),
		backupProjectRoot: join(operationRoot, "backup"),
	};
	await mkdir(paths.candidateProjectRoot, { recursive: true });
	if (canonicalExisted) await mkdir(paths.canonicalProjectRoot, { recursive: true });
	const prepared: PreparedUserNpmUpdate = {
		storage,
		operationId,
		packageName,
		sourceSpec: `npm:${packageName}`,
		intent: "refresh-floating",
		outcome: canonicalExisted ? "refreshed" : "restored",
		canonicalExisted,
		candidateModuleRoot: join(paths.candidateProjectRoot, "node_modules", ...packageSegments),
	};
	return {
		root,
		storage,
		paths,
		prepared,
		gateway: new RealUserNpmUpdateAcquisitionGateway(new FakeExtensionAcquisitionGateway()),
	};
}
