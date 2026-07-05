import { describe, expect, test } from "vitest";

import {
	requireNsStatePath,
	requireXdgPath,
	resolvePathOverride,
	resolveNsXdgPath,
	resolveXdgHome,
} from "@nseng-ai/foundation/xdg-path";

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

	test("resolveNsXdgPath builds ns-owned paths and supports absolute app overrides", () => {
		expect(
			resolveNsXdgPath({
				kind: "state",
				env: { HOME: "/home/tester" },
				segments: ["enriched-plan"],
			}),
		).toEqual({ ok: true, value: "/home/tester/.local/state/ns/enriched-plan" });
		expect(
			resolveNsXdgPath({
				kind: "state",
				env: { HOME: "/home/tester", NS_ROOT: "~/ns-root" },
				segments: ["logs"],
				overrideEnv: "NS_ROOT",
			}),
		).toEqual({ ok: true, value: "/home/tester/ns-root/logs" });
	});

	test("requireXdgPath unwraps successful paths and throws XDG error messages", () => {
		expect(
			requireXdgPath(
				resolveNsXdgPath({
					kind: "state",
					env: { HOME: "/home/tester" },
					segments: ["enriched-plan"],
				}),
			),
		).toBe("/home/tester/.local/state/ns/enriched-plan");
		expect(() =>
			requireXdgPath(resolveNsXdgPath({ kind: "state", env: {}, segments: ["logs"] })),
		).toThrow("HOME environment variable is not set");
	});

	test("resolvePathOverride rejects relative overrides after optional tilde expansion", () => {
		expect(resolvePathOverride({ env: { NS_ROOT: "relative/root" }, name: "NS_ROOT" })).toEqual({
			ok: false,
			error: expect.objectContaining({ code: "override-not-absolute" }),
		});
		expect(resolvePathOverride({ env: { NS_ROOT: "" }, name: "NS_ROOT" })).toEqual({
			ok: true,
			value: undefined,
		});
	});

	test("requireNsStatePath treats overrides as complete paths and falls back to ns state", () => {
		expect(
			requireNsStatePath({
				env: { HOME: "/home/tester", NS_LOG_DIR: "~/logs" },
				overrideEnvName: "NS_LOG_DIR",
				segments: ["logs"],
			}),
		).toBe("/home/tester/logs");
		expect(
			requireNsStatePath({
				env: { HOME: "/home/tester", XDG_STATE_HOME: "/state" },
				overrideEnvName: "NS_LOG_DIR",
				segments: ["logs"],
			}),
		).toBe("/state/ns/logs");
		expect(() =>
			requireNsStatePath({
				env: { HOME: "/home/tester", NS_LOG_DIR: "relative/logs" },
				overrideEnvName: "NS_LOG_DIR",
				segments: ["logs"],
			}),
		).toThrow("NS_LOG_DIR must be an absolute path");
	});
});
