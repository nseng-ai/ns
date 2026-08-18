import { describe, expect, test } from "vitest";

import registerGsExtension, {
	GS_NEW_BRANCH_FROM_PLAN_COMMAND_NAME,
	GS_IMPL_BRANCH_FROM_PLAN_COMMAND_NAME,
	gsExtensionParity,
} from "../src/extension.ts";
import type { ExtensionAPI } from "../src/host-types.ts";

class RegistrationFake implements ExtensionAPI {
	readonly commands = new Map<string, unknown>();

	registerCommand(name: string, options: unknown): void {
		this.commands.set(name, options);
	}

	async exec(): Promise<{
		type: "exited";
		stdout: string;
		stderr: string;
		code: number;
		signal: null;
	}> {
		return { type: "exited", stdout: "", stderr: "", code: 0, signal: null };
	}
}

describe("GS Pi surfaces", () => {
	test("owns GS-namespaced commands", () => {
		expect(GS_NEW_BRANCH_FROM_PLAN_COMMAND_NAME).toBe("ns:gs:new-branch-from-plan");
		expect(GS_IMPL_BRANCH_FROM_PLAN_COMMAND_NAME).toBe("ns:gs:impl-branch-from-plan");
	});

	test("registers only GS-owned commands", () => {
		const pi = new RegistrationFake();
		registerGsExtension(pi);
		expect([...pi.commands.keys()]).toEqual([
			GS_NEW_BRANCH_FROM_PLAN_COMMAND_NAME,
			GS_IMPL_BRANCH_FROM_PLAN_COMMAND_NAME,
		]);
		expect([...pi.commands.keys()].some((name) => name.startsWith("ns:gt:"))).toBe(false);
	});

	test("parity metadata names the registered command", () => {
		expect(gsExtensionParity.map((entry) => entry.surface)).toEqual([
			GS_NEW_BRANCH_FROM_PLAN_COMMAND_NAME,
			GS_IMPL_BRANCH_FROM_PLAN_COMMAND_NAME,
		]);
	});
});
