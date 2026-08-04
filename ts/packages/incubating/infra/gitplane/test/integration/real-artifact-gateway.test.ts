import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import { parseArtifactId } from "@nseng-ai/gitplane";
import { RealArtifactGateway } from "@nseng-ai/gitplane/cli";

function git(cwd: string, args: readonly string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

const parsedArtifactId = parseArtifactId("01jxyz8y3jqazj7jrx53w9b3dn");
if (!parsedArtifactId.ok) throw new Error("Test artifact ID must be valid.");
const artifactId = parsedArtifactId.artifactId;
const markerPath = "gitplane-artifact.json";

function marker(extra = ""): string {
	return `{"gpId":"${artifactId}"${extra}}`;
}

function commit(cwd: string, message: string): string {
	git(cwd, ["add", "-A"]);
	git(cwd, ["commit", "-m", message]);
	return git(cwd, ["rev-parse", "HEAD"]);
}
async function repository(): Promise<{
	readonly directory: string;
	readonly first: string;
	readonly second: string;
}> {
	const directory = await mkdtemp(path.join(os.tmpdir(), "gitplane-real-gateway-"));
	git(directory, ["init", "-b", "main"]);
	git(directory, ["config", "user.name", "Gitplane Test"]);
	git(directory, ["config", "user.email", "gitplane@example.test"]);
	await mkdir(path.join(directory, "artifacts", "a", "nested"), { recursive: true });
	await writeFile(
		path.join(directory, "artifacts", "a", "gitplane-artifact.json"),
		'{"gpId":"01jxyz8y3jqazj7jrx53w9b3dn"}',
	);
	await writeFile(path.join(directory, "artifacts", "a", "nested", "body.txt"), "first");
	await symlink("missing-target", path.join(directory, "artifacts", "a", "link"));
	await mkdir(path.join(directory, "artifacts", "blocked", "gitplane-artifact.json"), {
		recursive: true,
	});
	await writeFile(
		path.join(directory, "artifacts", "blocked", "gitplane-artifact.json", "hidden.txt"),
		"hidden",
	);
	git(directory, ["add", "."]);
	git(directory, ["commit", "-m", "first"]);
	const first = git(directory, ["rev-parse", "HEAD"]);
	await writeFile(path.join(directory, "artifacts", "a", "nested", "body.txt"), "second");
	await writeFile(path.join(directory, "outside.txt"), "outside");
	git(directory, ["add", "."]);
	git(directory, ["commit", "-m", "second"]);
	return { directory, first, second: git(directory, ["rev-parse", "HEAD"]) };
}

test("inventories and reads the working tree without following symlinks or marker directories", async () => {
	const repo = await repository();
	try {
		const gateway = new RealArtifactGateway({ cwd: repo.directory });
		const inventory = await gateway.inventoryWorkingTree({ artifactRoot: "artifacts" });
		expect(inventory).toEqual({
			ok: true,
			value: [
				{ path: "artifacts/a", kind: "directory" },
				{ path: "artifacts/a/gitplane-artifact.json", kind: "regular-file" },
				{ path: "artifacts/a/link", kind: "symlink" },
				{ path: "artifacts/a/nested", kind: "directory" },
				{ path: "artifacts/a/nested/body.txt", kind: "regular-file" },
				{ path: "artifacts/blocked", kind: "directory" },
				{ path: "artifacts/blocked/gitplane-artifact.json", kind: "directory" },
			],
		});
		const candidate = await gateway.readWorkingTreeCandidate({ path: "artifacts/a" });
		expect(candidate.ok).toBe(true);
		if (candidate.ok) {
			expect(candidate.value.path).toBe("artifacts/a");
			expect(
				candidate.value.entries.map(({ path: entryPath, kind }) => ({ path: entryPath, kind })),
			).toEqual([
				{ path: "gitplane-artifact.json", kind: "regular-file" },
				{ path: "link", kind: "symlink" },
				{ path: "nested", kind: "directory" },
				{ path: "nested/body.txt", kind: "regular-file" },
			]);
			const body = candidate.value.entries.find(
				(entry): entry is Extract<typeof entry, { kind: "regular-file" }> =>
					entry.path === "nested/body.txt" && entry.kind === "regular-file",
			);
			expect(body === undefined ? undefined : Buffer.from(body.bytes).toString()).toBe("second");
		}
		expect(await gateway.inventoryWorkingTree({ artifactRoot: "../outside" })).toMatchObject({
			ok: false,
		});
	} finally {
		await rm(repo.directory, { recursive: true, force: true });
	}
});

test("reads commit facts, ancestry, filtered tree candidates, and diffs", async () => {
	const repo = await repository();
	try {
		const gateway = new RealArtifactGateway({ cwd: repo.directory });
		expect(await gateway.resolveCommit({ commitish: "HEAD" })).toEqual({
			ok: true,
			value: { type: "found", value: repo.second },
		});
		expect(await gateway.readCommitFacts({ commit: repo.second })).toEqual({
			ok: true,
			value: {
				type: "found",
				value: { commit: repo.second, parents: [repo.first], isMerge: false },
			},
		});
		expect(await gateway.isAncestor({ ancestor: repo.first, descendant: repo.second })).toEqual({
			ok: true,
			value: { type: "found", value: true },
		});
		expect(await gateway.isAncestor({ ancestor: repo.second, descendant: repo.first })).toEqual({
			ok: true,
			value: { type: "found", value: false },
		});
		const inventory = await gateway.inventoryCommitTree({
			commit: repo.second,
			artifactRoot: "artifacts",
		});
		expect(inventory.ok).toBe(true);
		if (inventory.ok && inventory.value.type === "found") {
			expect(inventory.value.value).toContainEqual({
				path: "artifacts/blocked/gitplane-artifact.json",
				kind: "directory",
			});
			expect(inventory.value.value.some((entry) => entry.path.endsWith("hidden.txt"))).toBe(false);
			expect(inventory.value.value).toContainEqual({ path: "artifacts/a/link", kind: "symlink" });
			expect(inventory.value.value.every((entry) => !path.isAbsolute(entry.path))).toBe(true);
		}
		const candidate = await gateway.readCommitTreeCandidate({
			commit: repo.first,
			path: "artifacts/a",
		});
		expect(candidate.ok).toBe(true);
		if (candidate.ok && candidate.value.type === "found") {
			const body = candidate.value.value.entries.find(
				(entry): entry is Extract<typeof entry, { kind: "regular-file" }> =>
					entry.path === "nested/body.txt" && entry.kind === "regular-file",
			);
			expect(body === undefined ? undefined : Buffer.from(body.bytes).toString()).toBe("first");
		}
		expect(await gateway.diffCommits({ fromCommit: repo.first, toCommit: repo.second })).toEqual({
			ok: true,
			value: {
				type: "found",
				value: {
					fromCommit: repo.first,
					toCommit: repo.second,
					changedPaths: ["artifacts/a/nested/body.txt", "outside.txt"],
				},
			},
		});
		expect(
			await gateway.inventoryCommitTree({ commit: repo.second, artifactRoot: "../outside" }),
		).toMatchObject({ ok: false });
	} finally {
		await rm(repo.directory, { recursive: true, force: true });
	}
});

test("attributes marker addition, byte changes, moves, and move-plus-change", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "gitplane-provenance-"));
	try {
		git(directory, ["init", "-b", "main"]);
		git(directory, ["config", "user.name", "Gitplane Test"]);
		git(directory, ["config", "user.email", "gitplane@example.test"]);
		await writeFile(path.join(directory, "unrelated.txt"), "root");
		commit(directory, "root");

		await mkdir(path.join(directory, "artifacts", "added"), { recursive: true });
		await writeFile(path.join(directory, "artifacts", "added", markerPath), marker());
		const added = commit(directory, "add marker");
		await writeFile(path.join(directory, "artifacts", "added", markerPath), marker(',"v":2'));
		const changed = commit(directory, "change marker bytes");
		await rename(
			path.join(directory, "artifacts", "added"),
			path.join(directory, "artifacts", "moved"),
		);
		const moved = commit(directory, "move marker unchanged");
		await mkdir(path.join(directory, "artifacts", "moved-again"), { recursive: true });
		await writeFile(path.join(directory, "artifacts", "moved-again", markerPath), marker(',"v":3'));
		await rm(path.join(directory, "artifacts", "moved"), { recursive: true });
		const movedAndChanged = commit(directory, "move and change marker");
		const unusualPath = "artifacts/:(glob)literal";
		await mkdir(path.join(directory, unusualPath), { recursive: true });
		await writeFile(path.join(directory, unusualPath, markerPath), marker());
		const unusualPathAdded = commit(directory, "add marker at a pathspec-looking literal path");

		const gateway = new RealArtifactGateway({ cwd: directory });
		for (const [targetCommit, artifactPath, expected] of [
			[added, "artifacts/added", added],
			[changed, "artifacts/added", changed],
			[moved, "artifacts/moved", moved],
			[movedAndChanged, "artifacts/moved-again", movedAndChanged],
			[unusualPathAdded, unusualPath, unusualPathAdded],
		] as const) {
			expect(
				await gateway.readMarkerProvenance({
					targetCommit,
					markers: [{ artifactId, path: artifactPath }],
				}),
			).toEqual({
				ok: true,
				value: [{ type: "found", artifactId, markerLastChangedCommit: expected }],
			});
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("reports missing targets, merges, and descendants of merges as provenance facts", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "gitplane-provenance-merge-"));
	try {
		git(directory, ["init", "-b", "main"]);
		git(directory, ["config", "user.name", "Gitplane Test"]);
		git(directory, ["config", "user.email", "gitplane@example.test"]);
		await mkdir(path.join(directory, "artifacts", "a"), { recursive: true });
		await writeFile(path.join(directory, "artifacts", "a", markerPath), marker());
		commit(directory, "base marker");
		git(directory, ["checkout", "-b", "side"]);
		await writeFile(path.join(directory, "side.txt"), "side");
		commit(directory, "side");
		git(directory, ["checkout", "main"]);
		await writeFile(path.join(directory, "main.txt"), "main");
		commit(directory, "main");
		git(directory, ["merge", "--no-ff", "side", "-m", "merge"]);
		const merge = git(directory, ["rev-parse", "HEAD"]);
		await writeFile(path.join(directory, "after-merge.txt"), "single parent");
		const mergeDescendant = commit(directory, "single-parent descendant of merge");
		const gateway = new RealArtifactGateway({ cwd: directory });
		const markers = [{ artifactId, path: "artifacts/a" }];
		for (const targetCommit of [merge, mergeDescendant]) {
			expect(await gateway.readMarkerProvenance({ targetCommit, markers })).toEqual({
				ok: true,
				value: [{ type: "unavailable", artifactId, reason: "incomplete-history" }],
			});
		}
		expect(
			await gateway.readMarkerProvenance({
				targetCommit: "0000000000000000000000000000000000000000",
				markers,
			}),
		).toEqual({
			ok: true,
			value: [{ type: "unavailable", artifactId, reason: "missing-object" }],
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("reports incomplete marker history from a real shallow clone", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "gitplane-provenance-shallow-"));
	const source = path.join(directory, "source");
	const clone = path.join(directory, "clone");
	try {
		await mkdir(source);
		git(source, ["init", "-b", "main"]);
		git(source, ["config", "user.name", "Gitplane Test"]);
		git(source, ["config", "user.email", "gitplane@example.test"]);
		await mkdir(path.join(source, "artifacts", "a"), { recursive: true });
		await writeFile(path.join(source, "artifacts", "a", markerPath), marker());
		commit(source, "add marker");
		await writeFile(path.join(source, "later.txt"), "later");
		commit(source, "leave marker unchanged");

		git(directory, ["clone", "--depth=1", pathToFileURL(source).href, clone]);
		const targetCommit = git(clone, ["rev-parse", "HEAD"]);
		const gateway = new RealArtifactGateway({ cwd: clone });
		expect(
			await gateway.readMarkerProvenance({
				targetCommit,
				markers: [{ artifactId, path: "artifacts/a" }],
			}),
		).toEqual({
			ok: true,
			value: [{ type: "unavailable", artifactId, reason: "incomplete-history" }],
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("parses gitlinks as submodules without network access", async () => {
	const repo = await repository();
	try {
		const object = git(repo.directory, ["rev-parse", "HEAD"]);
		git(repo.directory, [
			"update-index",
			"--add",
			"--cacheinfo",
			`160000,${object},artifacts/local-submodule`,
		]);
		git(repo.directory, ["commit", "-m", "gitlink"]);
		const commit = git(repo.directory, ["rev-parse", "HEAD"]);
		const gateway = new RealArtifactGateway({ cwd: repo.directory });
		const inventory = await gateway.inventoryCommitTree({ commit, artifactRoot: "artifacts" });
		expect(inventory).toMatchObject({ ok: true });
		if (inventory.ok && inventory.value.type === "found")
			expect(inventory.value.value).toContainEqual({
				path: "artifacts/local-submodule",
				kind: "submodule",
			});
	} finally {
		await rm(repo.directory, { recursive: true, force: true });
	}
});
