import { FakeBrmemGateway } from "@ns/brmem";
import { InMemoryGitGateway } from "@ns/capability-kit/git/testing";
import { describe, expect, test } from "vitest";

import {
	createHandoffArtifact,
	prepareHandoffCreation,
	type HandoffStorageDeps,
} from "../../src/core/artifact-storage.ts";

const HANDOFF_NAMESPACE = "handoff";

describe("handoff create core", () => {
	test("prepares a missing handoff target with locator evidence", async () => {
		const deps = createDeps();

		const result = await prepareHandoffCreation(deps, { branch: "feat/x", slug: "alpha" });

		expect(result).toEqual({
			type: "ok",
			value: {
				branch: "feat/x",
				slug: "alpha",
				key: "alpha.md",
				entryLocator: "refs/brmem/ns/handoff/feat---x:alpha.md",
			},
		});
	});

	test("rejects invalid slug before writing", async () => {
		const brmem = new FakeBrmemGateway();
		const deps = createDeps(brmem);

		const result = await prepareHandoffCreation(deps, { branch: "feat/x", slug: "BadSlug" });

		expect(result).toMatchObject({
			type: "error",
			error: { code: "invalid-handoff-slug" },
		});
		expect(await readContent(brmem, { branch: "feat/x", key: "BadSlug.md" })).toBeUndefined();
	});

	test("refuses an existing handoff without writing", async () => {
		const brmem = new FakeBrmemGateway({
			entries: [
				{ namespace: HANDOFF_NAMESPACE, branch: "feat/x", key: "alpha.md", content: "old" },
			],
		});
		const deps = createDeps(brmem);

		const result = await prepareHandoffCreation(deps, { branch: "feat/x", slug: "alpha" });

		expect(result).toEqual({
			type: "error",
			error: {
				code: "handoff-already-exists",
				message: "Handoff `alpha` already exists on branch `feat/x`.",
			},
		});
		expect(await readContent(brmem, { branch: "feat/x", key: "alpha.md" })).toBe("old");
	});

	test("writes content to handoff namespace and returns commit locator evidence", async () => {
		const brmem = new FakeBrmemGateway();
		const deps = createDeps(brmem);

		const result = await createHandoffArtifact(deps, {
			branch: "feat/x",
			key: "alpha.md",
			content: "# Alpha\n",
		});

		expect(result).toMatchObject({
			type: "ok",
			value: {
				branch: "feat/x",
				slug: "alpha",
				key: "alpha.md",
				entryLocator: "refs/brmem/ns/handoff/feat---x:alpha.md",
			},
		});
		if (result.type !== "ok") throw new Error("expected ok result");
		expect(result.value.commit).toMatch(/^commit/);
		expect(await readContent(brmem, { branch: "feat/x", key: "alpha.md" })).toBe("# Alpha\n");
	});

	test("maps a raced create-only collision to handoff already exists without overwriting", async () => {
		const brmem = new FakeBrmemGateway();
		const deps = createDeps(brmem);

		const prepared = await prepareHandoffCreation(deps, { branch: "feat/x", slug: "alpha" });
		expect(prepared).toMatchObject({ type: "ok" });
		await brmem.putEntry({
			namespace: HANDOFF_NAMESPACE,
			branch: "feat/x",
			key: "alpha.md",
			content: "raced content",
		});

		const result = await createHandoffArtifact(deps, {
			branch: "feat/x",
			key: "alpha.md",
			content: "new content",
		});

		expect(result).toEqual({
			type: "error",
			error: {
				code: "handoff-already-exists",
				message: "Handoff `alpha` already exists on branch `feat/x`.",
			},
		});
		expect(await readContent(brmem, { branch: "feat/x", key: "alpha.md" })).toBe("raced content");
	});

	test("reports gateway write errors as create failures", async () => {
		const deps = createDeps(
			new FakeBrmemGateway({
				operationErrors: { create: { code: "backend_down", message: "backend unavailable" } },
			}),
		);

		const result = await createHandoffArtifact(deps, {
			branch: "feat/x",
			key: "alpha.md",
			content: "# Alpha\n",
		});

		expect(result).toEqual({
			type: "error",
			error: {
				code: "backend_down",
				message: "Failed to create handoff: backend unavailable",
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

async function readContent(
	brmem: FakeBrmemGateway,
	options: { branch: string; key: string },
): Promise<string | undefined> {
	const result = await brmem.getEntry({
		namespace: HANDOFF_NAMESPACE,
		branch: options.branch,
		key: options.key,
	});
	if (result.type === "error") throw new Error(result.error.message);
	if (result.type === "missing") return undefined;
	return result.value.content;
}
