import { describe, expect, it } from "vitest";

import {
	activeCdDirectivePath,
	SLOT_CD_DIRECTIVE_FILE,
	type CdDirectiveFilesystem,
	writeCdDirectiveIfActive,
} from "../../src/shell/cd-directive.ts";

describe("cd directive", () => {
	it("is inactive when env is absent or empty", () => {
		expect(activeCdDirectivePath({})).toBeNull();
		expect(activeCdDirectivePath({ [SLOT_CD_DIRECTIVE_FILE]: "" })).toBeNull();
	});

	it("suppresses writes when disabled", async () => {
		const filesystem = new FakeDirectiveFilesystem();
		await expect(
			writeCdDirectiveIfActive("/dest", {
				isEnabled: false,
				env: { [SLOT_CD_DIRECTIVE_FILE]: "/tmp/directive" },
				filesystem,
			}),
		).resolves.toEqual({ status: "inactive", path: "/tmp/directive" });
		expect(filesystem.writes()).toEqual([]);
	});

	it("fails when parent dir is missing", async () => {
		const filesystem = new FakeDirectiveFilesystem({ existingParents: [] });
		await expect(
			writeCdDirectiveIfActive("/dest", {
				env: { [SLOT_CD_DIRECTIVE_FILE]: "/tmp/directive" },
				filesystem,
			}),
		).resolves.toMatchObject({
			status: "failed",
			path: "/tmp/directive",
			error: "parent directory does not exist: /tmp",
		});
	});

	it("fails when writing throws", async () => {
		const filesystem = new FakeDirectiveFilesystem({ writeFailure: "permission denied" });
		await expect(
			writeCdDirectiveIfActive("/dest", {
				env: { [SLOT_CD_DIRECTIVE_FILE]: "/tmp/directive" },
				filesystem,
			}),
		).resolves.toMatchObject({ status: "failed", error: "permission denied" });
	});

	it("writes the bare destination string", async () => {
		const filesystem = new FakeDirectiveFilesystem();
		await expect(
			writeCdDirectiveIfActive("/worktree/path", {
				env: { [SLOT_CD_DIRECTIVE_FILE]: "/tmp/directive" },
				filesystem,
			}),
		).resolves.toEqual({ status: "written", path: "/tmp/directive" });
		expect(filesystem.writes()).toEqual([{ path: "/tmp/directive", content: "/worktree/path" }]);
	});
});

class FakeDirectiveFilesystem implements CdDirectiveFilesystem {
	private readonly existingParents: ReadonlySet<string>;
	private readonly writeFailure: string | undefined;
	private readonly log: Array<{ path: string; content: string }> = [];

	constructor(
		options: {
			existingParents?: readonly string[] | undefined;
			writeFailure?: string | undefined;
		} = {},
	) {
		this.existingParents = new Set(options.existingParents ?? ["/tmp"]);
		this.writeFailure = options.writeFailure;
	}

	async parentDirExists(path: string): Promise<boolean> {
		return this.existingParents.has(path.slice(0, path.lastIndexOf("/")) || "/");
	}

	async writeFile(path: string, content: string): Promise<void> {
		if (this.writeFailure !== undefined) throw new Error(this.writeFailure);
		this.log.push({ path, content });
	}

	writes(): readonly { path: string; content: string }[] {
		return this.log.map((entry) => ({ ...entry }));
	}
}
