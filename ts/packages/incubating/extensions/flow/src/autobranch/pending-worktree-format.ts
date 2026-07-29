import type { PendingWorktreeError } from "@nseng-ai/extension-kit/pending-worktree";
import { pendingWorktreeFailureFacts } from "../checkpoint/pending-worktree-failure.ts";
import { formatAutobranchCommandDetails } from "./shared.ts";

export function formatPendingWorktreeError(error: PendingWorktreeError): string {
	const facts = pendingWorktreeFailureFacts(error.kind);
	const details = formatAutobranchCommandDetails(error.result);
	return `${facts.plainMessage}\n${details}`;
}
