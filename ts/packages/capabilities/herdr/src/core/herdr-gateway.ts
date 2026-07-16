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
}

export type HerdrWorkspaceRenameResult = { type: "applied" } | { type: "failed"; message: string };
