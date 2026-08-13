import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, test } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../../../../../../../../", import.meta.url));
const HOME_DIRECTORY_GUARD_SOURCE = join(
	REPO_ROOT,
	".pi/installable-extensions/home-directory-guard.ts",
);

describe("global home-directory guard discovery", () => {
	test("loads the canonical source through a user-global symlink", async () => {
		const agentDir = await mkdtemp(join(tmpdir(), "ns-home-directory-guard-agent-"));
		const projectCwd = await mkdtemp(join(tmpdir(), "ns-home-directory-guard-project-"));
		const extensionDirectory = join(agentDir, "extensions");
		const extensionSymlink = join(extensionDirectory, "home-directory-guard.ts");

		try {
			await mkdir(extensionDirectory);
			await symlink(HOME_DIRECTORY_GUARD_SOURCE, extensionSymlink);

			const resourceLoader = new DefaultResourceLoader({
				cwd: projectCwd,
				agentDir,
				settingsManager: SettingsManager.inMemory(),
				noSkills: true,
				noPromptTemplates: true,
				noThemes: true,
				noContextFiles: true,
			});
			await resourceLoader.reload();

			const result = resourceLoader.getExtensions();
			expect(result.errors).toEqual([]);
			expect(result.extensions).toHaveLength(1);

			const extension = result.extensions[0];
			expect(extension?.path).toBe(extensionSymlink);
			expect(extension?.handlers.get("tool_call")).toHaveLength(1);
			expect(extension?.handlers.get("user_bash")).toHaveLength(1);
		} finally {
			await Promise.all([
				rm(agentDir, { force: true, recursive: true }),
				rm(projectCwd, { force: true, recursive: true }),
			]);
		}
	});
});
