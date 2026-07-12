import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import {
	registerRipgrepDefaultsExtension,
	type RipgrepDefaultsEnvironment,
	type RipgrepDefaultsExtensionApi,
} from "../src/kit/search/ripgrep-defaults.ts";

type LifecycleEvent = "session_start" | "session_shutdown";
type LifecycleHandler = () => void;

class FakePi implements RipgrepDefaultsExtensionApi {
	private readonly handlers = new Map<LifecycleEvent, LifecycleHandler>();

	on(event: LifecycleEvent, handler: LifecycleHandler): void {
		this.handlers.set(event, handler);
	}

	hasHandler(event: LifecycleEvent): boolean {
		return this.handlers.has(event);
	}

	emit(event: LifecycleEvent): void {
		const handler = this.handlers.get(event);
		if (handler === undefined) throw new Error(`${event} handler not registered`);
		handler();
	}
}

class FakeEnvironment implements RipgrepDefaultsEnvironment {
	private readonly values: Map<string, string>;

	constructor(initial: Record<string, string> = {}) {
		this.values = new Map(Object.entries(initial));
	}

	get(name: string): string | undefined {
		return this.values.get(name);
	}

	set(name: string, value: string): void {
		this.values.set(name, value);
	}

	delete(name: string): void {
		this.values.delete(name);
	}

	has(name: string): boolean {
		return this.values.has(name);
	}
}

function register(environment: FakeEnvironment): FakePi {
	const pi = new FakePi();
	registerRipgrepDefaultsExtension(pi, {
		environment,
		configPath: "/worktree/.pi/ripgrep.conf",
	});
	return pi;
}

describe("ripgrep defaults extension", () => {
	test("registers session start and shutdown handlers", () => {
		const pi = register(new FakeEnvironment());

		expect(pi.hasHandler("session_start")).toBe(true);
		expect(pi.hasHandler("session_shutdown")).toBe(true);
	});

	test("sets an absent config path and deletes it on shutdown", () => {
		const environment = new FakeEnvironment();
		const pi = register(environment);

		pi.emit("session_start");
		expect(environment.get("RIPGREP_CONFIG_PATH")).toBe("/worktree/.pi/ripgrep.conf");

		pi.emit("session_shutdown");
		expect(environment.has("RIPGREP_CONFIG_PATH")).toBe(false);
	});

	test("restores an existing config path exactly", () => {
		const environment = new FakeEnvironment({
			RIPGREP_CONFIG_PATH: "/existing/ripgrep.conf",
		});
		const pi = register(environment);

		pi.emit("session_start");
		expect(environment.get("RIPGREP_CONFIG_PATH")).toBe("/worktree/.pi/ripgrep.conf");

		pi.emit("session_shutdown");
		expect(environment.get("RIPGREP_CONFIG_PATH")).toBe("/existing/ripgrep.conf");
	});

	test("captures a fresh baseline for a second lifecycle", () => {
		const environment = new FakeEnvironment({
			RIPGREP_CONFIG_PATH: "/first/ripgrep.conf",
		});
		const pi = register(environment);

		pi.emit("session_start");
		pi.emit("session_shutdown");
		environment.set("RIPGREP_CONFIG_PATH", "/second/ripgrep.conf");
		pi.emit("session_start");
		pi.emit("session_shutdown");

		expect(environment.get("RIPGREP_CONFIG_PATH")).toBe("/second/ripgrep.conf");
	});

	test("reasserts the configured path on duplicate start without replacing the baseline", () => {
		const environment = new FakeEnvironment({
			RIPGREP_CONFIG_PATH: "/existing/ripgrep.conf",
		});
		const pi = register(environment);

		pi.emit("session_start");
		environment.set("RIPGREP_CONFIG_PATH", "/unexpected/ripgrep.conf");
		pi.emit("session_start");
		expect(environment.get("RIPGREP_CONFIG_PATH")).toBe("/worktree/.pi/ripgrep.conf");

		pi.emit("session_shutdown");
		expect(environment.get("RIPGREP_CONFIG_PATH")).toBe("/existing/ripgrep.conf");
	});

	test("ignores shutdown before start and duplicate shutdown", () => {
		const environment = new FakeEnvironment({
			RIPGREP_CONFIG_PATH: "/existing/ripgrep.conf",
		});
		const pi = register(environment);

		pi.emit("session_shutdown");
		expect(environment.get("RIPGREP_CONFIG_PATH")).toBe("/existing/ripgrep.conf");

		pi.emit("session_start");
		pi.emit("session_shutdown");
		pi.emit("session_shutdown");
		expect(environment.get("RIPGREP_CONFIG_PATH")).toBe("/existing/ripgrep.conf");
	});

	test("checks in only the intended generated-file exclusions", async () => {
		const configPath = fileURLToPath(new URL("../../../../../.pi/ripgrep.conf", import.meta.url));
		const arguments_ = (await readFile(configPath, "utf8"))
			.split("\n")
			.filter((line) => line !== "");

		expect(arguments_).toEqual(["--glob=!*.map", "--glob=!*.min.js", "--glob=!*.min.css"]);
	});
});
