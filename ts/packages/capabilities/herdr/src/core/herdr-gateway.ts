/**
 * Herdr Consumer Gateway — narrow domain-shaped interface for the subset of
 * Herdr workspace operations that the herdr capability currently needs.
 *
 * Only operations with demonstrated CLI backing are included. The installed
 * Herdr CLI lacks `workspace report-metadata`, so metadata reporting is
 * intentionally absent; it remains parked until the installed binary supports
 * it (see herdr-capability-parity objective, roadmap "Parked" section).
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
	 * (used for tab dispatch so the caller sees the new tab). Defaults to
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
}

export type HerdrWorkspaceRenameResult = { type: "applied" } | { type: "failed"; message: string };
export type HerdrTabRenameResult = { type: "applied" } | { type: "failed"; message: string };

export interface HerdrCreateWorkspaceOptions {
	cwd: string;
	label?: string;
	/** Focus the new workspace by omitting `--no-focus`. Defaults to false for background dispatch. */
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
