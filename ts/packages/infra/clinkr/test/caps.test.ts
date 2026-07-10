import { describe, expect, test, vi } from "vitest";
import {
	DEFAULT_COLUMNS,
	readProcessCapsEnv,
	resolveCaps,
	resolveProcessCaps,
	resolveSettledNonInteractiveCaps,
	type CapsEnv,
} from "../src/caps.ts";

function capsEnv(parts: {
	isTty?: boolean;
	columns?: number | "unknown";
	env?: Record<string, string | undefined>;
}): CapsEnv {
	return {
		isTty: parts.isTty ?? true,
		columns: parts.columns === "unknown" ? undefined : (parts.columns ?? 80),
		env: parts.env ?? {},
	};
}

describe("resolveCaps colorDepth", () => {
	test("truecolor from COLORTERM on a tty", () => {
		expect(resolveCaps(capsEnv({ env: { COLORTERM: "truecolor" } })).colorDepth).toBe("truecolor");
	});

	test("24bit COLORTERM also resolves truecolor", () => {
		expect(resolveCaps(capsEnv({ env: { COLORTERM: "24bit" } })).colorDepth).toBe("truecolor");
	});

	test("ansi256 from a 256color TERM", () => {
		expect(resolveCaps(capsEnv({ env: { TERM: "xterm-256color" } })).colorDepth).toBe("ansi256");
	});

	test("ansi16 for a plain color terminal", () => {
		expect(resolveCaps(capsEnv({ env: { TERM: "xterm" } })).colorDepth).toBe("ansi16");
	});

	test("none when stdout is not a tty", () => {
		expect(resolveCaps(capsEnv({ isTty: false, env: { COLORTERM: "truecolor" } })).colorDepth).toBe(
			"none",
		);
	});

	test("TERM=dumb disables color on a tty", () => {
		expect(resolveCaps(capsEnv({ env: { TERM: "dumb", COLORTERM: "truecolor" } })).colorDepth).toBe(
			"none",
		);
	});

	test("NO_COLOR forces none even on a truecolor tty", () => {
		expect(
			resolveCaps(capsEnv({ env: { NO_COLOR: "1", COLORTERM: "truecolor" } })).colorDepth,
		).toBe("none");
	});

	test("empty NO_COLOR still disables color", () => {
		expect(resolveCaps(capsEnv({ env: { NO_COLOR: "" } })).colorDepth).toBe("none");
	});

	test("FORCE_COLOR enables color off a tty", () => {
		expect(resolveCaps(capsEnv({ isTty: false, env: { FORCE_COLOR: "1" } })).colorDepth).toBe(
			"ansi16",
		);
	});

	test("FORCE_COLOR=2 forces ansi256", () => {
		expect(resolveCaps(capsEnv({ isTty: false, env: { FORCE_COLOR: "2" } })).colorDepth).toBe(
			"ansi256",
		);
	});

	test("FORCE_COLOR=3 forces truecolor", () => {
		expect(resolveCaps(capsEnv({ isTty: false, env: { FORCE_COLOR: "3" } })).colorDepth).toBe(
			"truecolor",
		);
	});

	test("FORCE_COLOR=0 disables color on a tty", () => {
		expect(
			resolveCaps(capsEnv({ env: { FORCE_COLOR: "0", COLORTERM: "truecolor" } })).colorDepth,
		).toBe("none");
	});

	test("NO_COLOR outranks FORCE_COLOR", () => {
		expect(resolveCaps(capsEnv({ env: { NO_COLOR: "1", FORCE_COLOR: "3" } })).colorDepth).toBe(
			"none",
		);
	});
});

describe("resolveCaps columns", () => {
	test("columns pass through from the snapshot", () => {
		expect(resolveCaps(capsEnv({ columns: 120 })).columns).toBe(120);
	});

	test("columns fall back to the default when unknown", () => {
		expect(resolveCaps(capsEnv({ columns: "unknown" })).columns).toBe(DEFAULT_COLUMNS);
	});
});

describe("resolveCaps isTty", () => {
	test("passes through from the snapshot", () => {
		expect(resolveCaps(capsEnv({ isTty: false })).isTty).toBe(false);
	});
});

describe("resolveCaps unicode", () => {
	test("UTF-8 locale enables unicode", () => {
		expect(resolveCaps(capsEnv({ env: { LANG: "en_US.UTF-8" } })).canRenderUnicode).toBe(true);
	});

	test("non-UTF-8 locale disables unicode", () => {
		expect(resolveCaps(capsEnv({ env: { LANG: "C" } })).canRenderUnicode).toBe(false);
	});

	test("LC_ALL overrides LANG", () => {
		expect(
			resolveCaps(capsEnv({ env: { LC_ALL: "C", LANG: "en_US.UTF-8" } })).canRenderUnicode,
		).toBe(false);
	});

	test("LC_CTYPE overrides LANG when LC_ALL is absent", () => {
		expect(
			resolveCaps(capsEnv({ env: { LC_CTYPE: "en_US.UTF-8", LANG: "C" } })).canRenderUnicode,
		).toBe(true);
	});

	test("defaults on when no locale is configured", () => {
		expect(resolveCaps(capsEnv({ env: {} })).canRenderUnicode).toBe(true);
	});
});

describe("resolveSettledNonInteractiveCaps", () => {
	test("ignores TTY-only color forcing and process columns for hosted sinks", () => {
		expect(resolveSettledNonInteractiveCaps({ FORCE_COLOR: "3", LANG: "C" })).toEqual({
			isTty: false,
			colorDepth: "none",
			columns: DEFAULT_COLUMNS,
			canRenderUnicode: false,
		});
	});
});

describe("readProcessCapsEnv", () => {
	test("snapshots tty, columns, and env from the process", () => {
		vi.stubEnv("TERM", "xterm-256color");
		// Neutralize an ambient COLORTERM=truecolor from the test shell so TERM drives the depth.
		vi.stubEnv("COLORTERM", "");
		const originalIsTty = process.stdout.isTTY;
		const originalColumns = process.stdout.columns;
		Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
		Object.defineProperty(process.stdout, "columns", { value: 133, configurable: true });
		try {
			const snapshot = readProcessCapsEnv();
			expect(snapshot.isTty).toBe(true);
			expect(snapshot.columns).toBe(133);
			expect(resolveCaps(snapshot).colorDepth).toBe("ansi256");
			expect(resolveProcessCaps().columns).toBe(133);
		} finally {
			Object.defineProperty(process.stdout, "isTTY", {
				value: originalIsTty,
				configurable: true,
			});
			Object.defineProperty(process.stdout, "columns", {
				value: originalColumns,
				configurable: true,
			});
		}
	});
});
