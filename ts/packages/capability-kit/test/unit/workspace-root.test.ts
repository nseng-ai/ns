import { describe, expect, test } from "vitest";

import { findWorkspaceRootByMarkers } from "@ns/capability-kit/workspace-root";

function fakeExists(paths: readonly string[]): (path: string) => boolean {
	const existing = new Set(paths);
	return (path) => existing.has(path);
}

describe("findWorkspaceRootByMarkers", () => {
	test("finds the nearest parent directory with all markers", () => {
		const exists = fakeExists([
			"/repo/pnpm-workspace.yaml",
			"/repo/packages/infra/brmem/package.json",
		]);

		expect(
			findWorkspaceRootByMarkers({
				cwd: "/repo/packages/app/src",
				markers: ["pnpm-workspace.yaml", "packages/infra/brmem/package.json"],
				exists,
			}),
		).toBe("/repo");
	});

	test("finds a nested workspace directory while walking from the repo root", () => {
		const exists = fakeExists([
			"/repo/ts/pnpm-workspace.yaml",
			"/repo/ts/packages/infra/brmem/package.json",
		]);

		expect(
			findWorkspaceRootByMarkers({
				cwd: "/repo/packages/app",
				markers: ["pnpm-workspace.yaml", "packages/infra/brmem/package.json"],
				nestedDirectory: "ts",
				exists,
			}),
		).toBe("/repo/ts");
	});

	test("returns null when no directory has all markers", () => {
		const exists = fakeExists(["/repo/pnpm-workspace.yaml"]);

		expect(
			findWorkspaceRootByMarkers({
				cwd: "/repo/packages/app",
				markers: ["pnpm-workspace.yaml", "packages/infra/brmem/package.json"],
				nestedDirectory: "ts",
				exists,
			}),
		).toBeNull();
	});
});
