import { describe, expect, it } from "vitest";

import {
	RealUserExtensionConfigGateway,
	type UserExtensionConfigFileInfo,
	type UserExtensionConfigFileOps,
	type UserExtensionConfigWritableFile,
} from "../src/init/real-user-extension-config.ts";

const CONFIG_PATH = "/config/ns/ns.toml";
const TEMP_PATH = "/config/ns/.ns.toml.fixed.tmp";

type FakeOptions = {
	readonly initial?: {
		readonly content: string;
		readonly mode: number;
		readonly type?: "file" | "symlink" | "other";
	};
	readonly fail?: "temp-sync" | "rename" | "directory-sync";
	readonly changeBeforeFinalCheck?: string;
};

class FakeFileOps implements UserExtensionConfigFileOps {
	readonly operations: string[] = [];
	readonly tempFiles = new Map<string, { content: Buffer; mode: number }>();
	destination: { content: string; mode: number; type: "file" | "symlink" | "other" } | undefined;
	private readonly fail: FakeOptions["fail"];
	private readonly changeBeforeFinalCheck: string | undefined;
	private destinationStats = 0;

	constructor(options: FakeOptions = {}) {
		this.destination =
			options.initial === undefined
				? undefined
				: {
						content: options.initial.content,
						mode: options.initial.mode,
						type: options.initial.type ?? "file",
					};
		this.fail = options.fail;
		this.changeBeforeFinalCheck = options.changeBeforeFinalCheck;
	}

	async lstat(path: string): Promise<UserExtensionConfigFileInfo> {
		this.operations.push(`lstat:${path}`);
		if (path !== CONFIG_PATH) throw new Error(`Unexpected lstat ${path}`);
		this.destinationStats += 1;
		if (
			this.destinationStats === 2 &&
			this.changeBeforeFinalCheck !== undefined &&
			this.destination !== undefined
		) {
			this.destination = { ...this.destination, content: this.changeBeforeFinalCheck };
		}
		if (this.destination === undefined) throw nodeError("ENOENT");
		return { type: this.destination.type, mode: this.destination.mode };
	}

	async readFile(path: string): Promise<string> {
		this.operations.push(`read:${path}`);
		if (path !== CONFIG_PATH || this.destination === undefined) throw nodeError("ENOENT");
		return this.destination.content;
	}

	async mkdir(path: string): Promise<void> {
		this.operations.push(`mkdir:${path}`);
	}

	async openExclusive(path: string, mode: number): Promise<UserExtensionConfigWritableFile> {
		this.operations.push(`open:${path}:${mode.toString(8)}`);
		if (this.tempFiles.has(path)) throw nodeError("EEXIST");
		this.tempFiles.set(path, { content: Buffer.alloc(0), mode });
		return {
			write: async (buffer, offset, length, position) => {
				this.operations.push(`write:${position}:${length}`);
				const file = this.tempFiles.get(path);
				if (file === undefined) throw new Error("Temp file missing");
				const written = Math.min(length, 2);
				const nextLength = Math.max(file.content.length, position + written);
				const next = Buffer.alloc(nextLength);
				file.content.copy(next);
				Buffer.from(buffer).copy(next, position, offset, offset + written);
				this.tempFiles.set(path, { ...file, content: next });
				return written;
			},
			sync: async () => {
				this.operations.push("sync-temp");
				if (this.fail === "temp-sync") throw new Error("temp sync failed");
			},
			close: async () => {
				this.operations.push("close-temp");
			},
		};
	}

	async rename(fromPath: string, toPath: string): Promise<void> {
		this.operations.push(`rename:${fromPath}:${toPath}`);
		if (this.fail === "rename") throw new Error("rename failed");
		const temp = this.tempFiles.get(fromPath);
		if (temp === undefined) throw new Error("Temp file missing");
		this.destination = { content: temp.content.toString("utf8"), mode: temp.mode, type: "file" };
		this.tempFiles.delete(fromPath);
	}

	async unlink(path: string): Promise<void> {
		this.operations.push(`unlink:${path}`);
		this.tempFiles.delete(path);
	}

	async syncDirectory(path: string): Promise<void> {
		this.operations.push(`sync-directory:${path}`);
		if (this.fail === "directory-sync") throw new Error("directory sync failed");
	}

	tempName(): string {
		return "fixed";
	}
}

function gateway(fileOps: UserExtensionConfigFileOps): RealUserExtensionConfigGateway {
	return new RealUserExtensionConfigGateway({ env: { XDG_CONFIG_HOME: "/config" }, fileOps });
}

