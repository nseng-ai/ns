import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

const packageRoot = resolve(import.meta.dirname, "../..");
const workspaceRoot = resolve(packageRoot, "../../../..");
const generatedDist = join(packageRoot, "dist");
const temporaryRoots: string[] = [];

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
	rmSync(generatedDist, { recursive: true, force: true });
});

describe("packed brmem CLI", () => {
	test("contains the filesystem inventory and executes from the extracted package", () => {
		const root = mkdtempSync(join(tmpdir(), "brmem-packed-"));
		temporaryRoots.push(root);
		execFileSync(
			"pnpm",
			["--workspace-root", "exec", "ns-dev", "prepare-source-publish-package", packageRoot],
			{
				cwd: workspaceRoot,
			},
		);
		const tarballName = execFileSync(
			"npm",
			["pack", join(generatedDist, "publish"), "--pack-destination", root, "--json"],
			{ encoding: "utf8" },
		);
		const [{ filename }] = JSON.parse(tarballName) as [{ filename: string }];
		execFileSync("tar", ["-xzf", join(root, filename), "-C", root]);
		const extracted = join(root, "package");
		const packedManifest = JSON.parse(readFileSync(join(extracted, "package.json"), "utf8")) as {
			bin: { brmem: string };
		};
		expect(packedManifest.bin.brmem).toBe("src/cli/app.ts");
		for (const route of [
			"check",
			"copy",
			"delete",
			"export",
			"gc",
			"get",
			"list",
			"put",
			"setup-git",
			"exec/resolve-prompt",
		]) {
			expect(readFileSync(join(extracted, "src/cli", route, "metadata.ts"), "utf8")).toContain(
				"metadata",
			);
			expect(readFileSync(join(extracted, "src/cli", route, "command.ts"), "utf8")).toContain(
				"command",
			);
		}
		expect(readFileSync(join(extracted, "src/cli/exec/group.ts"), "utf8")).toContain(
			"hidden: true",
		);

		linkDependency(extracted, "@nseng-ai/clinkr");
		linkDependency(extracted, "@nseng-ai/foundation");
		linkDependency(extracted, "zod");
		const repo = join(root, "repo");
		mkdirSync(repo);
		execFileSync("git", ["init", "-b", "main"], { cwd: repo });
		const app = join(extracted, "src/cli/app.ts");
		const help = execFileSync(process.execPath, [app, "--help"], { cwd: repo, encoding: "utf8" });
		expect(help).toContain("Commands:");
		const result = execFileSync(
			process.execPath,
			[app, "check", "missing.md", "--branch", "main", "--format", "json"],
			{ cwd: repo, encoding: "utf8" },
		);
		expect(JSON.parse(result)).toMatchObject({ status: "success", exitCode: 0 });
	});
});

function linkDependency(extracted: string, dependency: string): void {
	const destination = join(extracted, "node_modules", dependency);
	mkdirSync(dirname(destination), { recursive: true });
	const source =
		dependency === "@nseng-ai/clinkr"
			? join(workspaceRoot, "packages/public/infra/clinkr")
			: dependency === "@nseng-ai/foundation"
				? join(workspaceRoot, "packages/public/infra/foundation")
				: resolve(packageRoot, "node_modules", dependency);
	symlinkSync(source, destination, "junction");
}
