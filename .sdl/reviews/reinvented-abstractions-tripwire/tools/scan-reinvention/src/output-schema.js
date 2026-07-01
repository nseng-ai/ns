export const reinventionKinds = [
    "subprocess",
    "interactive-confirm",
    "exact-optional-spread",
    "xdg-path",
    "hand-rolled-table",
    "raw-git",
    "machine-envelope-literal",
    "command-failure-format",
    "escape-regex",
    "osc8-hyperlink",
    "manual-truncation",
    "frontmatter-split",
];
export function manifestRefForKind(kind) {
    return `references/canonicals/${kind}.md`;
}
