import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { TrustedTypeScriptConfigGateway } from "@nseng-ai/gitplane/cli";

async function withTemporaryDirectory(run: (directory: string) => Promise<void>): Promise<void> {
	const directory = await mkdtemp(path.join(os.tmpdir(), "gitplane-config-"));
	try {
		await run(directory);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

async function writeConfig(directory: string, artifactRoot: string): Promise<void> {
	await writeFile(
		path.join(directory, "gitplane.config.ts"),
		`export default { source: { id: "source", artifactRoot: ${JSON.stringify(artifactRoot)} }, store: () => { throw new Error("must not construct the store while loading"); } };\n`,
	);
}

test("reports a configuration module that cannot be loaded", async () => {
	await withTemporaryDirectory(async (directory) => {
		expect(await new TrustedTypeScriptConfigGateway().load({ cwd: directory })).toEqual({
			ok: false,
			category: "config-load",
			diagnostic: "Unable to load configuration module.",
			path: "gitplane.config.ts",
		});
	});
});

test("rejects a missing artifact root", async () => {
	await withTemporaryDirectory(async (directory) => {
		await writeConfig(directory, "artifacts");
		expect(await new TrustedTypeScriptConfigGateway().load({ cwd: directory })).toEqual({
			ok: false,
			category: "source-root-invalid",
			diagnostic: "Artifact root is not readable.",
			path: "artifacts",
		});
	});
});

test("rejects an artifact root that is not a directory", async () => {
	await withTemporaryDirectory(async (directory) => {
		await writeFile(path.join(directory, "artifacts"), "artifact");
		await writeConfig(directory, "artifacts");
		expect(await new TrustedTypeScriptConfigGateway().load({ cwd: directory })).toEqual({
			ok: false,
			category: "source-root-invalid",
			diagnostic: "Artifact root must be a real directory within the invocation directory.",
			path: "artifacts",
		});
	});
});

test("rejects an artifact root symlink", async () => {
	await withTemporaryDirectory(async (directory) => {
		await mkdir(path.join(directory, "real-artifacts"));
		await symlink(path.join(directory, "real-artifacts"), path.join(directory, "artifacts"));
		await writeConfig(directory, "artifacts");
		expect(await new TrustedTypeScriptConfigGateway().load({ cwd: directory })).toEqual({
			ok: false,
			category: "source-root-invalid",
			diagnostic: "Artifact root must be a real directory within the invocation directory.",
			path: "artifacts",
		});
	});
});

test("rejects a real artifact root reached through a parent symlink outside cwd", async () => {
	await withTemporaryDirectory(async (directory) => {
		await withTemporaryDirectory(async (outside) => {
			await mkdir(path.join(outside, "artifacts"));
			await symlink(outside, path.join(directory, "redirect"));
			await writeConfig(directory, "redirect/artifacts");
			expect(await new TrustedTypeScriptConfigGateway().load({ cwd: directory })).toEqual({
				ok: false,
				category: "source-root-invalid",
				diagnostic: "Artifact root must be a real directory within the invocation directory.",
				path: "redirect/artifacts",
			});
		});
	});
});
