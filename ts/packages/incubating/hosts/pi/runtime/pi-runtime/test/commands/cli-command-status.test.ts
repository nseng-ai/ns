import { describe, expect, test } from "vitest";

import { createManualClock, createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";
import type { NsProgressPhaseEvent } from "@nseng-ai/sdk";

import {
	CliCommandStatusActivity,
	type CliCommandStatusContext,
} from "../../src/commands/cli-command-status.ts";

interface StatusUpdate {
	readonly key: string;
	readonly value: string | undefined;
}

function createActivity(options: { staleAfterWrites?: number; hasUI?: boolean } = {}): {
	activity: CliCommandStatusActivity;
	clock: ReturnType<typeof createManualClock>;
	timers: ReturnType<typeof createManualTimerScheduler>;
	updates: StatusUpdate[];
} {
	const clock = createManualClock(0);
	const timers = createManualTimerScheduler();
	const updates: StatusUpdate[] = [];
	const ctx: CliCommandStatusContext = {
		hasUI: options.hasUI ?? true,
		ui: {
			setStatus(key, value) {
				if (options.staleAfterWrites !== undefined && updates.length >= options.staleAfterWrites) {
					throw new Error(
						"This extension ctx is stale after session replacement or reload. Do not use a captured ctx.",
					);
				}
				updates.push({ key, value });
			},
		},
	};
	const activity = new CliCommandStatusActivity(ctx, {
		cliName: "ns",
		commandName: "flow submit",
		piCommandName: "ns:flow:submit",
		clock: clock.clock,
		timers: timers.timers,
	});
	return { activity, clock, timers, updates };
}

function lastValue(updates: readonly StatusUpdate[]): string {
	const value = updates.at(-1)?.value;
	if (value === undefined) throw new Error("Expected a current status value.");
	return value;
}

function apply(activity: CliCommandStatusActivity, events: readonly NsProgressPhaseEvent[]): void {
	for (const event of events) activity.applyPhaseEvent(event);
}

describe("CliCommandStatusActivity", () => {
	test("maps bridge phases to the compact status grammar", () => {
		const { activity, updates } = createActivity();

		expect(lastValue(updates)).toBe("⠋ /ns:flow:submit · running");
		activity.setPhase("waiting for Pi");
		expect(lastValue(updates)).toBe("⠋ /ns:flow:submit · waiting for Pi");
		activity.setPhase("running CLI command");
		expect(lastValue(updates)).toBe("⠋ /ns:flow:submit · running");
	});

	test("reduces every structured phase event to the active phase and label", () => {
		const { activity, updates } = createActivity();

		apply(activity, [
			{
				type: "phases-declared",
				title: "Submit stack",
				phases: [
					{ key: "publish", name: "Publishing" },
					{ key: "verify", name: "Verifying" },
				],
			},
			{ type: "title-changed", title: "Submit branches" },
			{ type: "phase-started", phaseKey: "publish" },
		]);
		expect(lastValue(updates)).toBe("⠋ /ns:flow:submit · Publishing");

		activity.applyPhaseEvent({
			type: "phase-progress",
			phaseKey: "publish",
			label: "opening PRs",
		});
		expect(lastValue(updates)).toBe("⠋ /ns:flow:submit · Publishing · opening PRs");

		activity.applyPhaseEvent({ type: "phase-done", phaseKey: "publish", detail: "opened" });
		expect(lastValue(updates)).toBe("⠋ /ns:flow:submit · running");
		activity.applyPhaseEvent({ type: "phase-started", phaseKey: "verify", label: "checking" });
		expect(lastValue(updates)).toBe("⠋ /ns:flow:submit · Verifying · checking");
	});

	test("appends unknown phases and keeps failures sticky until a later phase starts", () => {
		const { activity, updates } = createActivity();

		activity.applyPhaseEvent({ type: "phase-progress", phaseKey: "discover", label: "finding" });
		expect(lastValue(updates)).toBe("⠋ /ns:flow:submit · discover · finding");
		activity.applyPhaseEvent({
			type: "phase-failed",
			phaseKey: "discover",
			detail: "failed badly",
		});
		expect(lastValue(updates)).toBe("✗ /ns:flow:submit · discover failed");
		activity.applyPhaseEvent({ type: "phase-done", phaseKey: "discover" });
		expect(lastValue(updates)).toBe("✗ /ns:flow:submit · discover failed");
		activity.applyPhaseEvent({ type: "phase-started", phaseKey: "recover", label: "retrying" });
		expect(lastValue(updates)).toBe("⠋ /ns:flow:submit · recover · retrying");
	});

	test("counts done and skipped matrix cells and resets arithmetic on re-declaration", () => {
		const { activity, updates } = createActivity();

		apply(activity, [
			{
				type: "matrix-declared",
				columns: [
					{ key: "inventory", label: "Inventory" },
					{ key: "publish", label: "Publish" },
				],
			},
			{
				type: "matrix-rows",
				rows: [
					{ rowKey: "a", label: "A" },
					{ rowKey: "b", label: "B" },
				],
			},
			{ type: "matrix-cell", rowKey: "a", columnKey: "inventory", state: "done" },
			{ type: "matrix-cell", rowKey: "a", columnKey: "publish", state: "skipped" },
			{ type: "matrix-cell", rowKey: "b", columnKey: "inventory", state: "failed" },
		]);
		expect(lastValue(updates)).toBe("⠋ /ns:flow:submit · running · 2/4");

		activity.applyPhaseEvent({
			type: "matrix-declared",
			columns: [{ key: "inventory", label: "Inventory" }],
		});
		expect(lastValue(updates)).toBe("⠋ /ns:flow:submit · running");
		activity.applyPhaseEvent({ type: "matrix-rows", rows: [{ rowKey: "a", label: "A" }] });
		expect(lastValue(updates)).toBe("⠋ /ns:flow:submit · running · 0/1");
	});

	test("appends and clears the first active operation", () => {
		const { activity, updates } = createActivity();

		activity.applyPhaseEvent({
			type: "matrix-active-operations",
			operations: [
				{ kind: "model", operation: "title-draft", modelRef: "claude-sonnet" },
				{ kind: "command", display: "gt submit" },
			],
		});
		expect(lastValue(updates)).toBe(
			"⠋ /ns:flow:submit · running · LM · title-draft · claude-sonnet",
		);
		activity.applyPhaseEvent({ type: "matrix-active-operations", operations: [] });
		expect(lastValue(updates)).toBe("⠋ /ns:flow:submit · running");
	});

	test("pauses heartbeat ticks while a prompt is open", () => {
		const { activity, timers, updates } = createActivity();

		timers.advanceMs(1_000);
		expect(lastValue(updates)).toBe("⠙ /ns:flow:submit · running");
		activity.setPhase("waiting for confirmation");
		expect(lastValue(updates)).toBe("? /ns:flow:submit · waiting for confirmation");
		expect(timers.pendingTimerCount()).toBe(0);
		timers.advanceMs(5_000);
		expect(lastValue(updates)).toBe("? /ns:flow:submit · waiting for confirmation");
		activity.setPhase("running CLI command");
		expect(lastValue(updates)).toBe("⠙ /ns:flow:submit · running");
		expect(timers.pendingTimerCount()).toBe(1);
		timers.advanceMs(1_000);
		expect(lastValue(updates)).toBe("⠹ /ns:flow:submit · running");
	});

	test("defers elapsed time until five seconds and updates it on heartbeat", () => {
		const { activity, clock, timers, updates } = createActivity();

		clock.setMs(4_900);
		timers.advanceMs(1_000);
		expect(lastValue(updates)).toBe("⠙ /ns:flow:submit · running");
		clock.setMs(5_000);
		timers.advanceMs(1_000);
		expect(lastValue(updates)).toBe("⠹ /ns:flow:submit · running · 5s");
		activity.close();
	});

	test("sanitizes all event-derived status fragments and caps the final line", () => {
		const { activity, updates } = createActivity();

		apply(activity, [
			{
				type: "phases-declared",
				title: "ignored\u001b[2J",
				phases: [{ key: "publish", name: "Pub\u001b[2Jlish\u0007" }],
			},
			{
				type: "phase-started",
				phaseKey: "publish",
				label: `label\u001b[H${"x".repeat(120)}\n`,
			},
			{
				type: "matrix-active-operations",
				operations: [{ kind: "command", display: "gt\u001b[2J submit\r" }],
			},
		]);
		const status = lastValue(updates);
		expect(status).not.toMatch(/[\x00-\x1F\x7F]/);
		expect(status).not.toContain("\u001b");
		expect(status).toContain("Publish · label");
		expect(status.length).toBeLessThanOrEqual(100);
	});

	test("deduplicates identical semantic writes", () => {
		const { activity, updates } = createActivity();

		activity.setPhase("running CLI command");
		activity.setPhase("running CLI command");
		expect(updates).toHaveLength(1);
	});

	test("detaches and cancels its timer when the status context becomes stale", () => {
		const { activity, timers, updates } = createActivity({ staleAfterWrites: 1 });

		activity.setPhase("waiting for Pi");
		expect(updates).toHaveLength(1);
		expect(timers.pendingTimerCount()).toBe(0);
		expect(() => activity.close()).not.toThrow();
	});

	test("close is idempotent and clears the status exactly once", () => {
		const { activity, timers, updates } = createActivity();

		activity.close();
		activity.close();
		expect(updates).toEqual([
			{ key: "ns-cli-command", value: "⠋ /ns:flow:submit · running" },
			{ key: "ns-cli-command", value: undefined },
		]);
		expect(timers.pendingTimerCount()).toBe(0);
	});

	test("is a no-op shell without UI", () => {
		const { activity, timers, updates } = createActivity({ hasUI: false });

		activity.setPhase("waiting for Pi");
		activity.close();
		expect(updates).toEqual([]);
		expect(timers.pendingTimerCount()).toBe(0);
	});

	test("is a no-op shell when setStatus is unavailable", () => {
		const timers = createManualTimerScheduler();
		const activity = new CliCommandStatusActivity(
			{ hasUI: true, ui: {} },
			{
				cliName: "ns",
				commandName: "flow submit",
				piCommandName: "ns:flow:submit",
				timers: timers.timers,
			},
		);

		activity.setPhase("waiting for Pi");
		activity.close();
		expect(timers.pendingTimerCount()).toBe(0);
	});
});
