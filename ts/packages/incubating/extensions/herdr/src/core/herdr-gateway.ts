/**
 * Herdr Consumer Gateway — narrow domain-shaped interface for the subset of
 * Herdr workspace operations that the herdr capability currently needs.
 *
 * Only operations with demonstrated Herdr 0.8.0 CLI backing are included.
 * Metadata operations expose custom token reporting and conservative workspace
 * identity evidence without leaking raw CLI response shapes.
 */
export interface HerdrGateway {
	/**
	 * Apply a display label to the identified Herdr workspace.
	 *
	 * Maps to: `herdr workspace rename <workspaceId> <label>`
	 *
	 * Returns `{ type: "applied" }` on success.
	 * Returns `{ type: "failed"; message: string }` when the command exits
	 * non-zero or the workspace is not found.
	 */
	renameWorkspace(workspaceId: string, label: string): Promise<HerdrWorkspaceRenameResult>;

	/** Apply a display label to one exact Herdr tab. */
	renameTab(tabId: string, label: string): Promise<HerdrTabRenameResult>;

	/**
	 * Create a new Herdr workspace.
	 *
	 * Maps to: `herdr workspace create [--no-focus] [--cwd <cwd>] [--label <label>]`
	 *
	 * Returns the created workspace ID, root pane ID, and root tab ID on success.
	 * Returns `{ type: "failed"; message: string }` on non-zero exit or parse
	 * failure.
	 */
	createWorkspace(options: HerdrCreateWorkspaceOptions): Promise<HerdrCreateWorkspaceResult>;

	/**
	 * Create a new Herdr tab inside an existing workspace.
	 *
	 * Maps to:
	 * `herdr tab create --workspace <workspaceId> [--focus|--no-focus] [--cwd <cwd>] [--label <label>]`
	 *
	 * Pass `shouldFocus: true` to activate/focus the tab immediately after creation
	 * (used for tab launch so the caller sees the new tab). Defaults to
	 * `false` (`--no-focus`).
	 *
	 * Returns the created tab ID, root pane ID, and workspace ID on success.
	 * Returns `{ type: "failed"; message: string }` on non-zero exit or parse
	 * failure.
	 */
	createTab(options: HerdrCreateTabOptions): Promise<HerdrCreateTabResult>;

	/**
	 * Run a shell command inside a specific Herdr pane (sends the text + Enter).
	 *
	 * Maps to: `herdr pane run <paneId> <command>`
	 *
	 * Returns `{ type: "ok" }` on success (exit code 0).
	 * Returns `{ type: "failed"; message: string }` on non-zero exit.
	 */
	runInPane(paneId: string, command: string): Promise<HerdrPaneRunResult>;

	/**
	 * Resolve the Herdr caller pane identity containing this process.
	 *
	 * Maps to: `herdr pane current --current` (Herdr's caller-aware current-pane
	 * query, not a UI-focus query). The complete caller workspace, tab, and pane
	 * identity is returned together from that single query.
	 *
	 * Returns `{ type: "resolved"; workspaceId; tabId; paneId }` on success.
	 * Returns `{ type: "failed"; message: string }` on non-zero exit, parse
	 * failure, or a response missing any required ID.
	 */
	resolveCallerPane(): Promise<HerdrCallerPaneResult>;

	/** Set or clear one custom display token on an exact pane. */
	reportPaneToken(paneId: string, token: HerdrMetadataToken): Promise<HerdrMetadataReportResult>;

	/** Set or clear one custom display token on an exact workspace. */
	reportWorkspaceToken(
		workspaceId: string,
		token: HerdrMetadataToken,
	): Promise<HerdrMetadataReportResult>;

	/**
	 * Resolve every possible workspace identity pane from the first current tab.
	 * Callers may mutate workspace metadata only when policy over this complete
	 * candidate set is independent of which pane is the tab's root pane.
	 */
	resolveWorkspaceIdentityCandidates(
		workspaceId: string,
	): Promise<HerdrWorkspaceIdentityCandidatesResult>;
}

export type HerdrCallerPaneResult =
	| { type: "resolved"; workspaceId: string; tabId: string; paneId: string }
	| { type: "failed"; message: string };

export interface HerdrMetadataToken {
	readonly source: string;
	readonly name: string;
	/** A null value deliberately clears the token. */
	readonly value: string | null;
}

export type HerdrMetadataReportResult = { type: "reported" } | { type: "failed"; message: string };

export interface HerdrWorkspaceIdentityCandidate {
	readonly paneId: string;
	readonly cwd: string;
}

export type HerdrWorkspaceIdentityCandidatesResult =
	| { type: "resolved"; candidates: readonly HerdrWorkspaceIdentityCandidate[] }
	| { type: "ambiguous" }
	| { type: "failed"; message: string };

export type HerdrWorkspaceRenameResult = { type: "applied" } | { type: "failed"; message: string };
export type HerdrTabRenameResult = { type: "applied" } | { type: "failed"; message: string };

export interface HerdrCreateWorkspaceOptions {
	cwd: string;
	label?: string;
	/** Focus the new workspace by omitting `--no-focus`. Defaults to false for background launch. */
	shouldFocus?: boolean;
}

export type HerdrCreateWorkspaceResult =
	| { type: "created"; workspaceId: string; rootPaneId: string; tabId: string }
	| { type: "failed"; message: string };

export interface HerdrCreateTabOptions {
	workspaceId: string;
	cwd?: string;
	label?: string;
	/**
	 * When `true`, the Herdr CLI creates the tab with `--focus` so it becomes
	 * immediately visible to the user. When `false` or omitted, `--no-focus`
	 * is used.
	 */
	shouldFocus?: boolean;
}

export type HerdrCreateTabResult =
	| { type: "created"; tabId: string; rootPaneId: string; workspaceId: string }
	| { type: "failed"; message: string };

export type HerdrPaneRunResult = { type: "ok" } | { type: "failed"; message: string };
