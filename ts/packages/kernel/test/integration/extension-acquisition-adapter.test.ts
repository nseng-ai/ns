import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { createRealExtensionAcquisitionGateway } from "../../src/extensions/acquisition.ts";

const request = {
	rawSpec: "npm:@acme/tools@1.2.3",
	packageName: "@acme/tools",
	version: "1.2.3",
	isPinned: true,
} as const;

describe("RealExtensionAcquisitionGateway", () => {
	test("uses the bound exec channel and removes npm lock residue", async () => {
		const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
		const gateway = createRealExtensionAcquisitionGateway(async (command, args, options) => {
			calls.push({ command, args: [...args], cwd: options.cwd });
			return { stdout: "", stderr: "", code: 0 };
		});
		const projectDir = await mkdtemp(join(tmpdir(), "ns-extension-acquisition-"));

		const result = await gateway.installNpmPackage({ ...request, projectDir });

		expect(result).toEqual({ ok: true, value: undefined });
		expect(calls).toEqual([
			{
				command: "npm",
				args: [
					"install",
					"--no-save",
					"--package-lock=false",
					"--ignore-scripts",
					"--legacy-peer-deps",
					"@acme/tools@1.2.3",
				],
				cwd: projectDir,
			},
		]);
	});

	test("normalizes exec rejection into a diagnostic", async () => {
		const gateway = createRealExtensionAcquisitionGateway(async () => {
			throw new Error("npm executable unavailable");
		});
		const projectDir = await mkdtemp(join(tmpdir(), "ns-extension-acquisition-"));

		await expect(gateway.installNpmPackage({ ...request, projectDir })).resolves.toMatchObject({
			ok: false,
			error: {
				code: "extension_acquisition_npm_install_failed",
				message: expect.stringContaining("npm executable unavailable"),
			},
		});
	});

	test("normalizes package-lock cleanup failure into a diagnostic", async () => {
		const gateway = createRealExtensionAcquisitionGateway(async () => ({
			stdout: "",
			stderr: "",
			code: 0,
		}));
		const projectDir = await mkdtemp(join(tmpdir(), "ns-extension-acquisition-"));
		await mkdir(join(projectDir, "package-lock.json", "child"), { recursive: true });

		await expect(gateway.installNpmPackage({ ...request, projectDir })).resolves.toMatchObject({
			ok: false,
			error: {
				code: "extension_acquisition_npm_install_failed",
				message: expect.stringContaining("npm install failed"),
			},
		});
	});
});
