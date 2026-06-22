import {
  checkpoint,
  defineExtension,
  failed,
  ok,
  pendingWorktree,
  textGeneration,
  type SdkPendingWorktreeSnapshot,
  z,
} from "@sdl/sdl/sdk";

const CP_COMMAND_DESCRIPTION = `Create a checkpoint commit for the current diff.

The command captures the pending worktree, refuses main/master, refuses clean worktrees, asks the configured text-generation model for a validated [cp] commit message, stages all changes, commits with that message, and prints the resulting commit summary plus checkpoint message.

Use --dry-run to preview the model-authored checkpoint message without running git add, git commit, or git log.

Environment:
  ${textGeneration.CHECKPOINT_MODEL_ENV}  Model reference for generated checkpoint messages. Defaults to ${textGeneration.DEFAULT_CHECKPOINT_MODEL_REF}. Falls back to ${textGeneration.LEGACY_CHECKPOINT_MODEL_ENV} when unset.`;

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
        const loaded = await pendingWorktree.loadSnapshot(ctx);
        if (!loaded.ok) {
          return failed(pendingWorktree.formatError(loaded.error), 2);
        }

        const snapshot = loaded.snapshot;
        if (snapshot.branch === "main" || snapshot.branch === "master") {
          return failed(`Refusing to create checkpoint commit on trunk branch: ${snapshot.branch}`, 1);
        }
        if (snapshot.isClean) {
          return failed("Working tree is clean; nothing to checkpoint.", 1);
        }

        const prepared = await checkpoint.prepareMessage({
          status: snapshot.status,
          diff: snapshot.diff,
          textGenerator: ctx.textGenerator,
          modelRef: textGeneration.selectCheckpointModelRef(ctx.env),
        });
        if (!prepared.ok) {
          return failed(prepared.error, 2);
        }

        if (request.dryRun) {
          return ok(formatDryRunMessage(snapshot, prepared.message));
        }

        const committed = await checkpoint.createCommit(ctx, prepared.message);
        if ("error" in committed) {
          return failed(committed.error, 2);
        }

        return ok(`${committed.summary}\n${prepared.message}`);
      },
    },
  ],
});

function formatDryRunMessage(snapshot: SdkPendingWorktreeSnapshot, message: string): string {
  return `Dry run: would create checkpoint commit on ${snapshot.branch}\n\n${message}`;
}
