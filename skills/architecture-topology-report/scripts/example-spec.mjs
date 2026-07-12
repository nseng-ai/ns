// Validated example spec: reproduces the current ns topology report, scored against
// the NS Extension Architecture target (ADR 0009 / 0012 / 0016). As of this snapshot the
// dependency graph is acyclic — the old branch-slug cycle was retired — so the live measure
// is the declared-tier guard (two hard violations) plus the migration tail. This is ALL the
// agent authors per run: optional tier overrides + the editorial judgement. It exercises every
// finding-card register — beforeAfter (the kernel→slot inversion), chipRows (cmux), and fanin
// (the transitional holding-pen) — so copy its shape and replace the content.
export default {
  repo: "ns",
  targetName: "the NS Extension Architecture target",
  date: "2026-06-28",
  intro:
    `The actual runtime dependency graph extracted from <span class="font-mono text-sm">package.json</span> files, scored against the
     end-state in <span class="font-mono text-sm">.ns/objectives/sdl-extension-architecture</span> (ADR 0009 · 0012 · 0016).
     The question is not "find refactors" — it is <em>how well are we tracking toward the architecture we said we wanted.</em>
     Since the last reading the headline cycle is gone; the new measure is the declared-tier guard.`,

  // Tier lanes come from declared package.json `ns.tier` values. Node color is the tier in
  // the default package view; the subpackage-circle drill-down keeps the tier hue, shaded
  // per enclosing package. Add a `tiers` object only for explicit presentation overrides.

  verdict: {
    headline: "The cycle is gone. What's left is the migration tail plus one real inversion.",
    drift: false,
    stats: [
      { value: "0", label: "cycles in the graph", sub: "fully acyclic — the old keystone landed", health: "green" },
      { value: "2", label: "hard tier violations", sub: `<span class="font-mono">kernel→slot</span> · <span class="font-mono">cmux→pi</span>`, health: "red" },
      { value: "6", total: "9", label: "capabilities migrated", sub: "flow ref + 5 closed children", health: "amber" },
      { value: "4", label: "transitional consumers", sub: "completion marker → must hit 0", health: "red" },
    ],
    read:
      `The layering is <em>right</em> and now provably so: neutral infra sits at the bottom, capabilities sit above the
       Capability Kit, <span class="font-mono text-sm">cmux</span> is the highest-fan-out consumer (13) with no privileged tier,
       the <span class="font-mono text-sm">/api</span> seam convention is in place and guarded — and the once-headline
       <span class="font-mono text-sm">autobranch → pi → kernel</span> cycle is <strong>broken</strong>, so the graph is fully acyclic
       and the <span class="font-mono text-sm">ts-guard</span> acyclicity check can hard-fail. Most of what remains is
       <em>distance</em>: three capabilities not yet modeled, the transitional holding-pen not yet drained, and
       <span class="font-mono text-sm">cmux</span> still reaching up into the host. <strong>One</strong> item is genuine
       <em>drift</em>, not distance — the SDK kernel imports a capability (<span class="font-mono text-sm">@nseng-ai/kernel → @nseng-ai/slots</span>),
       a layering inversion that should be isolated and cut, not waited out.`,
  },

  northStar: {
    rule:
      `Edges point <strong>down</strong>; the Extension Dependency Graph <strong>must be acyclic</strong> (now satisfied). The SDK never
       depends on a Capability and a Capability never depends on the Host. Domain logic lives <em>only</em> in capabilities. The
       transitional holding-pen must delete to zero.`,
    bands: [
      { label: "Consumer", bg: "#1e293b", labelBg: "#0f172a", noteColor: "#cbd5e1", chipBorder: "#334155",
        packages: [{ name: "cmux" }], note: "highest-fan-out consumer (13) · holds no privileged tier · depends on providers through their /api only" },
      { label: "Capabilities", bg: "#ecfdf5", labelBg: "#10b981", noteColor: "#047857", chipBorder: "#6ee7b7",
        packages: ["flow*", "handoff", "objective", "branch-context", "plans", "slot", "pr-address", "reviews", "retros"],
        note: "command face over a gateway-injected domain core; /api only where a consumer needs it · *flow = in-repo reference" },
      { label: "Kit", bg: "#eef2ff", labelBg: "#818cf8", noteColor: "#4338ca", chipBorder: "#c7d2fe",
        packages: ["capability-kit"], note: "above-SDK substrate — the ctx→gateway adapter + shared result/error shapes (holds no domain)" },
      { label: "SDK", bg: "#e0e7ff", labelBg: "#6366f1", noteColor: "#4338ca", chipBorder: "#c7d2fe",
        packages: ["@nseng-ai/kernel"], note: "extension kernel/host + the thin author API of host primitives — must not import a capability" },
      { label: "Holding pen", bg: "#fffbeb", labelBg: "#f59e0b", noteColor: "#b45309", chipBorder: "#f59e0b",
        packages: [{ name: "domain-primitives-transitional", dashed: true }], note: "must delete to zero — its emptiness is the endgame's completion marker" },
      { label: "Neutral infra", bg: "#f1f5f9", labelBg: "#94a3b8", noteColor: "#64748b", chipBorder: "#cbd5e1",
        packages: ["core", "clinkr", "graphite", "brmem", "autobranch", "cli-theme", "cmux"], note: "never holds domain" },
    ],
    offAxis:
      `Off this axis (not modeled as capabilities): the <span class="font-mono">@nseng-ai/pi</span> presentation host, standalone tools
       <span class="font-mono">areg / vibechk / packagechk</span>, and the <span class="font-mono">@internal/pi-tools/*</span> presentation tools.`,
  },

  graphIntro:
    `Every runtime edge, live. Node <strong>area ∝ source LOC</strong>. The graph is now <strong>acyclic</strong> — there are no red
     cycle edges left to draw. In the layered view the two <em>hard tier violations</em> read as edges pointing slightly
     <em>upward</em>: <span class="font-mono text-sm">cmux → @nseng-ai/pi</span> (a capability into the host) and
     <span class="font-mono text-sm">@nseng-ai/kernel → @nseng-ai/slots</span> (the SDK into a capability). Drag to pin, scroll to zoom,
     hover to trace a node's neighbours, toggle to the tier-clustered layout to see the bands stack, toggle tiers to drop the off-axis tools.`,
  graphCaption:
    `The two heaviest nodes are the <span class="font-mono">@nseng-ai/pi</span> presentation host (11.7k LOC) and <span class="font-mono">cmux</span> (8.1k) —
     the host carries more code than any capability, which is itself the pressure behind the endgame (domain stranded above and around the SDK).
     The deliberately-thin seam — <span class="font-mono">capability-kit</span> (180 LOC) —
     is the smallest node on purpose. The fan-in spine is <span class="font-mono">@nseng-ai/foundation</span> (28) and <span class="font-mono">@nseng-ai/clinkr</span> (19):
     load-bearing neutral infra, exactly where weight belongs.`,

  scorecard: [
    { invariant: `Extension Dependency Graph is acyclic and enforced by the <span class="font-mono text-xs">ts-guard</span> topological check`,
      status: "holds", statusKind: "holds",
      evidence: `<span class="font-mono text-xs">cycles = []</span> — fully acyclic. The headline <span class="font-mono text-xs">pi ↔ cmux</span> and the last deferred <span class="font-mono text-xs">autobranch → pi → kernel</span> SCCs are both broken (branch-slug relocated to <span class="font-mono text-xs">@nseng-ai/foundation/branch-slug</span>); the acyclicity guard can now hard-fail.` },
    { invariant: `Capability Kit owns the <span class="font-mono text-xs">ctx</span>→gateway adapter + result/error shapes; flow domain tested against <span class="font-mono text-xs">InMemoryGitGateway</span>`,
      status: "holds", statusKind: "holds",
      evidence: `<span class="font-mono text-xs">@nseng-ai/capability-kit</span> exists (180 LOC); consumed by <span class="font-mono text-xs">flow, handoff, objective</span>. <span class="font-mono text-xs">runPushCore</span>/<span class="font-mono text-xs">runCpCore</span> are gateway-injected with fake-gateway unit coverage.` },
    { invariant: `Capability API convention (<span class="font-mono text-xs">@nseng-ai/&lt;cap&gt;/api</span>), gateway-core rule, and deep-import/cycle guard documented + enforced`,
      status: "holds", statusKind: "holds",
      evidence: `6 capabilities ship <span class="font-mono text-xs">/api</span> (<span class="font-mono text-xs">pr-address, slot, plans, branch-context, handoff, objective</span>); guarded by <span class="font-mono text-xs">NS_TS_BAN_CAPABILITY_PRIVATE_PEER_IMPORT</span>.` },
    { invariant: `All nine capabilities are above-SDK Capabilities (command face + gateway-injected core), each via a completed child Objective (flow excepted)`,
      status: "6 / 9", statusKind: "partial",
      evidence: `Done: <span class="font-mono text-xs">flow</span>(ref) + closed children <span class="font-mono text-xs">slot, branch-context, plans, objective, handoff</span>. Pending: <span class="font-mono text-xs">pr-address, reviews, retros</span> — no child Objective, no kit dependency, no gateway-injected core.` },
    { invariant: `<span class="font-mono text-xs">cmux</span> depends on providers through their Capability APIs, not <span class="font-mono text-xs">@nseng-ai/pi</span>/<span class="font-mono text-xs">@nseng-ai/kernel</span> internals; no privileged tier`,
      status: "partial", statusKind: "partial",
      evidence: `Fan-out leader (13, highest in the graph) ✓ and reaches <span class="font-mono text-xs">objective/slot/branch-context/plans</span> via <span class="font-mono text-xs">/api</span>. But still imports <span class="font-mono text-xs">@nseng-ai/pi/commands/ack</span> (×9), <span class="font-mono text-xs">@nseng-ai/pi/terminal/presentation</span>, <span class="font-mono text-xs">@nseng-ai/pi/runtime/machine-envelope</span>, and <span class="font-mono text-xs">domain-primitives-transitional</span>.` },
    { invariant: `Declared package tiers validated; <strong>no hard tier violations</strong> (SDK must not depend on a Capability; a Capability must not depend on the Host)`,
      status: "2 hard", statusKind: "open",
      evidence: `Tier guard reports two hard edges: <span class="font-mono text-xs text-red-600">@nseng-ai/kernel → @nseng-ai/slots</span> (sdk-must-not-depend-on-capability) and <span class="font-mono text-xs text-red-600">@nseng-ai/cmux → @nseng-ai/pi</span> (capability-must-not-depend-on-host), plus 4 depends-on-transitional debt edges.` },
    { invariant: `Below the SDK is domain-free: <span class="font-mono text-xs">domain-primitives-transitional</span> deleted; no below-SDK package imports capability domain`,
      status: "open", statusKind: "open",
      evidence: `The package still exists (578 LOC) with 4 consumers: <span class="font-mono text-xs">flow, kernel, cmux, pi</span>. Roadmap step 6 is unchecked — this is the explicit completion marker.` },
  ],

  findings: [
    { title: "The SDK kernel imports the slot capability directly",
      strength: "Strong", tag: "tier inversion · hard",
      beforeAfter: {
        nowLabel: "now — SDK reaches up",
        now: `flowchart TD
  kernel["@nseng-ai/kernel (SDK)"] -->|command-face| slot["@nseng-ai/slots (capability)"]
  classDef bad fill:#fee2e2,stroke:#dc2626,color:#991b1b;
  class kernel,slot bad;`,
        afterLabel: "after — mounted via the loader",
        after: `flowchart TD
  kernel["@nseng-ai/kernel (SDK)"] --> kit["capability-kit / loader"]
  slot["@nseng-ai/slots"] --> kit
  classDef ok fill:#dcfce7,stroke:#16a34a,color:#14532d;
  class kernel,slot,kit ok;`,
      },
      problem: `<span class="font-mono text-sm">@nseng-ai/kernel/cli.ts</span> imports <span class="font-mono text-sm">buildSlotCommandGroup</span> from <span class="font-mono text-sm">@nseng-ai/slots/command-face</span> and <span class="font-mono text-sm">createRealSlotContext</span> from <span class="font-mono text-sm">@nseng-ai/slots</span> — the kernel depends <em>up</em> on a capability, the one true inversion in the graph.`,
      solution: `Mount slot's command face through the same extension-discovery path every other capability uses, so <span class="font-mono text-sm">@nseng-ai/kernel</span> depends on the loader/kit, not on <span class="font-mono text-sm">@nseng-ai/slots</span>.`,
      wins: ["removes the SDK→capability inversion", "restores capability-as-leaf shape", "clears one hard tier violation", "kernel stays capability-agnostic"] },

    { title: `<span class="font-mono text-base">cmux</span> still reaches up into the presentation host`,
      strength: "Strong", tag: "tier inversion · hard",
      chipRows: [
        { label: "consumes capabilities cleanly via /api:", items: [
          { text: "objective", state: "done" }, { text: "slot", state: "done" },
          { text: "branch-context", state: "done" }, { text: "plans", state: "done" }] },
        { label: "still reaches into:", items: [
          { text: "@nseng-ai/pi/commands/ack ×9", state: "pending" }, { text: "@nseng-ai/pi/terminal/presentation", state: "pending" },
          { text: "@nseng-ai/pi/runtime/machine-envelope", state: "pending" }, { text: "domain-primitives-transitional", state: "pending" }] },
      ],
      problem: `The model wants <span class="font-mono text-sm">cmux</span> to hold no privileged tier and reach providers through their Capability API only. It already does for migrated capabilities, but it imports 12 host internals from <span class="font-mono text-sm">@nseng-ai/pi</span> (command-ack, terminal presentation, machine envelope, skill expansion) — a capability depending on the host.`,
      solution: `Relocate the stranded Pi command-ack / presentation plumbing below <span class="font-mono text-sm">cmux</span> (into neutral infra or its owning capability), or invert the Pi↔cmux delegation, then repoint the last edges onto <span class="font-mono text-sm">/api</span> seams. This is endgame step 5.`,
      wins: ["cmux holds no privileged tier", "clears the second hard violation", "shrinks the host's domain", "unblocks transitional drain"] },

    { title: "The transitional holding-pen still has four consumers",
      strength: "Strong", tag: "completion marker",
      fanin: `flowchart LR
  flow --> T["domain-primitives-transitional"]
  kernel --> T
  cmux --> T
  pi --> T
  classDef pen fill:#fef3c7,stroke:#d97706,color:#92400e,stroke-dasharray:4 3;
  class T pen;`,
      problem: `<span class="font-mono text-sm">@nseng-ai/domain-primitives-transitional</span> is the endgame's done-signal — it must delete to zero — yet 4 packages still import its primitives (checkpoint, pending-worktree, temp-files, text-generation).`,
      solution: `Re-home each primitive into its owning capability (or up into the SDK author surface where genuinely shared), then drain consumers and delete the package — roadmap step 6.`,
      wins: ["below-SDK goes domain-free", "flips the completion marker", "removes a holding-pen seam"],
      debtNote: `Gated downstream: this is the <em>last</em> step (6), unblocked only once cmux is clean and the remaining capabilities migrate. Surfaced here so it is not mistaken for current work.` },

    { title: `<span class="font-mono text-base">pr-address</span> ships an API but no command face`,
      strength: "Speculative", tag: "api-only anomaly",
      problem: `The model says a capability <em>mandatorily</em> exposes a command face and adds <span class="font-mono text-sm">/api</span> only where a consumer needs it. <span class="font-mono text-sm">@nseng-ai/pr-feedback</span> exposes <em>only</em> <span class="font-mono text-sm">./api</span> — the inverse — and has zero runtime fan-in, so the API it ships is currently unconsumed.`,
      solution: `Confirm intent during the pr-address capability migration: either it is a pure provider seam owned per ADR 0016 (acceptable, document it), or it is a capability still missing its command face (then add one).`,
      wins: ["resolves a model exception", "confirms the PR-feedback seam owner"] },
  ],

  keystone: {
    title: `Convert <span class="font-mono text-xl text-emerald-300">cmux</span> into a clean consumer — sever its <span class="font-mono text-xl text-rose-300">@nseng-ai/pi</span> host edges.`,
    paras: [
      `With the graph now acyclic, the densest remaining knot is <span class="font-mono text-sm text-emerald-200">cmux</span>. It is the
       designated highest-fan-out consumer (13), yet it still imports 12 host internals from <span class="font-mono text-sm text-rose-200">@nseng-ai/pi</span>
       (command-ack ×9, terminal presentation, machine envelope, skill expansion) <em>and</em> still depends on the transitional holding-pen.
       Relocating that stranded Pi plumbing below <span class="font-mono text-sm">cmux</span> — or inverting the Pi↔cmux delegation — clears the
       <span class="font-mono text-sm">capability-must-not-depend-on-host</span> hard violation in one move and lets <span class="font-mono text-sm">cmux</span>
       reach every provider through its <span class="font-mono text-sm">/api</span> seam.`,
      `It is the keystone because <span class="font-mono text-sm">cmux</span> is the only node that sits in three open invariants at once —
       clean-consumer, no-host-dependency, and transitional-drain — so clearing it is on the critical path to the completion marker (step 6,
       deleting the transitional package). The smaller <span class="font-mono text-sm">@nseng-ai/kernel → @nseng-ai/slots</span> inversion is sharp but isolated;
       fix it alongside as a scoped loader-mount cut, but cmux is where the leverage is.`,
    ],
    sequence: [
      `1 · cmux off <span class="font-mono">@nseng-ai/pi</span> host internals`,
      `2 · isolate-and-cut <span class="font-mono">kernel → slot</span> via loader mount`,
      `3 · migrate pr-address / reviews / retros`,
      `4 · delete transitional`,
    ],
  },

  provenance:
    `Structural facts extracted deterministically from <span class="font-mono">package.json</span> runtime edges (32 packages, cycles = []); target invariants read from <span class="font-mono">.ns/objectives/sdl-extension-architecture</span> (ADR 0009 / 0012 / 0016).`,
};
