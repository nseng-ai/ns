import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { RealArtifactGateway } from "@nseng-ai/gitplane/cli";

function git(cwd: string, args: readonly string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
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

test("conservatively reports shallow negative ancestry as incomplete history", async () => {
	const source = await mkdtemp(path.join(os.tmpdir(), "gitplane-shallow-source-"));
	const clone = await mkdtemp(path.join(os.tmpdir(), "gitplane-shallow-clone-"));
	try {
		git(source, ["init", "-b", "main"]);
		git(source, ["config", "user.name", "Gitplane Test"]);
		git(source, ["config", "user.email", "gitplane@example.test"]);
		for (const revision of ["first", "second", "third"]) {
			await writeFile(path.join(source, "body.txt"), revision);
			git(source, ["add", "."]);
			git(source, ["commit", "-m", revision]);
		}
		// A plain local-path clone ignores --depth; the file:// transport honors it.
		git(clone, ["clone", "--depth=2", `file://${source}`, "."]);
		expect(git(clone, ["rev-parse", "--is-shallow-repository"])).toBe("true");
		const tip = git(clone, ["rev-parse", "HEAD"]);
		const parent = git(clone, ["rev-parse", "HEAD~1"]);
		const gateway = new RealArtifactGateway({ cwd: clone });
		expect(await gateway.isAncestor({ ancestor: parent, descendant: tip })).toEqual({
			ok: true,
			value: { type: "found", value: true },
		});
		expect(await gateway.isAncestor({ ancestor: tip, descendant: parent })).toEqual({
			ok: true,
			value: { type: "unavailable", reason: "incomplete-history" },
		});
	} finally {
		await rm(source, { recursive: true, force: true });
		await rm(clone, { recursive: true, force: true });
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
