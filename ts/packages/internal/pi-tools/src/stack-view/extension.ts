/**
 * This extension is vibecoded (deliberate cross-harness-parity exception: no CLI
 * surface in v1).
 *
 * Promotion path: a future `@nseng-ai/stackview` capability package with an
 * `ns stack view` CLI plus `definePiSurfaceParity` metadata.
 *
 * The `ExtensionAPI` / `CommandContext` types below are deliberately narrowed to
 * only the host capabilities stack-view actually uses.
 */
import { z } from "zod";

import { registerCommandWithImmediateAck } from "@nseng-ai/pi/commands/ack";
import { definePiSurfaceParity } from "@nseng-ai/pi/parity/extension";
import { truncateDisplayLine } from "@nseng-ai/pi/terminal/presentation";
import { commandSucceeded } from "@nseng-ai/foundation/exec";
import { loadStackView, type LoadStackViewResult } from "./data.ts";
import { stackViewExecApi, type ExecOptions, type ExecResult } from "./exec.ts";
import { buildSummaryPrompt, renderPlainSnapshot } from "./render.ts";
import type { StackViewModel } from "./types.ts";
import {
	runStackViewInlineUi,
	type StackViewCustomComponent,
	type StackViewUiResult,
} from "./inline-ui.ts";

/** The `/stack:view` slash-command name (also its `setStatus` key). */
export const STACK_VIEW_COMMAND_NAME = "stack:view";

/** Custom-message type for the plain stack snapshot emitted to the transcript. */
export const STACK_VIEW_SNAPSHOT_MESSAGE_TYPE = "stack-view-snapshot";

type NotifyLevel = "info" | "warning" | "error";

/** Pi command handler context; narrowed to only what stack-view uses. */
export interface CommandContext {
	cwd: string;
	hasUI: boolean;
	waitForIdle(): Promise<void>;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
		custom?<T>(
			factory: (
				tui: unknown,
				theme: unknown,
				keybindings: unknown,
				done: (value: T) => void,
			) => StackViewCustomComponent,
			options?: unknown,
		): Promise<T>;
	};
}

/** The plain-snapshot custom message stack-view sends to the transcript. */
export interface StackViewSnapshotMessage {
	customType: string;
	content: string;
	display: boolean;
	details?: unknown;
}

/** Narrow render theme the snapshot renderer needs (foreground styling only). */
export interface StackViewSnapshotRenderTheme {
	fg(color: string, text: string): string;
}

/** The component shape the snapshot renderer returns to the host. */
export interface StackViewSnapshotRenderComponent {
	render(width: number): string[];
	invalidate(): void;
}

/** Message renderer for {@link STACK_VIEW_SNAPSHOT_MESSAGE_TYPE}. */
export type StackViewSnapshotRenderer = (
	message: StackViewSnapshotMessage,
	options: { expanded: boolean },
	theme: StackViewSnapshotRenderTheme,
) => StackViewSnapshotRenderComponent;

/** Narrow view of the Pi extension host used by the stack-view extension. */
export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	sendUserMessage(content: string): void;
	sendMessage?(message: StackViewSnapshotMessage): void;
	registerMessageRenderer?(customType: string, renderer: StackViewSnapshotRenderer): void;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

export const stackViewParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: STACK_VIEW_COMMAND_NAME,
		workflow:
			"Render the current branch's Graphite stack as an interactive merge-readiness panel with per-PR badges, objective attribution, and an opt-in agent-written stack summary",
		parity: "WAIVED",
		fallback:
			"Non-Pi agents can inspect the stack with 'gt log' plus 'gh pr view'/'gh pr checks' per branch, or open the stack on app.graphite.com.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@internal/pi-tools/stack-view",
		sourceModule: "stack-view",
		notes:
			"Vibecoded v1 is Pi-native interactive session UI (inline panel, keyboard navigation, transcript snapshot). Promotion path: a future @nseng-ai/stackview capability with an 'ns stack view' CLI, at which point this record graduates from WAIVED.",
	},
] as const);

