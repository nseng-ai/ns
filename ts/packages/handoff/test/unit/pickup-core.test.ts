import { FakeBrmemGateway } from "@sdl/brmem";
import { InMemoryGitGateway } from "@sdl/core/git/testing";
import { describe, expect, test } from "vitest";

import { readHandoffArtifact, type HandoffStorageDeps } from "../../src/artifact-storage.ts";

const HANDOFF_NAMESPACE = "handoff";

describe("handoff pickup core", () => {
	test("reads exact slug content with locator and summary metadata", async () => {
		const deps = createDeps(
			new FakeBrmemGateway({
				entries: [
					{
						namespace: HANDOFF_NAMESPACE,
						branch: "feat/x",
						key: "alpha.md",
						content: "# Alpha\n",
						updatedAt: "2026-01-01T00:00:10Z",
					},
				],
			}),
		);

		const result = await readHandoffArtifact(deps, { branch: "feat/x", slug: "alpha" });

		expect(result).toEqual({
			type: "ok",
			value: {
				branch: "feat/x",
				slug: "alpha",
				key: "alpha.md",
				entryLocator: "refs/brmem/ns/handoff/feat---x:alpha.md",
				content: "# Alpha\n",
				summary: {
					branch: "feat/x",
					branchState: "active",
					slug: "alpha",
					key: "alpha.md",
					entryLocator: "refs/brmem/ns/handoff/feat---x:alpha.md",
					updatedAt: "2026-01-01T00:00:10+00:00",
				},
			},
		});
	});

	test("rejects invalid slug before storage read", async () => {
		const deps = createDeps(
			new FakeBrmemGateway({
				operationErrors: { get: { code: "unexpected_read", message: "should not read" } },
			}),
		);

		const result = await readHandoffArtifact(deps, { branch: "feat/x", slug: "BadSlug" });

		expect(result).toMatchObject({
			type: "error",
			error: { code: "invalid-handoff-slug" },
		});
	});

	test("returns handoff-shaped not-found failure for missing artifacts", async () => {
		const result = await readHandoffArtifact(createDeps(), { branch: "feat/x", slug: "missing" });

		expect(result).toEqual({
			type: "error",
			error: {
				code: "handoff-not-found",
				message: "No handoff `missing` found on branch `feat/x`.",
			},
		});
	});

	test("reports gateway read errors as pickup failures", async () => {
		const deps = createDeps(
			new FakeBrmemGateway({
				entries: [
					{
						namespace: HANDOFF_NAMESPACE,
						branch: "feat/x",
						key: "alpha.md",
						content: "# Alpha\n",
					},
				],
				operationErrors: { get: { code: "backend_down", message: "backend unavailable" } },
			}),
		);

		const result = await readHandoffArtifact(deps, { branch: "feat/x", slug: "alpha" });

		expect(result).toEqual({
			type: "error",
			error: {
				code: "backend_down",
				message: "Failed to read handoff: backend unavailable",
			},
		});
	});
});

function createDeps(brmem: FakeBrmemGateway = new FakeBrmemGateway()): HandoffStorageDeps {
	return {
		brmem,
		git: new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"] }),
		cwd: "/repo",
	};
}
