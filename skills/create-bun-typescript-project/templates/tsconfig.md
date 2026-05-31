# tsconfig.json template

**Target path:** `tsconfig.json`

No placeholders -- use as-is.

Strict ESM configured for Bun: `module: Preserve` + `moduleResolution: bundler`
let Bun run the `.ts` source directly, `allowImportingTsExtensions` permits the
explicit `.ts` import specifiers Bun wants, `noEmit` keeps `tsc` a pure
typechecker, and `noUncheckedIndexedAccess` / `noImplicitOverride` /
`verbatimModuleSyntax` raise the safety floor.

## Template

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "moduleResolution": "bundler",
    "allowJs": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noPropertyAccessFromIndexSignature": false,
    "types": ["bun", "node"]
  },
  "include": ["src", "tests"],
  "exclude": ["node_modules"]
}
```