export function registerStackViewExtension(pi: ExtensionAPI): void {
	pi.registerMessageRenderer?.(STACK_VIEW_SNAPSHOT_MESSAGE_TYPE, renderStackViewSnapshotMessage);

	registerCommandWithImmediateAck({
		host: pi,
		commandName: STACK_VIEW_COMMAND_NAME,
		commandDefinition: {
			description: "Show the current Graphite stack as an interactive merge-readiness panel.",
			handler: async (_args, ctx) => handleStackViewCommand(pi, ctx),
		},
	});
}

export default registerStackViewExtension;

async function handleStackViewCommand(pi: ExtensionAPI, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();

	const loaded = await loadStackViewWithStatus(pi, ctx);
	if (loaded.type === "not-on-stack") {
		ctx.ui.notify(loaded.reason, "info");
		return;
	}
	if (loaded.type === "error") {
		ctx.ui.notify(loaded.message, "error");
		return;
	}

	let model = loaded.model;

	// No interactive UI: emit the plain snapshot and stop.
	if (!ctx.hasUI || ctx.ui.custom === undefined) {
		sendSnapshotMessage(pi, ctx, model);
		return;
	}

	let selectedIndex: number | undefined;
	for (;;) {
		let result: StackViewUiResult | undefined;
		try {
			result = await runStackViewInlineUi(
				model,
				ctx,
				selectedIndex === undefined ? {} : { selectedIndex },
			);
		} catch {
			// Custom UI support can be absent or drift across Pi runtimes; fall back
			// to the durable plain snapshot rather than failing the command.
			sendSnapshotMessage(pi, ctx, model);
			return;
		}
		if (result === undefined) {
			sendSnapshotMessage(pi, ctx, model);
			return;
		}

		selectedIndex = result.selectedIndex;
		const outcome = result.outcome;

		if (outcome.action === "open") {
			await openGraphiteUrl(pi, ctx, outcome.url);
			continue;
		}

		if (outcome.action === "refresh") {
			const previousBranch = model.prs[selectedIndex]?.branch;
			const reloaded = await loadStackViewWithStatus(pi, ctx);
			if (reloaded.type === "not-on-stack") {
				ctx.ui.notify(reloaded.reason, "info");
				return;
			}
			if (reloaded.type === "error") {
				ctx.ui.notify(reloaded.message, "error");
				return;
			}
			model = reloaded.model;
			selectedIndex = reselectByBranch(model, previousBranch, selectedIndex);
			continue;
		}

		if (outcome.action === "summarize") {
			sendSnapshotMessage(pi, ctx, model);
			pi.sendUserMessage(buildSummaryPrompt(model));
			return;
		}

		// close
		sendSnapshotMessage(pi, ctx, model);
		return;
	}
}

/** Load the stack while showing an ephemeral status line, clearing it when done. */
async function loadStackViewWithStatus(
	pi: ExtensionAPI,
	ctx: CommandContext,
): Promise<LoadStackViewResult> {
	ctx.ui.setStatus(STACK_VIEW_COMMAND_NAME, "loading stack…");
	try {
		return await loadStackView({ execApi: stackViewExecApi(pi), cwd: ctx.cwd });
	} finally {
		ctx.ui.setStatus(STACK_VIEW_COMMAND_NAME, undefined);
	}
}

/** Fire the URL through the host `open` command; notify gently (never throw) on nonzero exit. */
async function openGraphiteUrl(pi: ExtensionAPI, ctx: CommandContext, url: string): Promise<void> {
	const result = await pi.exec("open", [url]);
	if (!commandSucceeded(result)) {
		ctx.ui.notify(`Could not open ${url} (exit ${result.code}).`, "warning");
	}
}

/**
 * After a refresh, keep the user on the same branch when it still exists;
 * otherwise clamp the previous index into the new row range.
 */
