import type { AssistantMessage } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { cloneActiveBranchSession } from "@nseng-ai/pi-runtime/sessions/active-branch-clone";
import { buildActiveSessionContextText } from "@nseng-ai/pi-runtime/sessions/active-context-text";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";

describe("cloneActiveBranchSession integration", () => {
	test("clones only the selected path and preserves its session semantics", () => {
		const fixtureRoot = mkdtempSync(join(tmpdir(), "ns-active-session-clone-"));
		const sourceCwd = join(fixtureRoot, "source-worktree");
		const destinationCwd = join(fixtureRoot, "destination-worktree");
		const sourceSessionDir = join(fixtureRoot, "source-sessions");
		vi.stubEnv("PI_CODING_AGENT_DIR", join(fixtureRoot, "pi-agent"));

		try {
			const source = SessionManager.create(sourceCwd, sourceSessionDir);
			const rootId = source.appendMessage(userMessage("original request", 1));
			source.appendMessage(assistantMessage("initial response", 2));
			const keptId = source.appendMessage(userMessage("kept context", 3));
			source.appendMessage(assistantMessage("kept response", 4));
			const compactionId = source.appendCompaction("Earlier active context", keptId, 500);
			const labeledId = source.appendMessage(userMessage("selected path", 5));
			const labelId = source.appendLabelChange(labeledId, "active-marker");
			source.branch(rootId);
			source.appendMessage(userMessage("abandoned path", 6));
			source.appendMessage(assistantMessage("abandoned response", 7));
			source.branch(labelId);
			const selectedLeafId = source.appendMessage(assistantMessage("selected response", 8));
			const sourceSessionFile = source.getSessionFile();
			expect(sourceSessionFile).toBeDefined();
			if (sourceSessionFile === undefined) throw new Error("source session was not persisted");
			const sourceBefore = readFileSync(sourceSessionFile, "utf8");
			const activeContext = buildActiveSessionContextText({
				sourceSessionFile,
				sourceLeafId: selectedLeafId,
			});
			expect(activeContext.ok).toBe(true);
			if (!activeContext.ok) throw new Error(activeContext.message);
			expect(activeContext.text).toContain("Earlier active context");
			expect(activeContext.text).toContain("selected response");
			expect(activeContext.text).not.toContain("abandoned path");
			expect(activeContext.text).not.toContain("abandoned response");

			const result = cloneActiveBranchSession({
				sourceSessionFile,
				sourceLeafId: selectedLeafId,
				destinationCwd,
				appendedUserTurn: "Continue the selected implementation.",
			});

			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error(result.error.message);
			const destination = SessionManager.open(result.value.sessionFile);
			const destinationHeader = destination.getHeader();
			const destinationEntries = destination.getEntries();
			const serializedDestination = readFileSync(result.value.sessionFile, "utf8");

			expect(destination.getSessionId()).toBe(result.value.sessionId);
			expect(destinationHeader?.cwd).toBe(destinationCwd);
			expect(destinationHeader?.parentSession).toBeDefined();
			expect(destinationHeader?.parentSession).not.toBe(sourceSessionFile);
			expect(serializedDestination).toContain("selected path");
			expect(serializedDestination).toContain("selected response");
			expect(serializedDestination).not.toContain("abandoned path");
			expect(serializedDestination).not.toContain("abandoned response");
			expect(destinationEntries).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ type: "compaction", id: compactionId }),
					expect.objectContaining({
						type: "label",
						targetId: labeledId,
						label: "active-marker",
					}),
				]),
			);
			expect(destination.getLeafEntry()).toMatchObject({
				type: "message",
				message: { role: "user", content: "Continue the selected implementation." },
			});
			expect(readFileSync(sourceSessionFile, "utf8")).toBe(sourceBefore);
			expect(existsSync(result.value.sessionFile)).toBe(true);
			expect(existsSync(destinationHeader?.parentSession ?? "")).toBe(false);
		} finally {
			rmSync(fixtureRoot, { force: true, recursive: true });
		}
	});
});

function userMessage(content: string, timestamp: number) {
	return { role: "user" as const, content, timestamp };
}

function assistantMessage(content: string, timestamp: number): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text: content }],
		api: "anthropic-messages",
		provider: "test",
		model: "test",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp,
	};
}
