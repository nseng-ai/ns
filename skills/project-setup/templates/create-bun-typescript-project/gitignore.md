# .gitignore template

**Target path:** `.gitignore`

No placeholders -- use as-is. Note there is no `dist/` line: Bun runs the
TypeScript source directly, so nothing is built. Commit `bun.lock`.

## Template

```gitignore
# Dependencies
node_modules/

# Bun
.bun/

# Logs
*.log

# Coverage
coverage/

# OS
.DS_Store

# Local / env
.env
.env.*
!.env.example
```
