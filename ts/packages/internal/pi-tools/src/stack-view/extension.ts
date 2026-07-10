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
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { registerCommandWithImmediateAck } from "@nseng-ai/pi/commands/ack";
import { errorMessage } from "@nseng-ai/pi/shared/errors";
import { definePiSurfaceParity } from "@nseng-ai/pi/parity/extension";
import { truncateDisplayLine } from "@nseng-ai/pi/terminal/presentation";
import type { PiModelRegistryLike } from "@nseng-ai/pi/models/call";
import { commandFailureReason, commandSucceeded } from "@nseng-ai/foundation/exec";
import { createPiCommandExecApi, type RawPiExecApi } from "@nseng-ai/pi/shared/exec-gateway";
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
import type { CommandExecApi, ExecResult } from "./exec.ts";
import { buildSummaryPrompt, renderPlainSnapshot } from "./render.ts";
import type { StackViewModel } from "./types.ts";
import {
	stackViewSnapshotDetailsSchema,
	type SerializedStackViewModel,
} from "./snapshot-schema.ts";
import {
	runStackViewOverlayUi,
	type StackViewComposeOption,
	type StackViewCustomUi,
	type StackViewUiResult,
} from "./overlay-ui.ts";

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
	ui: StackViewCustomUi & {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
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
export interface ExtensionAPI extends RawPiExecApi {
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
	commands: CommandExecApi;
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
	const commands = createPiCommandExecApi(pi);

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
			handler: async (_args, ctx) => handleStackViewCommand(pi, commands, ctx, deps),
		},
	});
}

export default registerStackViewExtension;

async function handleStackViewCommand(
	pi: ExtensionAPI,
	commands: CommandExecApi,
	ctx: CommandContext,
	deps: StackViewCommandDeps,
): Promise<void> {
	await ctx.waitForIdle();
	const session: StackViewCommandSession = { pi, commands, ctx };

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
		execApi: commands,
		cwd: ctx.cwd,
		registry: ctx.modelRegistry,
	});
	const composeLifecycle = createComposeLifecycle({
		ctx,
		getStackModel: () => model,
		enrichment: engine,
		composeControllerFactory: deps.composeControllerFactory,
	});
	try {
		let selectedIndex: number | undefined;
		for (;;) {
			let result: StackViewUiResult | undefined;
			try {
				result = await runStackViewOverlayUi(model, ctx, {
					...(selectedIndex === undefined ? {} : { selectedIndex }),
					enrichment: engine,
					...(composeLifecycle.option === undefined ? {} : { compose: composeLifecycle.option }),
				});
			} catch (error) {
				// The overlay threw — a real bug or a Pi-runtime drift. Surface it instead
				// of swallowing it, then fall back to the durable plain snapshot rather
				// than failing the command.
				ctx.ui.notify(`stack view: overlay failed (${errorMessage(error)})`, "warning");
				sendSnapshotMessage(session, model);
				return;
			}
			if (result === undefined) {
				sendSnapshotMessage(session, model);
				return;
			}

			selectedIndex = result.selectedIndex;
			const outcome = result.outcome;

			switch (outcome.action) {
				case "open":
					await openGraphiteUrl(session, outcome.url);
					continue;
				case "copy-branch":
					await copyBranchToClipboard(session, outcome.branch);
					return;
				case "refresh": {
					// The stack context is about to change; dispose the compose controller
					// so the next compose entry rebuilds one over the fresh stack model.
					composeLifecycle.disposeAll();
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
				case "summarize":
					sendSnapshotMessage(session, model);
					pi.sendUserMessage(buildSummaryPrompt(model));
					return;
				case "compose-inject":
					// Anchor the transcript with the stack snapshot, then deliver the drafted
					// message as a follow-up so the parent agent acts on it next turn.
					sendSnapshotMessage(session, model);
					pi.sendUserMessage(outcome.draft, { deliverAs: "followUp" });
					return;
				case "close":
					sendSnapshotMessage(session, model);
					return;
				default: {
					const exhaustive: never = outcome;
					return exhaustive;
				}
			}
		}
	} finally {
		composeLifecycle.disposeAll();
		engine.abort();
	}
}

interface StackViewComposeLifecycle {
	option: StackViewComposeOption | undefined;
	disposeAll(): void;
}

function createComposeLifecycle(options: {
	ctx: CommandContext;
	getStackModel(): StackViewModel;
	enrichment: StackEnrichmentPort;
	composeControllerFactory: ComposeControllerFactory;
}): StackViewComposeLifecycle {
	const composeModel = options.ctx.model;
	let composeController: ComposeControllerHandle | undefined;
	const disposeAll = (): void => {
		composeController?.dispose();
		composeController = undefined;
	};
	if (composeModel === undefined) return { option: undefined, disposeAll };
	return {
		option: {
			getPort: (): ComposeViewPort => {
				// Memoize one controller per live stack model: rebuilding the overlay
				// (e.g. the `open` outcome's continue) must NOT destroy the in-progress
				// side session, transcript, or draft. Only `refresh` (fresh stack) and
				// the loop `finally` dispose it, forcing a later rebuild.
				if (composeController === undefined) {
					composeController = options.composeControllerFactory({
						cwd: options.ctx.cwd,
						model: composeModel,
						modelRegistry: options.ctx.modelRegistry,
						stackModel: options.getStackModel(),
						enrichment: options.enrichment,
						factory: createPiComposeSessionFactory(),
					});
				}
				return composeController;
			},
		},
		disposeAll,
	};
}

/** Copy a selected branch to the system clipboard through `pbcopy`; warn gently on failure. */
async function copyBranchToClipboard(
	session: StackViewCommandSession,
	branch: string,
): Promise<void> {
	const displayBranch = truncateDisplayLine(branch, 80);
	await runAndNotify(session, {
		exec: () => session.commands.exec("/bin/sh", ["-c", 'printf %s "$1" | pbcopy', "sh", branch]),
		success: `Copied branch '${displayBranch}' to the clipboard.`,
		failure: (result) =>
			`Could not copy branch '${displayBranch}' to the clipboard (${commandFailureReason(result)}).`,
	});
}

/** Load the stack while showing an ephemeral status line, clearing it when done. */
async function loadStackViewWithStatus(
	session: StackViewCommandSession,
	load: LoadStackViewFn,
): Promise<LoadStackViewResult> {
	session.ctx.ui.setStatus(STACK_VIEW_COMMAND_NAME, "loading stack…");
	try {
		return await load({ execApi: session.commands, cwd: session.ctx.cwd });
	} finally {
		session.ctx.ui.setStatus(STACK_VIEW_COMMAND_NAME, undefined);
	}
}

interface RunAndNotifyOptions {
	exec(): Promise<ExecResult>;
	success?: string;
	failure(result: ExecResult): string;
}

async function runAndNotify(
	session: StackViewCommandSession,
	options: RunAndNotifyOptions,
): Promise<void> {
	const result = await options.exec();
	if (commandSucceeded(result)) {
		if (options.success !== undefined) session.ctx.ui.notify(options.success, "info");
		return;
	}
	session.ctx.ui.notify(options.failure(result), "warning");
}

/** Fire the URL through the host `open` command; notify gently (never throw) on nonzero exit. */
async function openGraphiteUrl(session: StackViewCommandSession, url: string): Promise<void> {
	await runAndNotify(session, {
		exec: () => session.commands.exec("open", [url]),
		failure: (result) => `Could not open ${url} (${commandFailureReason(result)}).`,
	});
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
