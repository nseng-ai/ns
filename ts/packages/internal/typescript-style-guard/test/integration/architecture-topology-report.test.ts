import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The topology report scripts derive their tier taxonomy from this package's
// src/package-tier-taxonomy.ts, so this package owns the manifest contract the
// extractor enforces. These are real-subprocess smokes (integration lane).
const repoRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));
const extractGraphScript = join(
	repoRoot,
	"skills/architecture-topology-report/scripts/extract-graph.mjs",
);
const topologyScript = join(repoRoot, "skills/architecture-topology-report/scripts/topology");

describe("architecture topology report scripts", () => {
	it("ignores stale dist/ build output when scanning package manifests", () => {
		const root = mkdtempSync(join(tmpdir(), "topology-extract-"));
		const packageDir = join(root, "a");
		mkdirSync(join(packageDir, "dist", "publish"), { recursive: true });
		writeFileSync(
			join(packageDir, "package.json"),
			JSON.stringify({ name: "@fixture/a", ns: { tier: "neutral-infra" } }),
		);
		// A publish manifest legitimately carries no ns.tier; the extractor must
		// not treat it as a workspace package.
		writeFileSync(
			join(packageDir, "dist", "publish", "package.json"),
			JSON.stringify({ name: "@fixture/a" }),
		);

		const stdout = execFileSync("node", [extractGraphScript, "--root", root], {
			encoding: "utf8",
		});
		const graph = JSON.parse(stdout) as { packages: Record<string, unknown> };
		expect(Object.keys(graph.packages)).toEqual(["@fixture/a"]);
	});

	it(
		"runs the `just topology` pipeline end to end against the repository",
		{ timeout: 120_000 },
		() => {
			const reportDir = mkdtempSync(join(tmpdir(), "topology-report-"));
			const stdout = execFileSync(topologyScript, ["--no-open"], {
				cwd: repoRoot,
				encoding: "utf8",
				env: { ...process.env, TMPDIR: reportDir },
			});
			const reportPath = stdout.trim().split("\n").at(-1) ?? "";
			expect(reportPath).toMatch(/architecture-topology-.+\.html$/);
			expect(existsSync(reportPath)).toBe(true);
		},
	);
});