function reselectByBranch(
	model: StackViewModel,
	branch: string | undefined,
	fallbackIndex: number,
): number {
	if (branch !== undefined) {
		const index = model.prs.findIndex((row) => row.branch === branch);
		if (index >= 0) return index;
	}
	const count = model.prs.length;
	if (count === 0) return 0;
	return Math.min(Math.max(fallbackIndex, 0), count - 1);
}

/** Send the plain snapshot as a rendered custom message, or notify when the host cannot render one. */
function sendSnapshotMessage(pi: ExtensionAPI, ctx: CommandContext, model: StackViewModel): void {
	const content = renderPlainSnapshot(model);
	if (pi.sendMessage !== undefined) {
		pi.sendMessage({
			customType: STACK_VIEW_SNAPSHOT_MESSAGE_TYPE,
			content,
			display: true,
			details: { model: serializeStackViewModel(model) },
		});
		return;
	}
	ctx.ui.notify(content, "info");
}

/**
 * Serialize the model for message `details`. `objectivesBySlug` is a Map, which
 * does not survive structured cloning / JSON, so it is flattened to an array of
 * `[slug, prNumbers]` entries; every other field is plain-cloneable data.
 */
function serializeStackViewModel(model: StackViewModel): SerializedStackViewModel {
	return {
		trunk: model.trunk,
		currentBranch: model.currentBranch,
		owner: model.owner,
		repo: model.repo,
		prs: model.prs,
		objectivesBySlug: [...model.objectivesBySlug.entries()],
	};
}

function renderStackViewSnapshotMessage(
	message: StackViewSnapshotMessage,
	_options: { expanded: boolean },
	theme: StackViewSnapshotRenderTheme,
): StackViewSnapshotRenderComponent {
	const model = stackViewModelFromDetails(message.details);
	const lines =
		model !== undefined ? renderPlainSnapshot(model).split("\n") : message.content.split("\n");
	return {
		render(width: number): string[] {
			return lines.map((line) => theme.fg("dim", truncateDisplayLine(line, width)));
		},
		invalidate(): void {},
	};
}

const stackViewPrChecksSchema = z.object({
	passing: z.number(),
	failing: z.number(),
	pending: z.number(),
	total: z.number(),
});

const stackViewPrThreadsSchema = z.object({
	resolved: z.number(),
	total: z.number(),
});

const stackViewPrSchema = z.object({
	branch: z.string(),
	parentBranch: z.string(),
	number: z.number().nullable(),
	title: z.string(),
	url: z.string(),
	graphiteUrl: z.string(),
	isDraft: z.boolean(),
	body: z.string(),
	threads: stackViewPrThreadsSchema,
	checks: stackViewPrChecksSchema,
	status: z.enum(["draft", "checks-failing", "unresolved", "ready", "no-pr"]),
	objectiveSlugs: z.array(z.string()),
});

const serializedStackViewModelSchema = z.object({
	trunk: z.string(),
	currentBranch: z.string(),
	owner: z.string(),
	repo: z.string(),
	prs: z.array(stackViewPrSchema),
	objectivesBySlug: z.array(z.tuple([z.string(), z.array(z.number())])),
});

type SerializedStackViewModel = z.infer<typeof serializedStackViewModelSchema>;

const stackViewSnapshotDetailsSchema = z.object({ model: serializedStackViewModelSchema });

/** Rebuild a {@link StackViewModel} from message `details`; `undefined` on any shape mismatch. */
function stackViewModelFromDetails(details: unknown): StackViewModel | undefined {
	const parsed = stackViewSnapshotDetailsSchema.safeParse(details);
	if (!parsed.success) return undefined;
	const model = parsed.data.model;
	return {
		trunk: model.trunk,
		currentBranch: model.currentBranch,
		owner: model.owner,
		repo: model.repo,
		prs: model.prs,
		objectivesBySlug: new Map(model.objectivesBySlug),
	};
}
