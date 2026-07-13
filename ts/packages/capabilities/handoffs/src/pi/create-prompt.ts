import { HANDOFF_KEY_SUFFIX, HANDOFF_NAMESPACE } from "../api/index.ts";

export const CREATE_HANDOFF_FALLBACK = `Use the handoff-create workflow to create a concise, directed Markdown handoff for a specific future continuation. Treat Branch Memory as the storage command, not the public user model.

Storage contract:
- Namespace: \`${HANDOFF_NAMESPACE}\`
- Entry key shape: \`<semantic-slug>${HANDOFF_KEY_SUFFIX}\`
- Compose the final Markdown handoff content first, then derive \`<semantic-slug>\` from that final content unless the user provided an explicit specific slug/key.
- Store final Markdown with \`ns handoff create --slug <semantic-slug> --branch <branch> --file /dev/stdin\`; do not create a temporary artifact file.
- If \`ns handoff create\` is unavailable, the Branch Memory recovery path is \`brmem check <semantic-slug>${HANDOFF_KEY_SUFFIX} --namespace ${HANDOFF_NAMESPACE} --branch <branch>\` followed by \`brmem put <semantic-slug>${HANDOFF_KEY_SUFFIX} --namespace ${HANDOFF_NAMESPACE} --branch <branch> --file /dev/stdin\`.
- Every artifact must contain a \`## Investigation Sources\` section with the exact source session id/log supplied by the invoking prompt (or its explicit unavailable value) plus concrete paths to other relevant session logs and files. Store pointers, not log bodies, and never invent a path.

If review or editing is needed before creating, iterate in chat, structured UI, or another explicit surface; do not use a hidden temporary Markdown file as the review mechanism.

Confirm the current branch before writing unless the user explicitly names a branch. Use a specific semantic slug based on the final artifact body, check for an existing artifact before writing, report the created handoff first, and include branch, namespace, entry, locator/ref, and commit as technical evidence.`;
