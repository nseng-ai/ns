import type { CustomMessageContent } from "../terminal/presentation.ts";

export type ExecResult = {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
};

export interface WorktreeStatusGitPaths {
	repoDir: string;
	gitDir: string;
	commonGitDir: string;
	headPath: string;
}

export type GtCommitStatus =
	| { type: "count"; count: number }
	| { type: "unknown" }
	| { type: "not-applicable" };

export interface GtStatus {
	down: string | undefined;
	up: string;
	commits: GtCommitStatus;
	dirty: "yes" | "no";
}

export interface LoadLocalWorktreeStatusOptions {
	signal?: AbortSignal | undefined;
	identity?: WorktreeStatusIdentity | undefined;
}

export interface LoadWorktreeGhStatusOptions {
	signal?: AbortSignal | undefined;
	identity?: WorktreeStatusIdentity | undefined;
}

export interface WorktreeStatusIdentity {
	readonly cwd: string;
	readonly head: { type: "branch"; name: string } | { type: "detached" } | { type: "unknown" };
	readonly headOid?: string | undefined;
}

export interface GhStatus {
	type: "available";
	prNumber: number;
	url?: string | undefined;
	threads: { unresolved: number; total: number; hasMore: boolean };
	checks: { passing: number; pending: number; failing: number; unknown: number };
}

export interface GhHeadMismatchStatus {
	type: "head-mismatch";
	prNumber: number;
	url?: string | undefined;
	threads: { unresolved: number; total: number; hasMore: boolean };
	checks: { passing: number; pending: number; failing: number; unknown: number };
	prHeadOid: string;
}

export type WorktreeGhStatus =
	| GhStatus
	| GhHeadMismatchStatus
	| { type: "pending" }
	| { type: "no-pr" }
	| { type: "unavailable"; message?: string | undefined };

export interface LocalWorktreeStatus {
	identity: WorktreeStatusIdentity;
	brmem: string | undefined;
	gt: GtStatus;
	gtMetadataDiagnostic?: unknown;
}

export interface WorktreeStatus extends LocalWorktreeStatus {
	gh: WorktreeGhStatus;
}

export interface StatusTheme {
	fg(color: string, value: string): string;
	underline?(value: string): string;
}

export interface FormatWorktreeStatusOptions {
	readonly theme?: StatusTheme | undefined;
	readonly ghRefreshAgeMs?: number | undefined;
	readonly isDormant?: boolean | undefined;
}

interface CustomMessage {
	customType: string;
	content: CustomMessageContent;
	details?: unknown;
}

interface RenderTheme {
	fg(color: string, text: string): string;
}

interface RenderComponent {
	render(width: number): string[];
	invalidate(): void;
}

export type WorktreeStatusMessageRenderer = (
	message: CustomMessage,
	options: { expanded: boolean },
	theme: RenderTheme,
) => RenderComponent;
