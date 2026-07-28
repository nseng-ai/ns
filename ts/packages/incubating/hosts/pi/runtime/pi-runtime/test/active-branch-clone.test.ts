import { cloneActiveBranchSession } from "@nseng-ai/pi-runtime/sessions/active-branch-clone";
import { describe, expect, test } from "vitest";

describe("cloneActiveBranchSession", () => {
	test.each([
		["sourceSessionFile", { sourceSessionFile: "" }, "Source session file is required."],
		["sourceLeafId", { sourceLeafId: "  " }, "Source session leaf id is required."],
		["destinationCwd", { destinationCwd: "" }, "Destination cwd is required."],
		["appendedUserTurn", { appendedUserTurn: "\n" }, "Appended user turn is required."],
	] as const)("rejects an empty %s before opening a session", (_name, override, message) => {
		expect(
			cloneActiveBranchSession({
				sourceSessionFile: "/source/session.jsonl",
				sourceLeafId: "leaf-id",
				destinationCwd: "/destination",
				appendedUserTurn: "Continue implementing the session workflow.",
				...override,
			}),
		).toEqual({ ok: false, error: { code: "invalid-request", message } });
	});
});
