import { mkdtempSync, mkdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RealSlotProvisionFilesGateway } from "../../src/core/gateways/provision-files.ts";

describe("RealSlotProvisionFilesGateway", () => {
	let root: string;
	const gateway = new RealSlotProvisionFilesGateway();

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "slot-provision-"));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("reads ns.toml from the main repo root and returns null when missing", async () => {
		await expect(gateway.readProjectConfigSource(root)).resolves.toBeNull();
		writeFileSync(join(root, "ns.toml"), '[slots]\nprovision = [".env.local"]\n');
		await expect(gateway.readProjectConfigSource(root)).resolves.toBe(
			'[slots]\nprovision = [".env.local"]\n',
		);
	});

	it("inspects path kinds without following symlinks", async () => {
		const filePath = join(root, "file.env");
		writeFileSync(filePath, "x\n");
		const dirPath = join(root, "dir.env");
		mkdirSync(dirPath);
		const linkPath = join(root, "link.env");
		symlinkSync(filePath, linkPath);

		await expect(gateway.inspect(join(root, "absent.env"))).resolves.toBe("missing");
		await expect(gateway.inspect(join(root, "absent", "nested.env"))).resolves.toBe("missing");
		await expect(gateway.inspect(filePath)).resolves.toBe("file");
		await expect(gateway.inspect(dirPath)).resolves.toBe("directory");
		await expect(gateway.inspect(linkPath)).resolves.toBe("symlink");
	});

	it("byte-compares file contents", async () => {
		const left = join(root, "left.env");
		const right = join(root, "right.env");
		writeFileSync(left, "SECRET=1\n");
		writeFileSync(right, "SECRET=1\n");
		await expect(gateway.contentsEqual(left, right)).resolves.toBe(true);
		writeFileSync(right, "SECRET=2\n");
		await expect(gateway.contentsEqual(left, right)).resolves.toBe(false);
	});

	it("copies into a worktree preserving the source mode and creating parents", async () => {
		const storeFile = join(root, "store", ".env.local");
		mkdirSync(dirname(storeFile), { recursive: true });
		writeFileSync(storeFile, "SECRET=1\n", { mode: 0o600 });
		const worktreeFile = join(root, "worktree", "nested", ".env.local");

		await gateway.copyIntoWorktree(storeFile, worktreeFile);

		const stats = statSync(worktreeFile);
		expect(stats.mode & 0o777).toBe(0o600);
	});

	it("copies into the store with 0700 parent directories", async () => {
		const worktreeFile = join(root, "worktree", ".env.local");
		mkdirSync(dirname(worktreeFile), { recursive: true });
		writeFileSync(worktreeFile, "SECRET=1\n", { mode: 0o640 });
		const storeFile = join(root, "store", "provision", "default", ".env.local");

		await gateway.copyIntoStore(worktreeFile, storeFile);

		expect(statSync(storeFile).mode & 0o777).toBe(0o640);
		expect(statSync(dirname(storeFile)).mode & 0o777).toBe(0o700);
	});

	it("resets a drifted destination mode on overwrite", async () => {
		const source = join(root, "source.env");
		writeFileSync(source, "SECRET=1\n", { mode: 0o600 });
		const destination = join(root, "destination.env");
		writeFileSync(destination, "OLD\n", { mode: 0o644 });

		await gateway.copyIntoWorktree(source, destination);

		expect(statSync(destination).mode & 0o777).toBe(0o600);
	});
});
