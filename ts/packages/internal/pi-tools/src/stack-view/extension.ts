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
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry, Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { z } from "zod";

import { registerCommandWithImmediateAck } from "@nseng-ai/pi/commands/ack";
import { definePiSurfaceParity } from "@nseng-ai/pi/parity/extension";
import { truncateDisplayLine } from "@nseng-ai/pi/terminal/presentation";
import type { PiModelRegistryLike } from "@nseng-ai/pi/models/call";
import { commandSucceeded } from "@nseng-ai/foundation/exec";
import { loadStackView, type LoadStackViewResult } from "./data.ts";
import { createEnrichmentStore, type EnrichmentStore } from "./enrichment-store.ts";
import {
	createStackEnrichmentEngine,
	type CreateStackEnrichmentEngineOptions,
	type StackEnrichmentPort,
} from "./enrichment-engine.ts";
import {
	ComposeController,
	type ComposeControllerOptions,
	type ComposeViewPort,
} from "./compose-controller.ts";
import { createPiComposeSessionFactory } from "./compose-session.ts";
import {
	stackViewExecApi,
	type CommandExecApi,
	type ExecOptions,
	type ExecResult,
} from "./exec.ts";
import { buildSummaryPrompt, renderPlainSnapshot } from "./render.ts";
import type { StackViewModel } from "./types.ts";
import { runStackViewOverlayUi, type StackViewUiResult } from "./overlay-ui.ts";

/** The `/stack:view` slash-command name (also its `setStatus` key). */
export const STACK_VIEW_COMMAND_NAME = "stack:view";

/** Custom-message type for the plain stack snapshot emitted to the transcript. */
export const STACK_VIEW_SNAPSHOT_MESSAGE_TYPE = "stack-view-snapshot";

type NotifyLevel = "info" | "warning" | "error";

/** Pi command handler context; narrowed to only what stack-view uses. */
export interface CommandContext {
	cwd: string;
	hasUI: boolean;
	/**
	 * The Pi model selected in the parent session, or `undefined` when none is set.
	 * Compose spawns a side-session against this model; when absent, compose mode
	 * is not offered. Type-only dependency on pi-ai's runnable `Model<Api>`.
	 */
	model: Model<Api> | undefined;
	/**
	 * The host's Pi model registry. It drives cheap-model enrichment summaries
	 * (needing only the structural {@link PiModelRegistryLike}) and backs the
	 * compose side-session (needing pi-coding-agent's concrete `ModelRegistry` to
	 * spawn an `AgentSession`). The real host provides a `ModelRegistry`, which
	 * satisfies both — the intersection makes both contracts honest without an
	 * `as unknown as` launder at the compose call site.
	 */
	modelRegistry: ModelRegistry & PiModelRegistryLike;
	waitForIdle(): Promise<void>;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
		custom?<T>(
			factory: (
				tui: TUI,
				theme: Theme,
				keybindings: unknown,
				done: (value: T) => void,
			) => Component,
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
	sendUserMessage(content: string, options?: { deliverAs?: "steer" | "followUp" }): void;
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
			"Vibecoded v1 is Pi-native interactive session UI (modal overlay panel, keyboard navigation, transcript snapshot, plus a compose side-session that drafts a message and injects it as a follow-up). Promotion path: a future @nseng-ai/stackview capability with an 'ns stack view' CLI, at which point this record graduates from WAIVED.",
	},
] as const);

/** Factory for the enrichment engine; a test seam kept off the public parity surface. */
type StackEnrichmentEngineFactory = (
	options: CreateStackEnrichmentEngineOptions,
) => StackEnrichmentPort;

/** The stack loader signature; a test seam matching {@link loadStackView}. */
type LoadStackViewFn = (options: {
	execApi: CommandExecApi;
	cwd: string;
}) => Promise<LoadStackViewResult>;

interface StackViewCommandSession {
	pi: ExtensionAPI;
	ctx: CommandContext;
}

/** A compose port plus its teardown hook — the overlay holds the port, the host disposes it. */
export type ComposeControllerHandle = ComposeViewPort & { dispose(): void };

/** Factory for the compose controller; a test seam kept off the public parity surface. */
type ComposeControllerFactory = (options: ComposeControllerOptions) => ComposeControllerHandle;

