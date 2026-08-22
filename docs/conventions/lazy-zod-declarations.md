# Lazy Zod declarations

Module-scope Zod schemas perform project-owned schema construction as soon as their module is evaluated. Use `zDecl` from `@nseng-ai/foundation/zdecl` for production schemas that should instead be constructed on first use and then shared.

## Declare and use a schema

```ts
import { zDecl } from "@nseng-ai/foundation/zdecl";
import { z } from "zod";

export const widgetDecl = zDecl(() =>
	z.strictObject({
		name: z.string().min(1),
	}),
);

export type Widget = z.output<typeof widgetDecl.schema>;

const parsed = widgetDecl.parse(input);
const result = widgetDecl.safeParse(input);
```

Name declaration wrappers `<noun>Decl`, not `<noun>Schema`. The first access through `.schema`, `.parse(...)`, or `.safeParse(...)` constructs the schema. All later accesses reuse that exact schema instance.

A declaration initializer must be a deterministic, zero-argument function. It must not depend on caller data, the current working directory, environment variables, configuration, clocks, or the filesystem. Use an ordinary explicit factory for contextual or parameterized schema construction.

## Compose declarations

Access `.schema` inside an outer declaration initializer:

```ts
const widgetListDecl = zDecl(() =>
	z.strictObject({
		widgets: z.array(widgetDecl.schema),
	}),
);
```

Importing this module constructs neither schema. First use of `widgetListDecl` constructs the outer schema and, while composing it, initializes `widgetDecl`.

## Supply concrete schemas at boundaries

`ZodDeclaration` is an explicit wrapper, not a `ZodType`. APIs that require a concrete Zod schema must receive `.schema`:

```ts
const command = defineCommand({
	schema: requestDecl.schema,
	resultSchema: resultDecl.schema,
	// ...
});
```

Do not add compatibility exports such as `const widgetSchema = widgetDecl.schema`; module-scope access defeats laziness. Do not use a proxy or forward Zod's complete method surface. Operations other than direct `.parse(...)` and `.safeParse(...)` remain available through `.schema`.

## Limits

`zDecl` defers project-owned schema construction and nested composition. A schema module's static runtime import of `z` still loads Zod when the module is evaluated. Fully deferring Zod would require a different asynchronous module boundary.

This convention does not claim that existing repository schemas are migrated. There is no repository-wide style guard or checked-in debt baseline for eager schemas.
