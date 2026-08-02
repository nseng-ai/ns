import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { parseArtifactId, serializeArtifactMarker } from "@nseng-ai/gitplane";
import { RealArtifactGateway } from "@nseng-ai/gitplane/cli";
const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function root() {
	const value = await mkdtemp(path.join(os.tmpdir(), "gitplane-test-"));
	roots.push(value);
	return value;
}
const parsed = parseArtifactId("01jxyz8y3jqazj7jrx53w9b3dn");
if (!parsed.ok) throw new Error();
const artifactId = parsed.artifactId;
const marker = serializeArtifactMarker({ artifactId, classification: { state: "generic" } });
test("creates exactly the marker and preserves conflicts", async () => {
	const parent = await root();
	const target = path.join(parent, "artifact");
	const gateway = new RealArtifactGateway({ cwd: parent });
	expect(await gateway.createArtifact({ directory: target, artifactId, marker })).toMatchObject({
		type: "created",
	});
	expect(await readdir(target)).toEqual(["gitplane-artifact.json"]);
	expect(await readFile(path.join(target, "gitplane-artifact.json"), "utf8")).toBe(marker);
	expect(await gateway.createArtifact({ directory: target, artifactId, marker })).toEqual({
		type: "target-exists",
	});
});
test("reports missing parents and rolls back marker failure", async () => {
	const parent = await root();
	const missing = path.join(parent, "missing", "artifact");
	expect(
		await new RealArtifactGateway({ cwd: parent }).createArtifact({
			directory: missing,
			artifactId,
			marker,
		}),
	).toEqual({ type: "parent-missing" });
	const target = path.join(parent, "rollback");
	const gateway = new RealArtifactGateway({
		cwd: parent,
		hooks: {
			beforePublish: async () => {
				throw new Error("injected");
			},
		},
	});
	expect(await gateway.createArtifact({ directory: target, artifactId, marker })).toMatchObject({
		type: "error",
	});
	expect(await readdir(parent)).toEqual([]);
});

test("rollback preserves content concurrently added to the owned directory", async () => {
	const parent = await root();
	const target = path.join(parent, "artifact");
	const gateway = new RealArtifactGateway({
		cwd: parent,
		hooks: {
			beforePublish: async () => {
				await writeFile(path.join(target, "concurrent.txt"), "keep me");
				throw new Error("injected");
			},
		},
	});
	expect(await gateway.createArtifact({ directory: target, artifactId, marker })).toMatchObject({
		type: "error",
	});
	expect(await readdir(target)).toEqual(["concurrent.txt"]);
	expect(await readFile(path.join(target, "concurrent.txt"), "utf8")).toBe("keep me");
});

test("publication does not overwrite a concurrently created marker", async () => {
	const parent = await root();
	const target = path.join(parent, "artifact");
	const concurrentMarker = '{"gpId":"concurrent"}\n';
	const gateway = new RealArtifactGateway({
		cwd: parent,
		hooks: {
			beforePublish: async () => {
				await writeFile(path.join(target, "gitplane-artifact.json"), concurrentMarker, {
					flag: "wx",
				});
			},
		},
	});
	expect(await gateway.createArtifact({ directory: target, artifactId, marker })).toMatchObject({
		type: "error",
	});
	expect(await readdir(target)).toEqual(["gitplane-artifact.json"]);
	expect(await readFile(path.join(target, "gitplane-artifact.json"), "utf8")).toBe(
		concurrentMarker,
	);
});
