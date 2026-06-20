import { chmod, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
	ensurePrivateDirectory,
	ensurePrivateDirectorySync,
	ensurePrivateParentDirectory,
	ensurePrivateParentDirectorySync,
	legacyHomePath,
	requireSdlStatePath,
	requireXdgPath,
	resolvePathOverride,
	resolveSdlXdgPath,
	resolveXdgHome,
} from "../src/xdg.ts";

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("XDG path helpers", () => {
	test("resolveXdgHome uses default HOME locations for unset and empty XDG values", () => {
		const env = {
			HOME: "/home/tester",
			XDG_CONFIG_HOME: "",
			XDG_DATA_HOME: undefined,
			XDG_STATE_HOME: "",
			XDG_CACHE_HOME: undefined,
		};

		expect(resolveXdgHome("config", env)).toEqual({ ok: true, value: "/home/tester/.config" });
		expect(resolveXdgHome("data", env)).toEqual({
			ok: true,
			value: "/home/tester/.local/share",
		});
		expect(resolveXdgHome("state", env)).toEqual({
			ok: true,
			value: "/home/tester/.local/state",
		});
		expect(resolveXdgHome("cache", env)).toEqual({ ok: true, value: "/home/tester/.cache" });
	});

	test("resolveXdgHome honors absolute XDG values and ignores relative values", () => {
		expect(resolveXdgHome("state", { HOME: "/home/tester", XDG_STATE_HOME: "/state" })).toEqual({
			ok: true,
			value: "/state",
		});
		expect(
			resolveXdgHome("state", { HOME: "/home/tester", XDG_STATE_HOME: "relative/state" }),
		).toEqual({ ok: true, value: "/home/tester/.local/state" });
	});

	test("resolveXdgHome fails clearly when HOME is needed but missing or relative", () => {
		expect(resolveXdgHome("state", {})).toEqual({
			ok: false,
			error: expect.objectContaining({ code: "home-not-set" }),
		});
		expect(resolveXdgHome("state", { HOME: "relative/home" })).toEqual({
			ok: false,
			error: expect.objectContaining({ code: "home-not-absolute" }),
		});
	});

	test("resolveSdlXdgPath builds SDL-owned paths and supports absolute app overrides", () => {
		expect(
			resolveSdlXdgPath({
				kind: "state",
				env: { HOME: "/home/tester" },
				segments: ["enriched-plan"],
			}),
		).toEqual({ ok: true, value: "/home/tester/.local/state/sdl/enriched-plan" });
		expect(
			resolveSdlXdgPath({
				kind: "state",
				env: { HOME: "/home/tester", SDL_ROOT: "~/sdl-root" },
				segments: ["logs"],
				overrideEnv: "SDL_ROOT",
			}),
		).toEqual({ ok: true, value: "/home/tester/sdl-root/logs" });
	});

	test("requireXdgPath unwraps successful paths and throws XDG error messages", () => {
		expect(
			requireXdgPath(
				resolveSdlXdgPath({
					kind: "state",
					env: { HOME: "/home/tester" },
					segments: ["enriched-plan"],
				}),
			),
		).toBe("/home/tester/.local/state/sdl/enriched-plan");
		expect(() =>
			requireXdgPath(resolveSdlXdgPath({ kind: "state", env: {}, segments: ["logs"] })),
		).toThrow("HOME environment variable is not set");
	});

	test("resolvePathOverride rejects relative overrides after optional tilde expansion", () => {
		expect(resolvePathOverride({ env: { SDL_ROOT: "relative/root" }, name: "SDL_ROOT" })).toEqual({
			ok: false,
			error: expect.objectContaining({ code: "override-not-absolute" }),
		});
		expect(resolvePathOverride({ env: { SDL_ROOT: "" }, name: "SDL_ROOT" })).toEqual({
			ok: true,
			value: undefined,
		});
	});

	test("requireSdlStatePath treats overrides as complete paths and falls back to SDL state", () => {
		expect(
			requireSdlStatePath({
				env: { HOME: "/home/tester", SDL_LOG_DIR: "~/logs" },
				overrideEnvName: "SDL_LOG_DIR",
				segments: ["logs"],
			}),
		).toBe("/home/tester/logs");
		expect(
			requireSdlStatePath({
				env: { HOME: "/home/tester", XDG_STATE_HOME: "/state" },
				overrideEnvName: "SDL_LOG_DIR",
				segments: ["logs"],
			}),
		).toBe("/state/sdl/logs");
		expect(() =>
			requireSdlStatePath({
				env: { HOME: "/home/tester", SDL_LOG_DIR: "relative/logs" },
				overrideEnvName: "SDL_LOG_DIR",
				segments: ["logs"],
			}),
		).toThrow("SDL_LOG_DIR must be an absolute path");
	});

	test("legacyHomePath builds read-only legacy fallback paths from HOME", () => {
		expect(legacyHomePath({ HOME: "/home/tester" }, [".sdl", "enriched-plan"])).toEqual({
			ok: true,
			value: "/home/tester/.sdl/enriched-plan",
		});
	});

	test("private directory creation uses 0700 for new directories and leaves existing permissions", async () => {
		const root = await makeTempDir();
		const created = join(root, "created");
		await ensurePrivateDirectory(created);
		expect(mode(await stat(created))).toBe(0o700);

		const existing = join(root, "existing");
		await ensurePrivateDirectory(existing);
		await chmod(existing, 0o755);
		await ensurePrivateParentDirectory(join(existing, "child", "file.txt"));
		expect(mode(await stat(existing))).toBe(0o755);
		expect(mode(await stat(join(existing, "child")))).toBe(0o700);
	});

	test("sync private directory creation matches async permission semantics", async () => {
		const root = await makeTempDir();
		const created = join(root, "sync-created");
		ensurePrivateDirectorySync(created);
		expect(mode(await stat(created))).toBe(0o700);

		ensurePrivateParentDirectorySync(join(root, "sync-parent", "file.txt"));
		expect(mode(await stat(join(root, "sync-parent")))).toBe(0o700);
	});
});

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "sdl-core-xdg-"));
	tempDirs.push(dir);
	return dir;
}

function mode(stats: { mode: number }): number {
	return stats.mode & 0o777;
}
