# Live setup procedure findings recorded

## Summary

The first real credential configuration surfaced setup facts that must survive
into the reusable setup skill and corrected one speculative README claim:

- **Existing GitHub App key generation is UI-only.** GitHub documents generating
  additional private keys from the App settings page and allows multiple active
  keys for rotation; no documented REST or GraphQL endpoint generates a new key
  for an existing App. The App Manifest flow is a separate initial-creation path:
  converting its one-time code returns the new App's PEM once, but it does not
  rotate an existing App. Sources: GitHub's official
  [private-key management](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps)
  and
  [App Manifest](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest)
  documentation.
- **Vercel sensitive variables are replacement-only for namespace changes.** A
  sensitive value cannot be read back, and Vercel does not permit renaming its
  key. The safe migration is to generate replacement secret material, stream it
  into the new sensitive key without printing it, keep the old key through
  verification, then remove it. Source: Vercel's official
  [sensitive environment variable](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
  documentation and the live `ns-dispatch` variable inventory.
- **Validate identity before deployment.** A newly generated PEM can be checked
  locally without displaying it, then used for read-only App authentication and
  an installation token restricted to the intended private repository and
  `contents: read`. This caught-path should precede any endpoint deployment.
- **OIDC trust values come from the token, not a naming convention.** Pull the
  Development environment into an ignored, owner-readable `.env.local`, decode
  only `iss`, `aud`, `owner_id`, `project_id`, and `environment`, compare them to
  linked-project identity, and never print or persist the token itself.
- **`vercel env pull` may broaden ignore rules.** In this repository it appended
  `.env*` even though `.env.local` was already ignored. The broad rule was
  removed so intentional env templates are not silently hidden; setup automation
  should preserve the repository's narrower ignore policy.
- **A Sandbox probe SHA must exist on the remote.** A local-only HEAD is not a
  valid private-git checkout target. Push through the authorized branch workflow
  first or select an already reachable exact remote SHA.

The canonical README's Setup section now reflects these proven steps instead of
claiming that an existing App key can be generated directly into Vercel.

## Objective Impact

These findings reduce the risk that the later setup skill leaks a PEM, guesses
OIDC trust values, hides env templates, or emits a probe that cannot clone its
revision. They do not change the credentials design or roadmap order: the current
slice still proceeds to endpoint deployment and the controlled billable Sandbox
probe before the skill is authored.

The setup-skill roadmap row now names these findings as required source material.
No secret value, OIDC token, PEM content, or generated mint secret is recorded in
Objective state.

## Follow-Ups

- Distill these steps into the reusable setup skill only after the endpoint and
  Sandbox probe complete the steel-thread evidence.
- Consider the App Manifest flow for future fresh-App automation; do not treat it
  as a rotation mechanism for the existing `ns-dispatch` App.
- Remove the old-prefix Vercel variables, revoke the superseded App key, and
  delete the downloaded PEM only after replacement verification succeeds.