function nodeError(code: string): Error {
	return Object.assign(new Error(code), { code });
}

describe("RealUserExtensionConfigGateway durable replacement", () => {
	it("writes fully to an exclusive sibling, preserves mode, rechecks, renames, and syncs the directory", async () => {
		const fileOps = new FakeFileOps({ initial: { content: "old", mode: 0o100640 } });
		await expect(
			gateway(fileOps).compareAndWrite({
				expected: { type: "file", content: "old" },
				content: "new-value",
			}),
		).resolves.toEqual({ ok: true });

		expect(fileOps.destination).toEqual({ content: "new-value", mode: 0o640, type: "file" });
		expect(fileOps.operations).toEqual([
			`lstat:${CONFIG_PATH}`,
			`read:${CONFIG_PATH}`,
			"mkdir:/config/ns",
			`open:${TEMP_PATH}:640`,
			"write:0:9",
			"write:2:7",
			"write:4:5",
			"write:6:3",
			"write:8:1",
			"sync-temp",
			"close-temp",
			`lstat:${CONFIG_PATH}`,
			`read:${CONFIG_PATH}`,
			`rename:${TEMP_PATH}:${CONFIG_PATH}`,
			"sync-directory:/config/ns",
		]);
	});

	it("uses the temp pipeline and final missing recheck for expected-missing", async () => {
		const fileOps = new FakeFileOps();
		await expect(
			gateway(fileOps).compareAndWrite({ expected: { type: "missing" }, content: "new" }),
		).resolves.toEqual({ ok: true });
		expect(
			fileOps.operations.filter((operation) => operation === `lstat:${CONFIG_PATH}`),
		).toHaveLength(2);
		expect(fileOps.operations).toContain(`open:${TEMP_PATH}:600`);
	});

	it("rejects symlinks on read and write with a stable code", async () => {
		const fileOps = new FakeFileOps({
			initial: { content: "target", mode: 0o120777, type: "symlink" },
		});
		await expect(gateway(fileOps).read()).resolves.toMatchObject({
			type: "error",
			error: { code: "user-config-symlink-unsupported" },
		});
		await expect(
			gateway(fileOps).compareAndWrite({
				expected: { type: "file", content: "target" },
				content: "new",
			}),
		).resolves.toMatchObject({ ok: false, error: { code: "user-config-symlink-unsupported" } });
	});

	it.each(["temp-sync", "rename"] as const)(
		"cleans the temp and leaves the original unchanged on %s failure",
		async (fail) => {
			const fileOps = new FakeFileOps({ initial: { content: "old", mode: 0o100600 }, fail });
			await expect(
				gateway(fileOps).compareAndWrite({
					expected: { type: "file", content: "old" },
					content: "new",
				}),
			).resolves.toMatchObject({ ok: false, error: { code: "user-config-write-failed" } });
			expect(fileOps.destination?.content).toBe("old");
			expect(fileOps.tempFiles.size).toBe(0);
			expect(fileOps.operations).toContain(`unlink:${TEMP_PATH}`);
		},
	);

	it("cleans the temp and refuses replacement when the final content recheck changes", async () => {
		const fileOps = new FakeFileOps({
			initial: { content: "old", mode: 0o100600 },
			changeBeforeFinalCheck: "concurrent",
		});
		await expect(
			gateway(fileOps).compareAndWrite({
				expected: { type: "file", content: "old" },
				content: "new",
			}),
		).resolves.toMatchObject({ ok: false, error: { code: "user-config-prepared-state-mismatch" } });
		expect(fileOps.destination?.content).toBe("concurrent");
		expect(fileOps.tempFiles.size).toBe(0);
		expect(fileOps.operations).not.toContain(`rename:${TEMP_PATH}:${CONFIG_PATH}`);
	});

	it("reports that replacement may be visible when directory sync fails after rename", async () => {
		const fileOps = new FakeFileOps({
			initial: { content: "old", mode: 0o100600 },
			fail: "directory-sync",
		});
		await expect(
			gateway(fileOps).compareAndWrite({
				expected: { type: "file", content: "old" },
				content: "new",
			}),
		).resolves.toMatchObject({
			ok: false,
			error: {
				code: "user-config-write-failed",
				message: expect.stringContaining("may already be visible"),
			},
		});
		expect(fileOps.destination?.content).toBe("new");
	});
});
