import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "vitest";

import { commandSucceeded, runCommand, type CommandExecApi } from "@nseng-ai/foundation/exec";

import {
	createRealExtensionAcquisitionGateway,
	managedNpmProjectRoot,
	npmPackageRoot,
	projectManagedNpmStorage,
	resolveDeclaredExtensionModules,
	userManagedNpmStorage,
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
				return { type: "exited", stdout: "", stderr: "", code: 0, signal: null };
			},
		});
		const { storage, projectDir } = await createPreparedProject(gateway);

		const result = await gateway.installNpmPackage({ ...request, storage });

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

	test.each([
		["ns root", ["ns"]],
		["extensions root", ["ns", "extensions"]],
		["npm root", ["ns", "extensions", "npm"]],
		["scope root", ["ns", "extensions", "npm", "@acme"]],
		["package project", ["ns", "extensions", "npm", "@acme", "tools"]],
	] as const)(
		"prepare and install reject a user-storage symlink at the %s",
		async (_label, parts) => {
			const dataRoot = await mkdtemp(join(tmpdir(), "ns-user-extension-unsafe-"));
			const storage = userManagedNpmStorage(join(dataRoot, "ns", "extensions"));
			const unsafePath = join(dataRoot, ...parts);
			const target = await mkdtemp(join(tmpdir(), "ns-extension-unsafe-target-"));
			await mkdir(dirname(unsafePath), { recursive: true });
			await symlink(target, unsafePath);

			await expectPreparationAndInstallRejected(storage, request.packageName);

			expect(await readdir(target)).toEqual([]);
		},
	);

	test.each([
		["ns root", ["ns"]],
		["extensions root", ["ns", "extensions"]],
		["npm root", ["ns", "extensions", "npm"]],
		["scope root", ["ns", "extensions", "npm", "@acme"]],
		["package project", ["ns", "extensions", "npm", "@acme", "tools"]],
	] as const)(
		"prepare and install reject a non-directory at the user-storage %s",
		async (_label, parts) => {
			const dataRoot = await mkdtemp(join(tmpdir(), "ns-user-extension-unsafe-"));
			const storage = userManagedNpmStorage(join(dataRoot, "ns", "extensions"));
			const unsafePath = join(dataRoot, ...parts);
			await mkdir(dirname(unsafePath), { recursive: true });
			await writeFile(unsafePath, "keep");

			await expectPreparationAndInstallRejected(storage, request.packageName);

			await expect(readFile(unsafePath, "utf8")).resolves.toBe("keep");
		},
	);

	test.each(["symlink", "non-regular"] as const)(
		"prepare and install reject an existing %s package.json",
		async (manifestKind) => {
			const dataRoot = await mkdtemp(join(tmpdir(), "ns-user-extension-unsafe-"));
			const storage = userManagedNpmStorage(join(dataRoot, "ns", "extensions"));
			const projectRoot = join(storage.npmRoot, "@acme", "tools");
			const manifest = join(projectRoot, "package.json");
			await mkdir(projectRoot, { recursive: true });
			if (manifestKind === "symlink") {
				const target = join(dataRoot, "manifest-target.json");
				await writeFile(target, "keep");
				await symlink(target, manifest);

				await expectPreparationAndInstallRejected(storage, request.packageName);

				await expect(readFile(target, "utf8")).resolves.toBe("keep");
			} else {
				await mkdir(manifest);
				await writeFile(join(manifest, "keep"), "keep");

				await expectPreparationAndInstallRejected(storage, request.packageName);

				await expect(readFile(join(manifest, "keep"), "utf8")).resolves.toBe("keep");
			}
			await expect(lstat(join(projectRoot, "package-lock.json"))).rejects.toMatchObject({
				code: "ENOENT",
			});
		},
	);

	test("install revalidates the project chain immediately before exec", async () => {
		let execCalls = 0;
		const gateway = createRealExtensionAcquisitionGateway({
			async exec() {
				execCalls += 1;
				return { type: "exited", stdout: "", stderr: "", code: 0, signal: null };
			},
		});
		const { storage, projectDir } = await createPreparedProject(gateway);
		const target = await mkdtemp(join(tmpdir(), "ns-extension-unsafe-target-"));
		await rm(projectDir, { recursive: true });
		await symlink(target, projectDir);

		await expect(gateway.installNpmPackage({ ...request, storage })).resolves.toMatchObject({
			ok: false,
			error: { code: "extension_acquisition_npm_install_failed", path: projectDir },
		});
		expect(execCalls).toBe(0);
		await expect(lstat(join(target, "package-lock.json"))).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("detects a pre-existing incomplete project before ensure restores its package bytes", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "ns-extension-incomplete-"));
		const projectRoot = managedNpmProjectRoot(repoRoot, "plain");
		await mkdir(projectRoot, { recursive: true });
		await writeFile(join(projectRoot, "package.json"), "{}");
		const gateway = createRealExtensionAcquisitionGateway({
			async exec(_command, _args, options) {
				if (options?.cwd === undefined) throw new Error("expected npm cwd");
				const packageRoot = join(options.cwd, "node_modules", "plain");
				await mkdir(packageRoot, { recursive: true });
				await writeFile(join(packageRoot, "package.json"), "{}");
				return { type: "exited", stdout: "", stderr: "", code: 0, signal: null };
			},
		});

		const result = await resolveDeclaredExtensionModules({
			projectRoot: repoRoot,
			declaredSpecs: ["npm:plain"],
			mode: "apply",
			gateway,
		});

		expect(result.roots).toMatchObject([{ wasInstalled: false, packageProjectExisted: true }]);
		await expect(readFile(join(projectRoot, "package.json"), "utf8")).resolves.toBe("{}");
		await expect(
			readFile(join(npmPackageRoot(repoRoot, "plain"), "package.json"), "utf8"),
		).resolves.toBe("{}");
	});

	test("removes unscoped and scoped package projects without removing siblings", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "ns-extension-remove-"));
		const gateway = createRealExtensionAcquisitionGateway({
			async exec() {
				throw new Error("not used");
			},
		});
		const storage = projectManagedNpmStorage(repoRoot);
		const unscoped = managedNpmProjectRoot(repoRoot, "plain");
		const scoped = managedNpmProjectRoot(repoRoot, "@scope/target");
		const sibling = managedNpmProjectRoot(repoRoot, "@scope/sibling");
		for (const path of [unscoped, scoped, sibling]) {
			await mkdir(path, { recursive: true });
			await writeFile(join(path, "package.json"), "{}");
		}

		await expect(
			gateway.removeManagedNpmPackage({ storage, packageName: "plain" }),
		).resolves.toEqual({ ok: true, value: { status: "removed", path: unscoped } });
		await expect(
			gateway.removeManagedNpmPackage({ storage, packageName: "@scope/target" }),
		).resolves.toEqual({ ok: true, value: { status: "removed", path: scoped } });
		await expect(lstat(unscoped)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(lstat(scoped)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(readFile(join(sibling, "package.json"), "utf8")).resolves.toBe("{}");
	});

	test("returns already absent and prunes an empty scope below the shared npm root", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "ns-extension-remove-"));
		const gateway = createRealExtensionAcquisitionGateway({
			async exec() {
				throw new Error("not used");
			},
		});
		const storage = projectManagedNpmStorage(repoRoot);
		const project = managedNpmProjectRoot(repoRoot, "@scope/only");
		await mkdir(project, { recursive: true });
		await writeFile(join(project, "package.json"), "{}");

		await expect(
			gateway.removeManagedNpmPackage({ storage, packageName: "@scope/only" }),
		).resolves.toMatchObject({ ok: true, value: { status: "removed", path: project } });
		await expect(lstat(join(repoRoot, ".ns/managed-extensions/npm/@scope"))).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(lstat(join(repoRoot, ".ns/managed-extensions/npm"))).resolves.toBeDefined();
		await expect(
			gateway.removeManagedNpmPackage({ storage, packageName: "@scope/only" }),
		).resolves.toEqual({ ok: true, value: { status: "already-absent", path: project } });
	});

	test("rejects symlinks and non-directories in the managed package chain", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "ns-extension-remove-"));
		const gateway = createRealExtensionAcquisitionGateway({
			async exec() {
				throw new Error("not used");
			},
		});
		const storage = projectManagedNpmStorage(repoRoot);
		const npmRoot = join(repoRoot, ".ns/managed-extensions/npm");
		await mkdir(npmRoot, { recursive: true });
		await symlink(repoRoot, join(npmRoot, "linked"));
		await writeFile(join(npmRoot, "not-directory"), "keep");

		for (const packageName of ["linked", "not-directory"]) {
			await expect(
				gateway.removeManagedNpmPackage({ storage, packageName }),
			).resolves.toMatchObject({
				ok: false,
				error: { code: "extension_acquisition_npm_remove_failed" },
			});
		}
		await expect(readFile(join(npmRoot, "not-directory"), "utf8")).resolves.toBe("keep");
	});

	test.each([
		["ns data root", (dataRoot: string) => join(dataRoot, "ns")],
		["extensions root", (dataRoot: string) => join(dataRoot, "ns", "extensions")],
		["npm root", (dataRoot: string) => join(dataRoot, "ns", "extensions", "npm")],
	] as const)("rejects unsafe user storage at the %s", async (_label, unsafePath) => {
		const dataRoot = await mkdtemp(join(tmpdir(), "ns-user-extension-unsafe-"));
		const extensionsRoot = join(dataRoot, "ns", "extensions");
		const storage = userManagedNpmStorage(extensionsRoot);
		const gateway = createRealExtensionAcquisitionGateway({
			async exec() {
				throw new Error("not used");
			},
		});
		const path = unsafePath(dataRoot);
		await mkdir(join(dataRoot, "target"), { recursive: true });
		await mkdir(join(dataRoot, "ns", "extensions", "npm", "plain"), { recursive: true });
		await rm(path, { recursive: true });
		await symlink(join(dataRoot, "target"), path);

		await expect(
			gateway.removeManagedNpmPackage({ storage, packageName: "plain" }),
		).resolves.toMatchObject({
			ok: false,
			error: { code: "extension_acquisition_npm_remove_failed", path },
		});
	});

	test("rejects a non-directory in the user storage chain", async () => {
		const dataRoot = await mkdtemp(join(tmpdir(), "ns-user-extension-unsafe-"));
		const extensionsRoot = join(dataRoot, "ns", "extensions");
		const storage = userManagedNpmStorage(extensionsRoot);
		const gateway = createRealExtensionAcquisitionGateway({
			async exec() {
				throw new Error("not used");
			},
		});
		await mkdir(join(dataRoot, "ns"), { recursive: true });
		await writeFile(extensionsRoot, "keep");

		await expect(
			gateway.removeManagedNpmPackage({ storage, packageName: "plain" }),
		).resolves.toMatchObject({
			ok: false,
			error: { code: "extension_acquisition_npm_remove_failed", path: extensionsRoot },
		});
		await expect(readFile(extensionsRoot, "utf8")).resolves.toBe("keep");
	});

	test("does not assume ownership of an arbitrary XDG data-home ancestor", async () => {
		const dataRoot = await mkdtemp(join(tmpdir(), "ns-user-extension-boundary-"));
		const extensionsRoot = join(dataRoot, "ns", "extensions");
		const storage = userManagedNpmStorage(extensionsRoot);
		expect(storage.trustedAncestors).toEqual([
			join(dataRoot, "ns"),
			extensionsRoot,
			join(extensionsRoot, "npm"),
		]);
	});

	test("removes from user storage while preserving shared roots and scoped siblings", async () => {
		const dataRoot = await mkdtemp(join(tmpdir(), "ns-user-extension-remove-"));
		const extensionsRoot = join(dataRoot, "ns", "extensions");
		const storage = userManagedNpmStorage(extensionsRoot);
		const gateway = createRealExtensionAcquisitionGateway({
			async exec() {
				throw new Error("not used");
			},
		});
		const target = join(storage.npmRoot, "@scope", "target");
		const sibling = join(storage.npmRoot, "@scope", "sibling");
		for (const path of [target, sibling]) {
			await mkdir(path, { recursive: true });
			await writeFile(join(path, "package.json"), "{}");
		}

		await expect(
			gateway.removeManagedNpmPackage({ storage, packageName: "@scope/target" }),
		).resolves.toEqual({ ok: true, value: { status: "removed", path: target } });
		await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(readFile(join(sibling, "package.json"), "utf8")).resolves.toBe("{}");
		await expect(lstat(storage.npmRoot)).resolves.toBeDefined();
		await expect(lstat(extensionsRoot)).resolves.toBeDefined();
	});

	test("normalizes exec rejection into a diagnostic", async () => {
		const gateway = createRealExtensionAcquisitionGateway({
			async exec() {
				throw new Error("npm executable unavailable");
			},
		});
		const { storage } = await createPreparedProject(gateway);

		await expect(gateway.installNpmPackage({ ...request, storage })).resolves.toMatchObject({
			ok: false,
			error: {
				code: "extension_acquisition_npm_install_failed",
				message: expect.stringContaining("npm executable unavailable"),
			},
		});
	});

	test("preserves terminated-process diagnostics", async () => {
		const gateway = createRealExtensionAcquisitionGateway({
			async exec() {
				return {
					type: "timed-out",
					stdout: "partial output",
					stderr: "terminated",
					code: null,
					signal: "SIGTERM",
				};
			},
		});
		const { storage } = await createPreparedProject(gateway);

		await expect(gateway.installNpmPackage({ ...request, storage })).resolves.toMatchObject({
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
					type: "spawn-failed",
					stdout: "",
					stderr: "secondary stderr",
					error: "spawn npm ENOENT",
				};
			},
		});
		const { storage } = await createPreparedProject(gateway);

		await expect(gateway.installNpmPackage({ ...request, storage })).resolves.toMatchObject({
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
				return { type: "exited", stdout: "", stderr: "", code: 0, signal: null };
			},
		});
		const { storage, projectDir } = await createPreparedProject(gateway);
		await mkdir(join(projectDir, "package-lock.json", "child"), { recursive: true });

		await expect(gateway.installNpmPackage({ ...request, storage })).resolves.toMatchObject({
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

async function expectPreparationAndInstallRejected(
	storage: ReturnType<typeof userManagedNpmStorage>,
	packageName: string,
): Promise<void> {
	let execCalls = 0;
	const gateway = createRealExtensionAcquisitionGateway({
		async exec() {
			execCalls += 1;
			return { type: "exited", stdout: "", stderr: "", code: 0, signal: null };
		},
	});
	await expect(gateway.ensureManagedNpmProject({ storage, packageName })).resolves.toMatchObject({
		ok: false,
		error: { code: "extension_acquisition_npm_project_failed" },
	});
	await expect(
		gateway.installNpmPackage({ ...request, storage, packageName }),
	).resolves.toMatchObject({
		ok: false,
		error: { code: "extension_acquisition_npm_install_failed" },
	});
	expect(execCalls).toBe(0);
}

async function createPreparedProject(
	gateway: ReturnType<typeof createRealExtensionAcquisitionGateway>,
): Promise<{ storage: ReturnType<typeof projectManagedNpmStorage>; projectDir: string }> {
	const repoRoot = await mkdtemp(join(tmpdir(), "ns-extension-acquisition-"));
	const storage = projectManagedNpmStorage(repoRoot);
	const prepared = await gateway.ensureManagedNpmProject({
		storage,
		packageName: request.packageName,
	});
	if (!prepared.ok) throw new Error(prepared.error.message);
	return { storage, projectDir: managedNpmProjectRoot(repoRoot, request.packageName) };
}

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
		if (!commandSucceeded(packed))
			throw new Error(`npm pack failed: ${packed.stderr === "" ? packed.stdout : packed.stderr}`);
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
