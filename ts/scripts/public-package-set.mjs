import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(workspaceRoot, "..");

export const intendedPublicPackages = [
	"@nseng-ai/branch-context",
	"@nseng-ai/handoffs",
	"@nseng-ai/objectives",
	"@nseng-ai/plans",
	"@nseng-ai/pr-feedback",
	"@nseng-ai/retros",
	"@nseng-ai/reviews",
	"@nseng-ai/slots",
	"@nseng-ai/command-backed-skill-registry",
	"@nseng-ai/ns",
	"@nseng-ai/brmem",
	"@nseng-ai/clinkr",
	"@nseng-ai/foundation",
	"@nseng-ai/areg",
	"@nseng-ai/packagechk",
	"@nseng-ai/vibechk",
	"@nseng-ai/capability-kit",
	"@nseng-ai/flow",
	"@nseng-ai/ccc",
];

export const firstBatchPackages = ["@nseng-ai/capability-kit", "@nseng-ai/flow"];

export const excludedPackages = new Set([
	"@nseng-ai/pi",
	"@nseng-ai/pi-command-surfaces",
	"nscc",
	"@internal/pi-tools",
	"@internal/typescript-style-guard",
]);

export async function readWorkspacePackageManifests() {
	const result = spawnSync(
		"find",
		[
			"packages",
			"-maxdepth",
			"4",
			"-name",
			"package.json",
			"-not",
			"-path",
			"*/node_modules/*",
			"-not",
			"-path",
			"*/dist/*",
		],
		{ cwd: workspaceRoot, encoding: "utf8" },
	);
	if (result.status !== 0) throw new Error(result.stderr || "failed to list workspace package manifests");
	const paths = result.stdout.trim().split("\n").filter(Boolean).sort();
	const entries = [];
	for (const relativePath of paths) {
		const path = resolve(workspaceRoot, relativePath);
		entries.push({ path, root: dirname(path), manifest: await readJson(path) });
	}
	return entries;
}

export async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}
