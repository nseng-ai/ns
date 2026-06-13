---
name: ts-morph-refactor
description: Perform TypeScript refactoring using ts-morph AST manipulation. Use for renaming symbols, moving declarations, propagating interface changes, adding methods to implementations, renaming parameters, or setting return types across the codebase. Requires ts-morph package.
---

# TypeScript Refactoring with ts-morph

Perform safe, AST-based TypeScript refactoring operations using executable scripts. All scripts work across the entire codebase, following type relationships and updating all references.

## Installation

Install this skill's self-contained dependencies in the skill directory. Do not add `ts-morph` to the host project just to use these wrappers.

```bash
pnpm install --dir .agents/skills/ts-morph-refactor --ignore-workspace
```

The examples below are intended to be run from the target repository root. Because `pnpm --dir` executes with the skill directory as the working directory, pass target project paths as absolute paths such as `"$PWD/tsconfig.json"` and `"$PWD/src/file.ts"`.

## Available Scripts

### rename-symbol.ts

Rename a symbol (function, variable, class, interface, type) across all files. Uses ts-morph's semantic rename which updates all references.

**Usage:**
```bash
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/rename-symbol.ts <tsconfig> <file> <kind> <old-name> <new-name>
```

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `tsconfig` | Yes | Path to tsconfig.json (e.g., `"$PWD/tsconfig.json"`) |
| `file` | Yes | Source file containing the declaration (e.g., `"$PWD/src/utils.ts"`) |
| `kind` | Yes | Symbol kind: `function`, `variable`, `class`, `interface`, `type` |
| `old-name` | Yes | Current symbol name |
| `new-name` | Yes | New symbol name |

**Example:**
```bash
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/rename-symbol.ts "$PWD/tsconfig.json" "$PWD/src/services/user.ts" class UserService AccountService
```

---

### move-declaration.ts

Move a declaration from one file to another, updating all imports across the codebase.

