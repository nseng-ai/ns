// Validated example spec: reproduces the sdl-extension-architecture report.
// This is ALL the agent authors per run — tier map + editorial judgement.
export default {
  repo: "sdl-tools",
  targetName: "the SDL Extension Architecture target",
  date: "2026-06-28",
  intro:
    `The actual runtime dependency graph extracted from <span class="font-mono text-sm">package.json</span> files, scored against the
     end-state in <span class="font-mono text-sm">.sdl/objectives/sdl-extension-architecture</span> (ADR 0009 · 0012 · 0016).
     The question is not "find refactors" — it is <em>how well are we tracking toward the architecture we said we wanted.</em>`,

  // The one mechanical-looking input that still needs the target model: tier per package.
  // Seed it with `--tiers-template`, then re-tag sdk/host/cons/util from the model.
  tiers: {
    "@sdl/core": "infra", "@sdl/clinkr": "infra", "@sdl/graphite": "infra",
    "@sdl/brmem": "infra", "@sdl/cmux": "infra",
    "@sdl/domain-primitives-transitional": "trans",
    "@sdl/sdl": "sdk", "sdl-sdk": "sdk", "@sdl/capability-kit": "sdk",
    "@sdl/autobranch": "util", "@sdl/worktree-status": "util",
    "sdl-flow": "cap", "@sdl/handoff": "cap", "@sdl/objective": "cap",
    "@sdl/branch-context": "cap", "@sdl/plans": "cap", "@sdl/pr-address": "cap",
    "@sdl/slot": "cap", "@sdl/roaster": "cap", "@sdl/aretro": "cap",
    "@sdl/ccc": "cons",
    "@sdl/pi": "host", "sdlcc": "host",
    "@sdl/areg": "tool", "@sdl/vibechk": "tool", "@sdl/packagechk": "tool",
    "@local-pi-tools/backing-skill-commands": "tool", "@local-pi-tools/context-profiler": "tool",
    "@local-pi-tools/grill": "tool", "@local-pi-tools/pr-previews": "tool",
    "@local-pi-tools/runner-subagents": "tool", "@local-pi-tools/thermo-council": "tool",
  },

  verdict: {
    headline: "This is migration distance, not architectural drift.",
    drift: false,
    stats: [
      { value: "1", label: "cycle remaining", sub: "deferred, acknowledged debt", health: "amber" },
      { value: "6", total: "9", label: "capabilities migrated", sub: "flow ref + 5 closed children", health: "amber" },
      { value: "6", total: "9", label: "Capability APIs exposed", sub: `<span class="font-mono">@sdl/&lt;cap&gt;/api</span> seams`, health: "amber" },
      { value: "5", label: "transitional consumers", sub: "completion marker → must hit 0", health: "red" },
    ],
    read:
      `The layering is <em>right</em>: neutral infra sits at the bottom, capabilities sit above the Capability Kit,
       <span class="font-mono text-sm">ccc</span> is the highest-fan-out consumer with no privileged tier, the
       <span class="font-mono text-sm">/api</span> seam convention is in place and guarded, and the once-headline
       <span class="font-mono text-sm">@sdl/pi ↔ @sdl/ccc</span> cycle is broken. What remains is unfinished work along a
       correct axis — three capabilities not yet modeled, <span class="font-mono text-sm">ccc</span> not yet a clean
       API-only consumer, the transitional holding-pen not yet empty, and one deferred lower-package cycle. None of these
       are inversions of the model; they are the tail of the migration.`,
  },

  northStar: {
    rule:
      `Edges point <strong>down</strong>; the Extension Dependency Graph <strong>must be acyclic</strong>. Domain logic lives
       <em>only</em> in capabilities — never in the presentation host or the kernel. The transitional holding-pen must delete to zero.`,
    bands: [
      { label: "Consumer", bg: "#1e293b", labelBg: "#0f172a", noteColor: "#cbd5e1", chipBorder: "#334155",
        packages: [{ name: "ccc" }], note: "highest-fan-out consumer · holds no privileged tier · depends on providers through their /api only" },
      { label: "Capabilities", bg: "#ecfdf5", labelBg: "#10b981", noteColor: "#047857", chipBorder: "#6ee7b7",
        packages: ["flow*", "handoff", "objective", "branch-context", "plans", "slot", "pr-address", "roaster", "aretro"],
        note: "command face over a gateway-injected domain core; /api only where a consumer needs it · *flow = in-repo reference" },
      { label: "Kit", bg: "#eef2ff", labelBg: "#818cf8", noteColor: "#4338ca", chipBorder: "#c7d2fe",
        packages: ["capability-kit"], note: "above-SDK substrate — the ctx→gateway adapter + shared result/error shapes (holds no domain)" },
      { label: "SDK", bg: "#e0e7ff", labelBg: "#6366f1", noteColor: "#4338ca", chipBorder: "#c7d2fe",
        packages: ["@sdl/sdl", "sdl-sdk"], note: "extension kernel/host + the thin author API of host primitives" },
      { label: "Holding pen", bg: "#fffbeb", labelBg: "#f59e0b", noteColor: "#b45309", chipBorder: "#f59e0b",
        packages: [{ name: "domain-primitives-transitional", dashed: true }], note: "must delete to zero — its emptiness is the endgame's completion marker" },
      { label: "Neutral infra", bg: "#f1f5f9", labelBg: "#94a3b8", noteColor: "#64748b", chipBorder: "#cbd5e1",
        packages: ["core", "clinkr", "graphite", "brmem"], note: "never holds domain" },
    ],
    offAxis:
      `Off this axis (not modeled as capabilities): the <span class="font-mono">@sdl/pi</span> presentation host, standalone tools
       <span class="font-mono">areg / vibechk / packagechk</span>, the <span class="font-mono">@local-pi-tools/*</span> presentation tools, and lower utilities <span class="font-mono">autobranch / cmux</span>.`,
  },

  graphIntro:
    `Every runtime edge, live. Node <strong>area ∝ source LOC</strong>. In the layered view a
     <span class="text-red-600 font-medium">red edge points upward</span> — that is the cycle violation. Drag to pin, scroll to zoom,
     hover to trace a node's neighbours, toggle tiers to drop the off-axis tools.`,
  graphCaption:
    `The two heaviest nodes are the <span class="font-mono">@sdl/pi</span> presentation host (11.7k LOC) and <span class="font-mono">ccc</span> (8.0k) —
     the host carries more code than any capability, which is itself the pressure behind the endgame (domain stranded above the SDK). The lone cycle is tiny by
     contrast: <span class="text-red-600 font-medium">@sdl/autobranch (1.5k) → @sdl/pi → @sdl/sdl → @sdl/autobranch</span>. The two deliberately-thin seams —
     <span class="font-mono">sdl-sdk</span> (171 LOC) and <span class="font-mono">capability-kit</span> (180 LOC) — are the smallest nodes on purpose.`,

  scorecard: [
    { invariant: `Extension Dependency Graph is acyclic and enforced in <span class="font-mono text-xs">ts-guard</span>`,
      status: "partial", statusKind: "partial",
      evidence: `Headline <span class="font-mono text-xs">pi ↔ ccc</span> cycle broken; a topological <span class="font-mono text-xs">ts-guard</span> check is live. One deferred SCC remains: <span class="font-mono text-xs text-red-600">autobranch → pi → sdl → autobranch</span>.` },
    { invariant: `Capability Kit owns the <span class="font-mono text-xs">ctx</span>→gateway adapter + result/error shapes; flow domain tested against <span class="font-mono text-xs">InMemoryGitGateway</span>`,
      status: "holds", statusKind: "holds",
      evidence: `<span class="font-mono text-xs">@sdl/capability-kit</span> exists (180 LOC); consumed by <span class="font-mono text-xs">flow, handoff, objective</span>. <span class="font-mono text-xs">runPushCore</span>/<span class="font-mono text-xs">runCpCore</span> are gateway-injected with fake-gateway unit coverage.` },
    { invariant: `Capability API convention (<span class="font-mono text-xs">@sdl/&lt;cap&gt;/api</span>), gateway-core rule, and deep-import/cycle guard documented + enforced`,
      status: "holds", statusKind: "holds",
      evidence: `6 capabilities ship <span class="font-mono text-xs">/api</span> (<span class="font-mono text-xs">pr-address, slot, plans, branch-context, handoff, objective</span>); guarded by <span class="font-mono text-xs">SDL_TS_BAN_CAPABILITY_PRIVATE_PEER_IMPORT</span>.` },
    { invariant: `All nine capabilities are above-SDK Capabilities (command face + gateway-injected core), each via a completed child Objective (flow excepted)`,
      status: "6 / 9", statusKind: "partial",
      evidence: `Done: <span class="font-mono text-xs">flow</span>(ref) + closed children <span class="font-mono text-xs">slot, branch-context, plans, objective, handoff</span>. Pending: <span class="font-mono text-xs">pr-address, roaster, aretro</span> — no child Objective, no kit dependency, no gateway-injected core.` },
    { invariant: `<span class="font-mono text-xs">ccc</span> depends on providers through their Capability APIs, not <span class="font-mono text-xs">@sdl/sdl/*</span> internals; no privileged tier`,
      status: "partial", statusKind: "partial",
      evidence: `Fan-out leader (12, highest in the graph) ✓ and reaches capabilities via <span class="font-mono text-xs">objective/slot/branch-context/plans</span>. But still imports <span class="font-mono text-xs">@sdl/sdl/context</span>, <span class="font-mono text-xs">domain-primitives-transitional</span>, and <span class="font-mono text-xs">@sdl/pi/commands</span> (10×).` },
    { invariant: `Below the SDK is domain-free: <span class="font-mono text-xs">domain-primitives-transitional</span> deleted; no below-SDK package imports capability domain`,
      status: "open", statusKind: "open",
      evidence: `The package still exists (578 LOC) with 5 consumers: <span class="font-mono text-xs">flow, sdl-sdk, ccc, sdl, pi</span>. Roadmap step 6 is unchecked — this is the explicit completion marker.` },
  ],

  findings: [
    { title: "The last cycle is a branch-slug primitive stranded in the host",
      strength: "Strong", tag: "acyclicity blocker",
      beforeAfter: {
        nowLabel: "now — red SCC",
        now: `flowchart TD
  autobranch -->|/branches/slug| pi
  pi --> sdl
  sdl -->|module-loader| autobranch
  classDef bad fill:#fee2e2,stroke:#dc2626,color:#991b1b;
  class autobranch,pi,sdl bad;`,
        afterLabel: "after — slug moves to core",
        after: `flowchart TD
  autobranch --> core
  pi --> sdl
  sdl --> autobranch
  pi --> core
  classDef ok fill:#dcfce7,stroke:#16a34a,color:#14532d;
  class autobranch,pi,sdl,core ok;`,
      },
      problem: `A 1.5k-LOC branch-naming utility (<span class="font-mono text-sm">@sdl/autobranch</span>) imports <span class="font-mono text-sm">@sdl/pi/branches/slug</span> — reaching <em>up</em> into the 11.7k-LOC presentation host — while <span class="font-mono text-sm">sdl</span> imports <span class="font-mono text-sm">autobranch</span> and <span class="font-mono text-sm">pi</span> imports <span class="font-mono text-sm">sdl</span>, closing the loop.`,
      solution: `Relocate the branch-slug primitive down into neutral infra (<span class="font-mono text-sm">@sdl/core</span>); <span class="font-mono text-sm">autobranch</span> then depends on <span class="font-mono text-sm">core</span>, not the host.`,
      wins: ["graph goes fully acyclic", "removes an inverted edge", "slug primitive gains locality", "unblocks ts-guard hard-fail"],
      debtNote: `Acknowledged debt, not a surprise: this is the explicitly deferred manifest cycle (objective <span class="font-mono text-xs">rescue/core-branch-slug-manifest-cycle-deferral</span> branch). The fix is scoped and waiting.` },

    { title: "The transitional holding-pen still has five consumers",
      strength: "Strong", tag: "completion marker",
      fanin: `flowchart LR
  flow --> T["domain-primitives-transitional"]
  sdl-sdk --> T
  ccc --> T
  sdl --> T
  pi --> T
  classDef pen fill:#fef3c7,stroke:#d97706,color:#92400e,stroke-dasharray:4 3;
  class T pen;`,
      problem: `<span class="font-mono text-sm">@sdl/domain-primitives-transitional</span> is the endgame's done-signal — it must delete to zero — yet 5 packages still import its primitives (checkpoint, pending-worktree, temp-files, text-generation).`,
      solution: `Re-home each primitive into its owning capability (or up into the SDK author surface where it is genuinely shared), then drain consumers and delete the package — roadmap step 6.`,
      wins: ["below-SDK goes domain-free", "flips the completion marker", "removes a holding-pen seam"],
      debtNote: `Gated downstream: this is the <em>last</em> step (6), unblocked only once ccc is clean and the remaining capabilities migrate. Surfaced here so it is not mistaken for current work.` },

    { title: `<span class="font-mono text-base">ccc</span> is the fan-out leader but not yet a clean consumer`,
      strength: "Worth watching",
      chipRows: [
        { label: "consumes capabilities cleanly:", items: [
          { text: "objective", state: "done" }, { text: "slot", state: "done" },
          { text: "branch-context", state: "done" }, { text: "plans", state: "done" }] },
        { label: "still reaches into:", items: [
          { text: "@sdl/sdl/context", state: "pending" }, { text: "@sdl/pi/commands ×10", state: "pending" },
          { text: "domain-primitives-transitional", state: "pending" }] },
      ],
      problem: `The model wants <span class="font-mono text-sm">ccc</span> to reach providers through their Capability API only. It already does for migrated capabilities, but it still depends on the kernel's internal context, the host's command surface, and the holding-pen.`,
      solution: `As the remaining capabilities migrate, repoint these last internal edges onto <span class="font-mono text-sm">/api</span> seams (or relocate the stranded <span class="font-mono text-sm">pi/commands</span> domain into its owning capability).`,
      wins: ["ccc holds no privileged tier", "retires transitional edges", "shrinks the host's domain"] },

    { title: `<span class="font-mono text-base">pr-address</span> ships an API but no command face`,
      strength: "Speculative", tag: "api-only anomaly",
      problem: `The model says a capability <em>mandatorily</em> exposes a command face and adds <span class="font-mono text-sm">/api</span> only where a consumer needs it. <span class="font-mono text-sm">@sdl/pr-address</span> exposes <em>only</em> <span class="font-mono text-sm">./api</span> — the inverse — and has zero runtime fan-in, so the API it ships is currently unconsumed.`,
      solution: `Confirm intent during the pr-address capability migration: either it is a pure provider seam owned per ADR 0016 (acceptable, document it), or it is a capability still missing its command face (then add one).`,
      wins: ["resolves a model exception", "confirms the PR-feedback seam owner"] },
  ],

  keystone: {
    title: `Move the branch-slug primitive from <span class="font-mono text-xl text-rose-300">@sdl/pi/branches/slug</span> down into <span class="font-mono text-xl text-emerald-300">@sdl/core</span>.`,
    paras: [
      `This is the single edge that keeps the graph cyclic. <span class="font-mono text-sm text-rose-200">@sdl/autobranch</span> imports a slug helper that lives — wrongly — inside the presentation host, which is the only reason a low utility points up at <span class="font-mono text-sm">pi</span>. Cut that edge and the <span class="font-mono text-sm">autobranch → pi → sdl → autobranch</span> SCC dissolves: the Extension Dependency Graph becomes fully acyclic, the deferred manifest cycle is retired, and the <span class="font-mono text-sm">ts-guard</span> acyclicity check can hard-fail instead of carrying an allow-listed exception. It is small, scoped, and already staged on the <span class="font-mono text-sm">rescue/core-branch-slug-manifest-cycle-deferral</span> branch.`,
      `It is the keystone because acyclicity is the one invariant every other endgame step is measured against, and because untangling <span class="font-mono text-sm">autobranch/sdl/pi</span> clears the lower spine that <span class="font-mono text-sm">ccc</span>'s clean-consumer conversion and the transitional deletion both sit on top of.`,
    ],
    sequence: [
      `1 · slug → core, graph acyclic`,
      `2 · ccc onto <span class="font-mono">/api</span> seams`,
      `3 · migrate roaster / aretro / pr-address`,
      `4 · delete transitional`,
    ],
  },

  provenance:
    `Structural facts extracted deterministically from <span class="font-mono">package.json</span> runtime edges; target invariants read from <span class="font-mono">.sdl/objectives/sdl-extension-architecture</span> (ADR 0009 / 0012 / 0016).`,
};
