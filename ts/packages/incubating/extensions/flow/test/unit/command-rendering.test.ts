import { describe, expect, test } from "vitest";

import { flowAutobranchCommand } from "../../src/ns/commands/autobranch.ts";
import { flowAutoslotCommand } from "../../src/ns/commands/autoslot.ts";
import { flowBranchLatestCommitCommand } from "../../src/ns/commands/branch-latest-commit.ts";
import { flowChangesCommand } from "../../src/ns/commands/changes.ts";
import { flowCpCommand } from "../../src/ns/commands/cp.ts";
import { flowLandCommand } from "../../src/ns/commands/land.ts";
import { flowPullTrunkCommand } from "../../src/ns/commands/pull-trunk.ts";
import { flowPushCommand } from "../../src/ns/commands/push.ts";
import { flowRegeneratePrCommand } from "../../src/ns/commands/regenerate-pr.ts";
import { flowSquashStackCommand } from "../../src/ns/commands/squash-stack.ts";
import { flowSubmitCommand } from "../../src/ns/commands/submit.ts";

const PRESENTATION_READY_COMMANDS = [
	flowChangesCommand,
	flowCpCommand,
	flowAutobranchCommand,
	flowBranchLatestCommitCommand,
	flowAutoslotCommand,
	flowSubmitCommand,
	flowRegeneratePrCommand,
	flowPushCommand,
	flowLandCommand,
	flowPullTrunkCommand,
	flowSquashStackCommand,
];

function requireHumanRenderer(command: unknown): (text: string) => string {
	if (
		typeof command !== "object" ||
		command === null ||
		!("renderHuman" in command) ||
		typeof command.renderHuman !== "function"
	) {
		throw new Error("Expected presentation-ready Flow command to define renderHuman.");
	}
	const renderHuman: Function = command.renderHuman;
	return (text) => {
		const rendered: unknown = renderHuman(text, { canEmitAnsi: true });
		if (typeof rendered !== "string") throw new Error("Expected renderHuman to return a string.");
		return rendered;
	};
}

describe("Flow presentation-ready command rendering", () => {
	test("renders every public string result byte-for-byte", () => {
		const sentinel = "\x1b[1mheadline\x1b[0m\nbody";

		for (const command of PRESENTATION_READY_COMMANDS) {
			expect(requireHumanRenderer(command)(sentinel)).toBe(sentinel);
		}
	});
});
