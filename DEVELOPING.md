# Develop ns

This guide contains setup instructions for ns contributors and maintainers.

## Develop ns while using ns globally

A maintainer can use the global ns Pi packages in other projects. The maintainer can also load package code from an active ns worktree.

The two sources must not load together. If they load together, Pi reports conflicting tool registrations.

### Configure the ns development environment

The repository `.envrc` optionally sources `~/.config/ns/dev.env`. This untracked file contains machine-local settings for ns development.

Create the file and select a dedicated Pi profile:

```sh
mkdir -p "$HOME/.config/ns"
printf '%s\n' 'export PI_CODING_AGENT_DIR="$HOME/.pi/agent-ns-dev"' > "$HOME/.config/ns/dev.env"
```

The dedicated profile must omit global registrations for these packages:

- `pi-ns-objectives`
- `pi-ns-handoffs`
- `pi-ns-branch-context`
- `pi-ns-herdr`
- `pi-ns-flow`

The project `.pi/settings.json` registers these five packages from the active worktree. Keep this list synchronized with those project registrations.

Contributors who do not globally register ns do not need the dedicated profile. Their default profile does not conflict with the project registrations.

### Verify the profile

List the packages in the dedicated profile:

```sh
PI_CODING_AGENT_DIR="$HOME/.pi/agent-ns-dev" pi list
```

The user package list must not contain the five packages above.

Start a new Pi process after you change `PI_CODING_AGENT_DIR`. An existing process already selected its profile.

### Understand the limitation

Pi identifies a local package by its resolved absolute path. The canonical checkout and an active Slot are different package identities.

Therefore, project settings cannot replace the global registrations without a maintainer-specific path. Such project settings would add machine-specific configuration to the repository.

`PI_CODING_AGENT_DIR` avoids that machine-specific project configuration. However, it selects the complete Pi profile, not only the package registrations.

The dedicated profile also separates the settings, authentication, sessions, trust state, and other user resources. This broader separation is an accepted limitation.

Prefer a narrower, portable project override if Pi adds one.
