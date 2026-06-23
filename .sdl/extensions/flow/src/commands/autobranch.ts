import {
  runDirtyAutobranchFlow,
  type ParsedAutobranchArgs,
} from "@sdl/autobranch/dirty-worktree";
import { DEFAULT_FAST_MODEL_REF, SLUG_MODEL_ENV } from "@sdl/core/model-slug";
import { defineExtension, failed, ok, z, type SdlExtensionApi } from "@sdl/sdl/sdk";

import { prepareCheckpointMessage } from "../shared/text-helpers.ts";
import {
  CHECKPOINT_MODEL_ENV,
  DEFAULT_CHECKPOINT_MODEL_REF,
  LEGACY_CHECKPOINT_MODEL_ENV,
  selectCheckpointModelRef,
} from "../shared/text-generation.ts";
import {
  createCommitWithPreparedMessage,
  execExtensionCommand,
  formatPendingWorktreeError,
  loadFlowPendingWorktreeSnapshot,
  type PendingWorktreeSnapshot,
} from "../shared/worktree.ts";

const AUTOBRANCH_DESCRIPTION = `Create a Graphite branch using \`gt create\` from dirty worktree changes.

This command requires pending worktree changes. It stashes pending changes, creates a Graphite branch, restores the stash, and creates a checkpoint commit.

If the worktree is clean, use \`sdl flow branch-latest-commit\` to move the latest eligible unpushed commit to a new Graphite child branch.

Environment:
  ${SLUG_MODEL_ENV}  Model reference for generated branch slugs. Defaults to ${DEFAULT_FAST_MODEL_REF}.
  ${CHECKPOINT_MODEL_ENV}  Model reference for generated checkpoint messages. Defaults to ${DEFAULT_CHECKPOINT_MODEL_REF}. Falls back to ${LEGACY_CHECKPOINT_MODEL_ENV} when unset.`;

const autobranchRequestSchema = z.object({
  slug: z
    .string()
    .optional()
    .describe("Branch slug to use instead of deriving one from the worktree."),
});

type AutobranchRequest = z.output<typeof autobranchRequestSchema>;

export default defineExtension({
  commands: [
    {
      name: "autobranch",
      summary: "Create a Graphite branch from dirty worktree changes.",
      description: AUTOBRANCH_DESCRIPTION,
      schema: autobranchRequestSchema,
      async run(ctx, request: AutobranchRequest) {
        const args: ParsedAutobranchArgs = request.slug === undefined ? {} : { slug: request.slug };
        const result = await createAutobranchCheckpointFlow(ctx, args);
        if (!result.ok) {
          return failed(result.error.trimEnd(), 1);
        }
        for (const warning of result.warnings) {
          ctx.stderr?.(`${warning.trimEnd()}\n`);
        }
        return ok(result.summary.trimEnd());
      },
    },
  ],
});

async function createAutobranchCheckpointFlow(ctx: SdlExtensionApi, args: ParsedAutobranchArgs) {
  const loaded = await loadFlowPendingWorktreeSnapshot(ctx);
  if (!loaded.ok) {
    return { ok: false as const, error: formatPendingWorktreeError(loaded.error) };
  }

  const snapshot = loaded.snapshot;
  if (snapshot.clean) {
    return {
      ok: false as const,
      error:
        "Working tree is clean; use `sdl flow branch-latest-commit` to move the latest eligible unpushed commit to a new Graphite child branch.",
    };
  }

  return runDirtyAutobranchFlow({
    cwd: snapshot.root,
    args,
    snapshot,
    exec: (command, commandArgs, _cwd, timeout) => execExtensionCommand(ctx, command, commandArgs, timeout),
    prepareCheckpointMessage: (pendingSnapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">) =>
      prepareCheckpointMessage({
        status: pendingSnapshot.status,
        diff: pendingSnapshot.diff,
        textGenerator: ctx.textGenerator,
        modelRef: selectCheckpointModelRef(ctx.env),
      }),
    commitPreparedCheckpointMessage: (message) => createCommitWithPreparedMessage(ctx, message),
  });
}
