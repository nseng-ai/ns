import type { CustomMessageContent } from "@sdl/pi/terminal/presentation";

export type {
	ExecResult,
	FormatWorktreeStatusOptions,
	GhHeadMismatchStatus,
	GhStatus,
	GtCommitStatus,
	GtStatus,
	LoadLocalWorktreeStatusOptions,
	LoadWorktreeGhStatusOptions,
	LocalWorktreeStatus,
	StatusTheme,
	WorktreeGhStatus,
	WorktreeStatus,
	WorktreeStatusGitPaths,
	WorktreeStatusIdentity,
} from "./status.ts";

export interface CustomMessage {
	customType: string;
	content: CustomMessageContent;
	details?: unknown;
}

export interface RenderTheme {
	fg(color: string, text: string): string;
}

export interface RenderComponent {
	render(width: number): string[];
	invalidate(): void;
}

export type WorktreeStatusMessageRenderer = (
	message: CustomMessage,
	options: { expanded: boolean },
	theme: RenderTheme,
) => RenderComponent;