/**
 * Per-invocation collaborators for {@link handleStackViewCommand}. `store` is
 * shared across invocations (memoization survives overlay reopen); `engineFactory`,
 * `loadStackView`, and `composeControllerFactory` are internal test seams, kept
 * off the public parity surface.
 */
interface StackViewCommandDeps {
	store: EnrichmentStore;
	engineFactory: StackEnrichmentEngineFactory;
	loadStackView: LoadStackViewFn;
	composeControllerFactory: ComposeControllerFactory;
}

/** Registration options; every field is an internal test seam only. */
export interface RegisterStackViewExtensionOptions {
	engineFactory?: StackEnrichmentEngineFactory;
	loadStackView?: LoadStackViewFn;
	composeControllerFactory?: ComposeControllerFactory;
}

export function registerStackViewExtension(
	pi: ExtensionAPI,
	options: RegisterStackViewExtensionOptions = {},
): void {
	pi.registerMessageRenderer?.(STACK_VIEW_SNAPSHOT_MESSAGE_TYPE, renderStackViewSnapshotMessage);

	// One store per registration so enrichment memoization survives overlay
	// close/reopen within a session; each command invocation builds a fresh engine
	// over this shared, store-memoized state.
	const deps: StackViewCommandDeps = {
		store: createEnrichmentStore(),
		engineFactory: options.engineFactory ?? createStackEnrichmentEngine,
		loadStackView: options.loadStackView ?? loadStackView,
		composeControllerFactory:
			options.composeControllerFactory ??
			((controllerOptions) => new ComposeController(controllerOptions)),
	};

	registerCommandWithImmediateAck({
		host: pi,
		commandName: STACK_VIEW_COMMAND_NAME,
		commandDefinition: {
			description: "Show the current Graphite stack as an interactive merge-readiness panel.",
			handler: async (_args, ctx) => handleStackViewCommand(pi, ctx, deps),
		},
	});
}

export default registerStackViewExtension;

async function handleStackViewCommand(
	pi: ExtensionAPI,
	ctx: CommandContext,
	deps: StackViewCommandDeps,
): Promise<void> {
	await ctx.waitForIdle();
	const session: StackViewCommandSession = { pi, ctx };

	const loaded = await loadStackViewWithStatus(session, deps.loadStackView);
	if (loaded.type === "not-on-stack") {
		ctx.ui.notify(loaded.reason, "info");
		return;
	}
	if (loaded.type === "error") {
		ctx.ui.notify(loaded.message, "error");
		return;
	}

	let model = loaded.model;

	// No interactive UI: emit the plain snapshot and stop. The engine is never
	// created or touched on this path.
	if (!ctx.hasUI || ctx.ui.custom === undefined) {
		sendSnapshotMessage(session, model);
		return;
	}

	// One engine per invocation, reused across refreshes: its store-memoized keys
	// make reuse cheap, and the model is passed per `ensureRow` call. Abort in the
	// finally so in-flight background work is cancelled once the loop exits.
	const engine = deps.engineFactory({
		store: deps.store,
		execApi: stackViewExecApi(pi),
		cwd: ctx.cwd,
		registry: ctx.modelRegistry,
	});
	// Compose is available only when the parent session has a model; the controller
	// is built lazily on first entry and disposed when the stack context turns
	// stale (refresh) or the loop exits.
	const composeModel = ctx.model;
	let composeController: ComposeControllerHandle | undefined;
	const disposeCompose = (): void => {
		composeController?.dispose();
		composeController = undefined;
	};
	const composeOption =
		composeModel === undefined
			? undefined
			: {
					createPort: (onChange: () => void): ComposeViewPort => {
						// Every recreation path (e.g. the `open` outcome's continue rebuilds
						// the overlay) must release the prior controller's side session.
						disposeCompose();
						const controller = deps.composeControllerFactory({
							cwd: ctx.cwd,
							model: composeModel,
							modelRegistry: ctx.modelRegistry,
							stackModel: model,
							enrichment: engine,
							factory: createPiComposeSessionFactory(),
							onChange,
						});
						composeController = controller;
						return controller;
					},
				};
	try {
		let selectedIndex: number | undefined;
		for (;;) {
			let result: StackViewUiResult | undefined;
			try {
				result = await runStackViewOverlayUi(model, ctx, {
					...(selectedIndex === undefined ? {} : { selectedIndex }),
					enrichment: engine,
					...(composeOption === undefined ? {} : { compose: composeOption }),
				});
			} catch {
				// Custom UI support can be absent or drift across Pi runtimes; fall back
				// to the durable plain snapshot rather than failing the command.
				sendSnapshotMessage(session, model);
				return;
			}
			if (result === undefined) {
				sendSnapshotMessage(session, model);
				return;
			}

			selectedIndex = result.selectedIndex;
			const outcome = result.outcome;

			if (outcome.action === "open") {
				await openGraphiteUrl(session, outcome.url);
				continue;
			}

			if (outcome.action === "refresh") {
				// The stack context is about to change; dispose the compose controller
				// so the next compose entry rebuilds one over the fresh stack model.
				disposeCompose();
				const previousBranch = model.prs[selectedIndex]?.branch;
				const reloaded = await loadStackViewWithStatus(session, deps.loadStackView);
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
				sendSnapshotMessage(session, model);
				pi.sendUserMessage(buildSummaryPrompt(model));
				return;
			}

			if (outcome.action === "compose-inject") {
				// Anchor the transcript with the stack snapshot, then deliver the drafted
				// message as a follow-up so the parent agent acts on it next turn.
				sendSnapshotMessage(session, model);
				pi.sendUserMessage(outcome.draft, { deliverAs: "followUp" });
				return;
			}

			// close
			sendSnapshotMessage(session, model);
			return;
		}
	} finally {
		disposeCompose();
		engine.abort();
	}
}

