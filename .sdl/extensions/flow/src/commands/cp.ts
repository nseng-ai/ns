import { defineExtension, failed, ok, z } from "@sdl/sdl/sdk";
import {
  CHECKPOINT_MODEL_ENV,
  DEFAULT_CHECKPOINT_MODEL_REF,
  LEGACY_CHECKPOINT_MODEL_ENV,
  selectCheckpointModelRef,
} from "../shared/text-generation.ts";
import { prepareCheckpointMessage } from "../shared/text-helpers.ts";
import {
  createCommitWithPreparedMessage,
  formatPendingWorktreeError,
  loadFlowPendingWorktreeSnapshot,
  type PendingWorktreeSnapshot,
} from "../shared/worktree.ts";

const CP_COMMAND_DESCRIPTION = `Create a checkpoint commit for the current diff.

The command captures the pending worktree, refuses main/master, refuses clean worktrees, asks the configured text-generation model for a validated [cp] commit message, stages all changes, commits with that message, and prints the resulting commit summary plus checkpoint message.

Use --dry-run to preview the model-authored checkpoint message without running git add, git commit, or git log.

Environment:
  ${CHECKPOINT_MODEL_ENV}  Model reference for generated checkpoint messages. Defaults to ${DEFAULT_CHECKPOINT_MODEL_REF}. Falls back to ${LEGACY_CHECKPOINT_MODEL_ENV} when unset.`;

const cpRequestSchema = z.object({
  dryRun: z.boolean().default(false).describe("Preview the checkpoint message without staging or committing."),
});

type CpRequest = z.output<typeof cpRequestSchema>;

export default defineExtension({
  commands: [
    {
      name: "cp",
      summary: "Create a checkpoint commit for the current diff.",
      description: CP_COMMAND_DESCRIPTION,
      schema: cpRequestSchema,
      async run(ctx, request: CpRequest) {
        const loaded = await loadFlowPendingWorktreeSnapshot(ctx);
        if (!loaded.ok) {
          return failed(formatPendingWorktreeError(loaded.error), 2);
        }

        const snapshot = loaded.snapshot;
        if (snapshot.branch === "main" || snapshot.branch === "master") {
          return failed(`Refusing to create checkpoint commit on trunk branch: ${snapshot.branch}`, 1);
        }
        if (snapshot.clean) {
          return failed("Working tree is clean; nothing to checkpoint.", 1);
        }

        const prepared = await prepareCheckpointMessage({
          status: snapshot.status,
          diff: snapshot.diff,
          textGenerator: ctx.textGenerator,
          modelRef: selectCheckpointModelRef(ctx.env),
        });
        if (!prepared.ok) {
          return failed(prepared.error, 2);
        }

        if (request.dryRun) {
          return ok(formatDryRunMessage(snapshot, prepared.message));
        }

        const committed = await createCommitWithPreparedMessage(ctx, prepared.message);
        if ("error" in committed) {
          return failed(committed.error, 2);
        }

        return ok(`${committed.summary}\n${prepared.message}`);
      },
    },
  ],
});

function formatDryRunMessage(snapshot: PendingWorktreeSnapshot, message: string): string {
  return `Dry run: would create checkpoint commit on ${snapshot.branch}\n\n${message}`;
}
