import type { GrillSidequestRuntimeState } from "./hooks.ts";
import {
	buildSideQuestKickoffMessage,
	buildSideQuestReturnLabel,
	SIDE_QUEST_DISPOSITION_CHOICES,
	sideQuestDispositionFromChoice,
	sideQuestSummaryInstructions,
	type SideQuestDisposition,
} from "./prompts.ts";
import type { SidequestCommandContext, SidequestHost } from "./protocol.ts";
import { scanGrillBranchFromSessionManager } from "./state.ts";

/** `/pi:grill-sidequest <topic>` — start a side quest while the grill is idle. */
export async function handleGrillSidequestCommand(
	pi: SidequestHost,
	args: string,
	ctx: SidequestCommandContext,
): Promise<void> {
	const topic = args.trim();
	if (topic.length === 0) {
		notify(ctx, "Usage: /pi:grill-sidequest <topic>", "warning");
		return;
	}

	await ctx.waitForIdle();
	const scan = scanGrillBranchFromSessionManager(ctx.sessionManager);
	if (scan.grill !== "active") {
		notify(ctx, "No active grill session on this branch; start one with /pi:grill-me.", "warning");
		return;
	}
	if (scan.activeQuest !== undefined) {
		notify(
			ctx,
			`A side quest is already active (${scan.activeQuest.topic}). Return first with /pi:grill-return.`,
			"warning",
		);
		return;
	}

	pi.sendUserMessage(buildSideQuestKickoffMessage(topic, scan.latestAsk?.question));
}

/** `/pi:grill-return` — pick a disposition and jump back to the side-quest mark. */
export async function handleGrillReturnCommand(
	ctx: SidequestCommandContext,
	state: GrillSidequestRuntimeState,
): Promise<void> {
	await ctx.waitForIdle();
	const scan = scanGrillBranchFromSessionManager(ctx.sessionManager);
	const quest = scan.grill === "active" ? scan.activeQuest : undefined;
	if (quest === undefined) {
		notify(ctx, "No active side quest to return from.", "warning");
		return;
	}

	const disposition = await pickReturnDisposition(ctx, quest.topic);
	if (disposition === undefined) {
		notify(ctx, "Side-quest return cancelled.", "info");
		return;
	}

	await state.runCommandInitiatedReturn(async () => {
		await ctx.navigateTree(quest.markEntryId, {
			summarize: disposition !== "discard",
			...(disposition === "discard"
				? {}
				: {
						customInstructions: sideQuestSummaryInstructions(disposition),
						label: buildSideQuestReturnLabel(quest.topic),
					}),
		});
	});
}

async function pickReturnDisposition(
	ctx: SidequestCommandContext,
	topic: string,
): Promise<SideQuestDisposition | undefined> {
	if (ctx.hasUI === false || ctx.ui.select === undefined) return "fold-in";
	const choice = await ctx.ui.select(`Return from side quest: ${topic}`, [
		SIDE_QUEST_DISPOSITION_CHOICES["fold-in"],
		SIDE_QUEST_DISPOSITION_CHOICES.note,
		SIDE_QUEST_DISPOSITION_CHOICES.discard,
	]);
	return sideQuestDispositionFromChoice(choice);
}

function notify(ctx: SidequestCommandContext, message: string, level: "info" | "warning"): void {
	if (ctx.hasUI === false) return;
	ctx.ui.notify?.(message, level);
}