**Usage:**
```bash
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/move-declaration.ts <tsconfig> <source-file> <target-file> <kind> <name>
```

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `tsconfig` | Yes | Path to tsconfig.json |
| `source-file` | Yes | File containing the declaration |
| `target-file` | Yes | Destination file (created if doesn't exist) |
| `kind` | Yes | Declaration kind: `function`, `variable`, `class`, `interface`, `type` |
| `name` | Yes | Name of declaration to move |

**Example:**
```bash
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/move-declaration.ts "$PWD/tsconfig.json" "$PWD/src/utils.ts" "$PWD/src/helpers/string-utils.ts" function formatDate
```

---

### propagate-interface.ts

Propagate interface changes to all implementing classes. Adds missing properties and methods from an interface to all classes that implement it.

**Usage:**
```bash
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/propagate-interface.ts <tsconfig> <interface-name> [--dry-run]
```

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `tsconfig` | Yes | Path to tsconfig.json |
| `interface-name` | Yes | Name of the interface to propagate |
| `--dry-run` | No | Show what would be changed without making changes |

**Example:**
```bash
# Preview changes
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/propagate-interface.ts "$PWD/tsconfig.json" NodeContext --dry-run

# Apply changes
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/propagate-interface.ts "$PWD/tsconfig.json" NodeContext
```

---

### add-method-to-implementations.ts

Add a method stub to all classes that implement or extend a given interface/class.

**Usage:**
```bash
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/add-method-to-implementations.ts <tsconfig> <base-type> <method-name> <return-type> [params...] [--abstract] [--async]
```

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `tsconfig` | Yes | Path to tsconfig.json |
| `base-type` | Yes | Interface or class name that implementations extend/implement |
| `method-name` | Yes | Name of the method to add |
| `return-type` | Yes | Return type of the method |
| `params` | No | Parameters as `name:type` pairs (e.g., `request:Request`) |
| `--abstract` | No | Add as abstract method (for abstract classes only) |
| `--async` | No | Make the method async |

**Examples:**
```bash
# Add cleanup() to all ExecutableNode subclasses
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/add-method-to-implementations.ts "$PWD/tsconfig.json" ExecutableNode cleanup void

# Add async handle() method with parameters
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/add-method-to-implementations.ts "$PWD/tsconfig.json" Handler handle "Promise<Response>" request:Request context:Context --async
```

---

### rename-parameter.ts

Rename a parameter across all methods/functions that match a given signature pattern. Works across the entire codebase.

**Usage:**
```bash
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/rename-parameter.ts <tsconfig> <method-name> <old-param> <new-param> [options]
```

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `tsconfig` | Yes | Path to tsconfig.json |
| `method-name` | Yes | Name of the method/function (use `*` for all methods) |
| `old-param` | Yes | Current parameter name to rename |
| `new-param` | Yes | New parameter name |
| `--class=Name` | No | Only methods in classes extending/implementing this class |
| `--interface=Name` | No | Only methods in classes implementing this interface |
| `--param-type=Type` | No | Only parameters with this type |

**Examples:**
```bash
# Rename ctx to context in all execute() methods of ExecutableNode subclasses
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/rename-parameter.ts "$PWD/tsconfig.json" execute ctx context --class=ExecutableNode

# Rename c to context in all Handler implementations
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/rename-parameter.ts "$PWD/tsconfig.json" handle c context --interface=Handler

# Rename all Request-typed parameters named req to request
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/rename-parameter.ts "$PWD/tsconfig.json" "*" req request --param-type=Request
```

---

### set-return-type.ts

Add or update return type for all methods/functions matching criteria across the codebase.

**Usage:**
```bash
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/set-return-type.ts <tsconfig> <method-name> <return-type> [options]
```

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `tsconfig` | Yes | Path to tsconfig.json |
| `method-name` | Yes | Name of the method/function (use `*` for all) |
| `return-type` | Yes | New return type to set |
| `--class=Name` | No | Only methods in classes extending/implementing this class |
| `--interface=Name` | No | Only methods in classes implementing this interface |
| `--current-type=Type` | No | Only update methods with this current return type (use `none` for untyped) |

**Examples:**
```bash
# Ensure all execute() methods return Promise<NodeExecution>
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/set-return-type.ts "$PWD/tsconfig.json" execute "Promise<NodeExecution>" --class=ExecutableNode

# Set return type on all Handler.handle() methods
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/set-return-type.ts "$PWD/tsconfig.json" handle "Promise<Response>" --interface=Handler

# Add return type to all currently untyped processData functions
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/set-return-type.ts "$PWD/tsconfig.json" processData Result --current-type=none
```

---

### organize-imports.ts

Organize imports across files: remove unused, sort, and merge.

**Usage:**
```bash
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/organize-imports.ts <tsconfig> [glob-pattern]
```

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `tsconfig` | Yes | Path to tsconfig.json |
| `glob-pattern` | No | File pattern to process (default: `src/**/*.ts`) |

**Example:**
```bash
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/organize-imports.ts "$PWD/tsconfig.json" "$PWD/apps/api/src/**/*.ts"
```

---

### extract-function.ts

Extract code from a function into a new function in the same file.

**Usage:**
```bash
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/extract-function.ts <tsconfig> <file> <source-function> <new-function> <start-line> <end-line> [params...]
```

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `tsconfig` | Yes | Path to tsconfig.json |
| `file` | Yes | Source file path |
| `source-function` | Yes | Name of function containing code to extract |
| `new-function` | Yes | Name for the new extracted function |
| `start-line` | Yes | Start line number of code to extract (1-indexed) |
| `end-line` | Yes | End line number of code to extract (1-indexed) |
| `params` | No | Parameters for extracted function as `name:type` pairs |

**Example:**
```bash
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/extract-function.ts "$PWD/tsconfig.json" "$PWD/src/handlers.ts" processRequest validateInput 15 25 data:RequestData config:Config
```

---

### add-interface-property.ts

Add or modify a property on an interface.

**Usage:**
```bash
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/add-interface-property.ts <tsconfig> <file> <interface> <property> <type> [--optional] [--readonly]
```

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `tsconfig` | Yes | Path to tsconfig.json |
| `file` | Yes | File containing the interface |
| `interface` | Yes | Interface name |
| `property` | Yes | Property name to add/modify |
| `type` | Yes | TypeScript type for the property |
| `--optional` | No | Make property optional (`?`) |
| `--readonly` | No | Make property readonly |

**Example:**
```bash
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/add-interface-property.ts "$PWD/tsconfig.json" "$PWD/src/types.ts" UserConfig theme "\"light\" | \"dark\"" --optional
```

---

## Workflow

1. **Analyze** - Understand what needs to be refactored
2. **Preview** - Use `--dry-run` where available to preview changes
3. **Execute** - Run the appropriate script with correct parameters
4. **Verify** - Run the target project's type checks to ensure no type errors
5. **Review** - Check git diff to verify changes are correct

## Codebase-Wide Refactoring Examples

**Rename a class and update all references:**
```bash
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/rename-symbol.ts "$PWD/tsconfig.json" "$PWD/src/services/user.ts" class UserService AccountService
```

**Add a new required method to all node implementations:**
```bash
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/add-method-to-implementations.ts "$PWD/tsconfig.json" ExecutableNode validate "ValidationResult" --async
```

**Standardize parameter naming across all handlers:**
```bash
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/rename-parameter.ts "$PWD/tsconfig.json" execute ctx context --class=ExecutableNode
```

**After adding a property to an interface, propagate to all implementations:**
```bash
# First, add the property to the interface
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/add-interface-property.ts "$PWD/tsconfig.json" "$PWD/packages/types/src/node.ts" NodeContext logger Logger

# Then propagate to all implementing classes
pnpm --dir .agents/skills/ts-morph-refactor exec tsx scripts/propagate-interface.ts "$PWD/tsconfig.json" NodeContext
```

## Error Handling

Scripts will exit with:
- **Exit 0**: Success, changes saved
- **Exit 1**: Error (missing parameters, symbol not found, etc.)

All scripts provide helpful error messages listing available symbols when a target is not found.

## Limitations

- Scripts modify files directly - inspect git diff after every run
- Semantic renames follow TypeScript references; they do not reliably catch string-literal references, dynamic property access, docs, JSON, or other non-TS references
- Complex refactorings may need multiple script invocations
- Some edge cases may require manual fixes after script execution
- `extract-function.ts` is single-file only (extraction is inherently local)
