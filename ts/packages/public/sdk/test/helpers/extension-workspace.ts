import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach } from "vitest";

const tempDirs: string[] = [];

export interface ExtensionRegistryWorkspace {
	cwd: string;
	homeDir: string;
}

export async function createExtensionRegistryWorkspace(): Promise<ExtensionRegistryWorkspace> {
	const directory = await mkdtemp(join(tmpdir(), "ns-extension-registry-"));
	tempDirs.push(directory);
	return { cwd: join(directory, "project"), homeDir: join(directory, "home") };
}

export function writeUserConfig(workspace: ExtensionRegistryWorkspace, source: string): void {
	writeWorkspaceFile(join(workspace.homeDir, ".config", "ns", "ns.toml"), source);
}

export function writeUserDescriptorPackage(
	workspace: ExtensionRegistryWorkspace,
	options: { directoryName: string; packageName: string; descriptorSource: string },
): string {
	const packageRoot = join(workspace.homeDir, "extensions", options.directoryName);
	writeWorkspaceFile(
		join(packageRoot, "package.json"),
		JSON.stringify({
			name: options.packageName,
			version: "1.0.0",
			exports: { "./ns-extension": "./src/ns-extension.ts" },
		}),
	);
	writeWorkspaceFile(join(packageRoot, "src", "ns-extension.ts"), options.descriptorSource);
	return packageRoot;
}

export function writeProjectExtension(
	workspace: ExtensionRegistryWorkspace,
	fileName: string,
	source: string,
): void {
	writeWorkspaceFile(join(workspace.cwd, ".ns", "extensions", fileName), source);
}

export function writeGlobalExtension(
	workspace: ExtensionRegistryWorkspace,
	fileName: string,
	source: string,
): void {
	writeWorkspaceFile(
		join(workspace.homeDir, ".local", "share", "ns", "extensions", fileName),
		source,
	);
}

export function writeLegacyGlobalExtension(
	workspace: ExtensionRegistryWorkspace,
	fileName: string,
	source: string,
): void {
	writeWorkspaceFile(join(workspace.homeDir, ".ns", "extensions", fileName), source);
}

export function writeProjectManifest(
	workspace: ExtensionRegistryWorkspace,
	packageName: string,
	manifest: unknown,
): void {
	writeWorkspaceFile(
		join(workspace.cwd, ".ns", "extensions", packageName, "package.json"),
		JSON.stringify(manifest),
	);
}

export function writeWorkspaceFile(path: string, source: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source);
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});
