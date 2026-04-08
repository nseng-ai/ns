NONSLOP := "/Users/schrockn/code/githubs/nonslop"

install-nonslop mode="local":
    #!/usr/bin/env bash
    set -euo pipefail
    NONSLOP="{{ NONSLOP }}"
    if [ "{{ mode }}" = "local" ]; then
        # Editable-install nonslop (single package, no workspace members)
        uv pip install -e "$NONSLOP"

        # Link public skills (those in nonslop's skills/ directory)
        for skill in "$NONSLOP"/skills/*/; do
            name=$(basename "$skill")
            ln -sfn "$NONSLOP/.agents/skills/$name" .agents/skills/"$name"
            ln -sfn "../../.agents/skills/$name" .claude/skills/"$name"
            for path in ".agents/skills/$name" ".claude/skills/$name"; do
                grep -qxF "$path" .git/info/exclude 2>/dev/null || echo "$path" >> .git/info/exclude
            done
        done

        echo "nonslop installed locally (editable) with skills linked"

    elif [ "{{ mode }}" = "clear" ]; then
        uv pip uninstall nonslop 2>/dev/null || true

        for link in .agents/skills/* .claude/skills/*; do
            [ -L "$link" ] || continue
            target=$(readlink "$link")
            if [[ "$target" == *"$NONSLOP"* ]]; then
                name=$(basename "$link")
                rm -f "$link"
                sed -i '' "/^\.agents\/skills\/$name$/d" .git/info/exclude 2>/dev/null || true
                sed -i '' "/^\.claude\/skills\/$name$/d" .git/info/exclude 2>/dev/null || true
            fi
        done

        echo "nonslop uninstalled, reverted to clean state"
    else
        echo "Usage: just install-nonslop [local|clear]" >&2
        exit 1
    fi