/** Load the stack while showing an ephemeral status line, clearing it when done. */
async function loadStackViewWithStatus(
	session: StackViewCommandSession,
	load: LoadStackViewFn,
): Promise<LoadStackViewResult> {
	session.ctx.ui.setStatus(STACK_VIEW_COMMAND_NAME, "loading stack…");
	try {
		return await load({ execApi: stackViewExecApi(session.pi), cwd: session.ctx.cwd });
	} finally {
		session.ctx.ui.setStatus(STACK_VIEW_COMMAND_NAME, undefined);
	}
}

/** Fire the URL through the host `open` command; notify gently (never throw) on nonzero exit. */
async function openGraphiteUrl(session: StackViewCommandSession, url: string): Promise<void> {
	const result = await session.pi.exec("open", [url]);
	if (!commandSucceeded(result)) {
		session.ctx.ui.notify(`Could not open ${url} (exit ${result.code}).`, "warning");
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
function sendSnapshotMessage(session: StackViewCommandSession, model: StackViewModel): void {
	const content = renderPlainSnapshot(model);
	if (session.pi.sendMessage !== undefined) {
		session.pi.sendMessage({
			customType: STACK_VIEW_SNAPSHOT_MESSAGE_TYPE,
			content,
			display: true,
			details: { model: serializeStackViewModel(model) },
		});
		return;
	}
	session.ctx.ui.notify(content, "info");
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

const stackViewCheckEntrySchema = z.object({
	name: z.string(),
	workflowName: z.string().nullable(),
	bucket: z.enum(["passing", "failing", "pending"]),
	// Additive fields: old persisted snapshots omit these, so default them.
	status: z.string().nullable().default(null),
	conclusion: z.string().nullable().default(null),
	detailsUrl: z.string().nullable().default(null),
	identity: z.string().nullable().default(null),
});

const stackViewThreadCommentSchema = z.object({
	id: z.string(),
	author: z.string().nullable(),
	body: z.string(),
	createdAt: z.string().nullable(),
});

const stackViewThreadDetailSchema = z.object({
	path: z.string(),
	line: z.number().nullable(),
	author: z.string().nullable(),
	// Additive fields: old persisted snapshots omit these, so default them.
	id: z.string().nullable().default(null),
	comments: z.array(stackViewThreadCommentSchema).default([]),
	lastCommentId: z.string().nullable().default(null),
	totalComments: z.number().default(0),
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
	checkEntries: z.array(stackViewCheckEntrySchema),
	unresolvedThreads: z.array(stackViewThreadDetailSchema),
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
export function stackViewModelFromDetails(details: unknown): StackViewModel | undefined {
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
