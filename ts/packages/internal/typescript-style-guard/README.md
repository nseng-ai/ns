# @internal/typescript-style-guard

Consumer-side, tested tooling that implements the repo's TypeScript style guard:
source-rule scanners, package-metadata/tier/subpackage/exports conformance
collectors, and the topology-circle analyzers. It exists to operate this repo,
not to ship as part of ns-the-product, and is consumed as a test/dev dependency
by the style-guard suite in `@ns/core`
(`ts/packages/infra/core/test/typescript-style-guard/`).

Per [`docs/conventions/platform-and-consumer.md`](../../../../docs/conventions/platform-and-consumer.md),
this is a middle-rung **internal** package: package-grade repo-operating machinery
sitting between `.ns/*` prototypes and platform packages. It carries an explicit
promotion path — should the subpackage-declaration/`exports` conformance machinery
(`subpackage-conformance.ts`, `exports-subpackage-conformance.ts`, and the
`ns.subpackages` model they enforce) need to graduate into platform surface, this
package is the extraction point. Until then it stays private, never-published, and
has no outside runtime dependents (enforced by `NS_TS_INTERNAL_SPACE_ADMISSION`).
