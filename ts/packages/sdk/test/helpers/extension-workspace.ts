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
