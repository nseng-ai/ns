# Vercel KB: Using Private GitHub Repositories with Vercel Sandbox

External-source capture, fetched 2026-07-13 (UTC) from
<https://vercel.com/kb/guide/sandbox-private-github-repositories>. This is
vendor guidance, recorded because it independently validates the settled
credentials design (`references/credentials-design.md`): Vercel itself
recommends GitHub App installation tokens for platform use, with the exact
`x-access-token` git-credential shape and `Sandbox.create` source pattern
we implement. Where this guide and our design differ, our design is
stricter (see "Relation to the ns design" at the end). The canonical
user-facing contract remains `references/README-draft.md`; this note never
overrides it.

## Prerequisites (per the guide)

- Active Vercel account
- `@vercel/sandbox` SDK installed
- Access permissions to a private GitHub repository

## Authentication methods

The guide covers three ways to authenticate a private-repo clone inside a
Sandbox. All three feed the same `Sandbox.create` source shape:

```javascript
source: {
  url: 'https://github.com/your-org/private-repo.git',
  type: 'git',
  username: 'x-access-token',
  password: token,
}
```

### 1. Fine-grained personal access token (recommended for individuals)

Setup: GitHub Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token; set a name and expiration,
select the resource owner, choose "Selected repositories" for the private
repo, and grant `Contents: Read` plus `Metadata: Read`.

```javascript
import { Sandbox } from '@vercel/sandbox';
import ms from 'ms';

async function main() {
  const sandbox = await Sandbox.create({
    source: {
      url: 'https://github.com/your-org/private-repo.git',
      type: 'git',
      username: 'x-access-token',
      password: process.env.GIT_ACCESS_TOKEN!,
    },
    timeout: ms('5m'),
    ports: [3000],
  });

  const result = await sandbox.runCommand('echo', ['Hello sandbox!']);
  console.log(`Message: ${await result.stdout()}`);
}

main().catch(console.error);
```

### 2. GitHub App installation token (recommended for platforms)

Advantages the guide names: "Short-lived tokens (1 hour) reduce security
risk"; users grant access through GitHub's familiar OAuth/installation
flow; installation-scoped access carries elevated rate limits versus
personal tokens.

```javascript
import { App } from '@octokit/app';
import { Sandbox } from '@vercel/sandbox';

const app = new App({
  appId: process.env.GITHUB_APP_ID!,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
});

async function createSandboxForUser(installationId: number, repoUrl: string) {
  const octokit = await app.getInstallationOctokit(installationId);
  const { token } = await octokit.rest.apps.createInstallationAccessToken({
    installation_id: installationId,
  });

  const sandbox = await Sandbox.create({
    source: {
      url: repoUrl,
      type: 'git',
      username: 'x-access-token',
      password: token,
    },
    timeout: 5 * 60 * 1000,
    ports: [3000],
  });

  return sandbox;
}
```

### 3. Classic personal access token

GitHub Settings → Developer settings → Personal access tokens → Tokens
(classic), with `repo` scope. Works like the fine-grained token but with
broader, less granular permissions.

## Running commands in the sandbox (guide example)

```javascript
const sandbox = await Sandbox.create({
  source: {
    url: 'https://github.com/your-org/private-repo.git',
    type: 'git',
    username: 'x-access-token',
    password: token,
  },
  timeout: 5 * 60 * 1000,
  ports: [3000],
});

// Install dependencies
const install = await sandbox.runCommand({
  cmd: 'npm',
  args: ['install'],
  stdout: process.stdout,
  stderr: process.stderr,
});

if (install.exitCode !== 0) {
  throw new Error('Installation failed');
}

// Start dev server in background
await sandbox.runCommand({
  cmd: 'npm',
  args: ['run', 'dev'],
  detached: true,
});

console.log(`Sandbox running at: ${sandbox.domain(3000)}`);
```

## Multi-tenant platform pattern (guide's recommended flow)

1. Create a GitHub App with `Contents: Read` permission.
2. Users install the app via GitHub's installation flow.
3. Store the installation ID upon completion.
4. Generate a fresh installation token per sandbox creation.
5. Pass the token to `Sandbox.create()`.

## Security recommendations (guide's list)

- "Never log or store tokens in plain text."
- Use environment variables exclusively.
- Prefer short-lived tokens over persistent personal access tokens.
- Grant minimal permissions (read-only is sufficient for cloning).
- Rotate personal access tokens regularly.

## Relation to the ns design

- **Validates**: GitHub App installation tokens as the platform-grade
  mechanism; 1-hour TTL as the risk reducer; `x-access-token:<TOKEN>`
  credential shape; fresh token per sandbox creation; minimal-permission
  scoping.
- **Where ns is stricter**: the guide mints tokens in the same process
  that creates the sandbox, holding the App private key in the caller's
  environment. The ns design isolates minting behind the deployed
  `/api/mint` endpoint (OIDC-verified callers, shared-secret landing
  path v1), so the App private key lives only in the dispatch project's
  Vercel environment, never in local or sandbox environments.
- **Where ns differs in scope**: our clone tokens are minted per run and
  scoped at mint time to a single repository; the guide's example mints
  installation-wide tokens. Our write scopes (`contents: write`,
  `pull_requests: write`, `issues: write`) exceed the guide's read-only
  clone case because dispatched agents push branches and open PRs — see
  `references/credentials-design.md` §1.
- **Composition gap the guide does not cover**: a separate authenticated
  mint boundary between token creation and sandbox consumption. That part
  of the ns design is original; the README-draft documents it.
