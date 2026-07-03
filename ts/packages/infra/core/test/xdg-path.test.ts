import { describe, expect, test } from "vitest";

import {
	requireSdlStatePath,
	requireXdgPath,
	resolvePathOverride,
	resolveSdlXdgPath,
	resolveXdgHome,
} from "@sdl/core/xdg-path";

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
		).toEqual({ ok: true, value: "/home/tester/.local/state/ji/enriched-plan" });
		expect(
			resolveSdlXdgPath({
				kind: "state",
				env: { HOME: "/home/tester", JI_ROOT: "~/sdl-root" },
				segments: ["logs"],
				overrideEnv: "JI_ROOT",
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
		).toBe("/home/tester/.local/state/ji/enriched-plan");
		expect(() =>
			requireXdgPath(resolveSdlXdgPath({ kind: "state", env: {}, segments: ["logs"] })),
		).toThrow("HOME environment variable is not set");
	});

	test("resolvePathOverride rejects relative overrides after optional tilde expansion", () => {
		expect(resolvePathOverride({ env: { JI_ROOT: "relative/root" }, name: "JI_ROOT" })).toEqual({
			ok: false,
			error: expect.objectContaining({ code: "override-not-absolute" }),
		});
		expect(resolvePathOverride({ env: { JI_ROOT: "" }, name: "JI_ROOT" })).toEqual({
			ok: true,
			value: undefined,
		});
	});

	test("requireSdlStatePath treats overrides as complete paths and falls back to SDL state", () => {
		expect(
			requireSdlStatePath({
				env: { HOME: "/home/tester", JI_LOG_DIR: "~/logs" },
				overrideEnvName: "JI_LOG_DIR",
				segments: ["logs"],
			}),
		).toBe("/home/tester/logs");
		expect(
			requireSdlStatePath({
				env: { HOME: "/home/tester", XDG_STATE_HOME: "/state" },
				overrideEnvName: "JI_LOG_DIR",
				segments: ["logs"],
			}),
		).toBe("/state/ji/logs");
		expect(() =>
			requireSdlStatePath({
				env: { HOME: "/home/tester", JI_LOG_DIR: "relative/logs" },
				overrideEnvName: "JI_LOG_DIR",
				segments: ["logs"],
			}),
		).toThrow("JI_LOG_DIR must be an absolute path");
	});
});
