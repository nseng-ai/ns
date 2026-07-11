import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { runCommand, type CommandExecApi } from "@nseng-ai/foundation/exec";

import {
	createRealExtensionAcquisitionGateway,
	managedNpmProjectRoot,
	npmPackageRoot,
	resolveDeclaredExtensionModules,
} from "../../src/extensions/acquisition.ts";
import { loadDeclaredExtensionDescriptors } from "../../src/extensions/declared-descriptors.ts";

const request = {
	rawSpec: "npm:@acme/tools@1.2.3",
	packageName: "@acme/tools",
	version: "1.2.3",
	isPinned: true,
} as const;

describe("RealExtensionAcquisitionGateway", () => {
	test("uses the bound exec channel and removes npm lock residue", async () => {
		const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
		const gateway = createRealExtensionAcquisitionGateway({
			async exec(command, args, options) {
				if (options?.cwd === undefined) throw new Error("expected npm cwd");
				calls.push({ command, args: [...args], cwd: options.cwd });
				await writeFile(join(options.cwd, "package-lock.json"), "npm residue");
				return { stdout: "", stderr: "", code: 0, killed: false };
			},
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
		await expect(readFile(join(projectDir, "package-lock.json"), "utf8")).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("normalizes exec rejection into a diagnostic", async () => {
		const gateway = createRealExtensionAcquisitionGateway({
			async exec() {
				throw new Error("npm executable unavailable");
			},
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

	test("preserves killed-process diagnostics", async () => {
		const gateway = createRealExtensionAcquisitionGateway({
			async exec() {
				return {
					stdout: "partial output",
					stderr: "terminated",
					code: 0,
					killed: true,
				};
			},
		});
		const projectDir = await mkdtemp(join(tmpdir(), "ns-extension-acquisition-"));

		await expect(gateway.installNpmPackage({ ...request, projectDir })).resolves.toMatchObject({
			ok: false,
			error: {
				code: "extension_acquisition_npm_install_failed",
				message: expect.stringContaining("terminated"),
			},
		});
	});

	test("preserves startup-failure diagnostics", async () => {
		const gateway = createRealExtensionAcquisitionGateway({
			async exec() {
				return {
					stdout: "",
					stderr: "secondary stderr",
					code: 0,
					killed: false,
					startupError: "spawn npm ENOENT",
				};
			},
		});
		const projectDir = await mkdtemp(join(tmpdir(), "ns-extension-acquisition-"));

		await expect(gateway.installNpmPackage({ ...request, projectDir })).resolves.toMatchObject({
			ok: false,
			error: {
				code: "extension_acquisition_npm_install_failed",
				message: expect.stringContaining("spawn npm ENOENT"),
			},
		});
	});

	test("normalizes package-lock cleanup failure into a diagnostic", async () => {
		const gateway = createRealExtensionAcquisitionGateway({
			async exec() {
				return { stdout: "", stderr: "", code: 0, killed: false };
			},
		});
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

describe("isolated npm project integration", () => {
	test("installing B preserves A bytes and both descriptors remain importable", async () => {
		const fixture = await createTarballFixture([
			{ name: "ns-isolation-a", version: "1.0.0", description: "A" },
			{ name: "ns-isolation-b", version: "2.0.0", description: "B" },
		]);
		const gateway = createRealExtensionAcquisitionGateway(fixture.exec);

		await expectInstalled(fixture.repoRoot, "npm:ns-isolation-a@1.0.0", gateway);
		const aRoot = npmPackageRoot(fixture.repoRoot, "ns-isolation-a");
		const before = await readFile(join(aRoot, "package.json"), "utf8");
		await expectInstalled(fixture.repoRoot, "npm:ns-isolation-b@2.0.0", gateway);

		const loaded = await loadDeclaredExtensionDescriptors({
			repoRoot: fixture.repoRoot,
			specs: ["npm:ns-isolation-a@1.0.0", "npm:ns-isolation-b@2.0.0"],
		});
		expect(loaded.diagnostics).toEqual([]);
		expect(
			loaded.descriptors.map(({ packageName, version, descriptor }) => ({
				packageName,
				version,
				description: descriptor.description,
			})),
		).toEqual([
			{ packageName: "ns-isolation-a", version: "1.0.0", description: "A" },
			{ packageName: "ns-isolation-b", version: "2.0.0", description: "B" },
		]);
		expect(await readFile(join(aRoot, "package.json"), "utf8")).toBe(before);
		for (const packageName of ["ns-isolation-a", "ns-isolation-b"]) {
			await expect(
				readFile(join(managedNpmProjectRoot(fixture.repoRoot, packageName), "package-lock.json")),
			).rejects.toMatchObject({ code: "ENOENT" });
		}
	});

	test("a failed B tarball install leaves A resolvable", async () => {
		const fixture = await createTarballFixture([
			{ name: "ns-isolation-a", version: "1.0.0", description: "A" },
		]);
		const gateway = createRealExtensionAcquisitionGateway(fixture.exec);
		await expectInstalled(fixture.repoRoot, "npm:ns-isolation-a@1.0.0", gateway);

		const failed = await resolveDeclaredExtensionModules({
			projectRoot: fixture.repoRoot,
			declaredSpecs: ["npm:ns-isolation-b@2.0.0"],
			mode: "apply",
			gateway,
		});
		expect(failed.roots).toEqual([]);
		expect(failed.diagnostics).toMatchObject([
			{ code: "extension_acquisition_npm_install_failed", spec: "npm:ns-isolation-b@2.0.0" },
		]);
		const loaded = await loadDeclaredExtensionDescriptors({
			repoRoot: fixture.repoRoot,
			specs: ["npm:ns-isolation-a@1.0.0"],
		});
		expect(loaded.diagnostics).toEqual([]);
		expect(loaded.descriptors).toMatchObject([
			{ packageName: "ns-isolation-a", version: "1.0.0", descriptor: { description: "A" } },
		]);
	});
});

interface TarballPackage {
	readonly name: string;
	readonly version: string;
	readonly description: string;
}

async function createTarballFixture(packages: readonly TarballPackage[]): Promise<{
	repoRoot: string;
	exec: CommandExecApi;
}> {
	const repoRoot = await mkdtemp(join(tmpdir(), "ns-extension-isolation-"));
	const tarballs = new Map<string, string>();
	for (const descriptorPackage of packages) {
		const packageDir = join(repoRoot, "fixtures", descriptorPackage.name);
		const tarballDir = join(repoRoot, "tarballs");
		await mkdir(packageDir, { recursive: true });
		await mkdir(tarballDir, { recursive: true });
		await writeFile(
			join(packageDir, "package.json"),
			JSON.stringify({
				name: descriptorPackage.name,
				version: descriptorPackage.version,
				type: "module",
				exports: { "./ns-extension": "./descriptor.js" },
			}),
		);
		await writeFile(
			join(packageDir, "descriptor.js"),
			`export default ${JSON.stringify({ description: descriptorPackage.description })};\n`,
		);
		const packed = await runCommand("npm", ["pack", "--pack-destination", tarballDir], {
			cwd: packageDir,
		});
		if (packed.code !== 0) throw new Error(`npm pack failed: ${packed.stderr || packed.stdout}`);
		const filename = packed.stdout.trim().split("\n").at(-1);
		if (filename === undefined || filename === "")
			throw new Error("npm pack returned no filename.");
		tarballs.set(
			`${descriptorPackage.name}@${descriptorPackage.version}`,
			join(tarballDir, filename),
		);
	}
	return {
		repoRoot,
		exec: {
			async exec(command, args, options) {
				const requested = args.at(-1);
				const tarball = requested === undefined ? undefined : tarballs.get(requested);
				const installTarget = tarball ?? join(repoRoot, "tarballs", "missing-package.tgz");
				return await runCommand(
					command,
					[...args.slice(0, -1), "--offline", installTarget],
					options,
				);
			},
		},
	};
}

async function expectInstalled(
	repoRoot: string,
	spec: string,
	gateway: ReturnType<typeof createRealExtensionAcquisitionGateway>,
): Promise<void> {
	const result = await resolveDeclaredExtensionModules({
		projectRoot: repoRoot,
		declaredSpecs: [spec],
		mode: "apply",
		gateway,
	});
	expect(result.diagnostics).toEqual([]);
	expect(result.roots).toHaveLength(1);
}
