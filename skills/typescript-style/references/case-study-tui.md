# Case Study — Terminal UI and Renderers

Use this pattern for terminal UIs, text renderers, editor buffers, selection lists, and input systems.
The general lessons apply to any rendering layer: small component contracts, explicit state ownership,
configurable input, and loud invariant checks.

## 1. Tiny component contract

Keep the render contract small:

```ts
interface Component {
  render(width: number): string[];
  handleInput?(input: KeyInput): boolean;
}
```

Components own their state. Containers compose components by concatenating or arranging rendered lines.
Avoid introducing a virtual DOM unless the product needs it.

## 2. Differential rendering

A renderer can cache previous lines and write only the changed range:

```ts
class Renderer {
  private previousLines: string[] = [];
  private terminal: Terminal;

  constructor(terminal: Terminal) {
    this.terminal = terminal;
  }

  render(lines: string[]): void {
    const firstChanged = findFirstChanged(this.previousLines, lines);
    const lastChanged = findLastChanged(this.previousLines, lines);
    if (firstChanged === null || lastChanged === null) return;
    this.terminal.writeLines(firstChanged, lines.slice(firstChanged, lastChanged + 1));
    this.previousLines = [...lines];
  }
}
```

The diff helpers are pure functions; the class owns terminal state and cache.

## 3. Width safety

Terminal output must account for display width, not string length. Wide glyphs, combining marks, and
ANSI escapes make `.length` wrong. Centralize helpers like `visibleWidth()` and `truncateToWidth()`.

Crash loudly on renderer invariant violations:

```ts
for (const line of lines) {
  const width = visibleWidth(line);
  if (width > terminalWidth) {
    throw new Error(`Rendered line exceeds terminal width: ${width} > ${terminalWidth}`);
  }
}
```

Silent corruption is worse than an actionable failure.

## 4. Configurable keybindings

Do not hardcode key checks throughout components. Route input through semantic action IDs:

```ts
export const keybindingDefaults = {
  "editor.cursor_left": { defaultKeys: ["left", "ctrl+b"], description: "Move cursor left" },
  "editor.delete_word_backward": { defaultKeys: ["ctrl+w"], description: "Delete word backward" },
} as const satisfies KeybindingDefinitions;

if (keybindings.matches(input, "editor.cursor_left")) moveCursorLeft();
```

Semantic IDs are API. Defaults can change or be user-configured without rewriting component logic.

## 5. Input dispatch

Keep dispatch order explicit:

1. global interceptors that can consume or transform input;
2. focused component;
3. parent/container fallback;
4. global shortcuts.

Return `true` when input is consumed. This is simpler than hidden event bubbling unless the UI needs a
full event system.

## 6. Change notification

Simple components can use callback fields instead of a general event emitter:

```ts
class TextInput implements Component {
  private value = "";
  public onChange?: (value: string) => void;
  public onSubmit?: (value: string) => void;

  handleInput(input: KeyInput): boolean {
    const next = applyInput(this.value, input);
    if (next === this.value) return false;
    this.value = next;
    if (this.onChange) this.onChange(this.value);
    return true;
  }
}
```

Use an event emitter only when there are multiple subscribers, dynamic subscription lifetimes, or event
fanout is a real feature.

## 7. State snapshots

For undo/redo or optimistic edits, snapshot at the boundary:

```ts
class UndoStack<T> {
  private snapshots: T[] = [];

  push(value: T): void {
    this.snapshots.push(structuredClone(value));
  }

  pop(): T | undefined {
    const value = this.snapshots.pop();
    return value === undefined ? undefined : structuredClone(value);
  }
}
```

Internals can mutate for performance; public snapshots should not share mutable references.

## What to copy

- Minimal `Component` interface.
- Renderer class owns terminal state; pure helpers do width/diff logic.
- Display width helpers instead of `.length`.
- Loud errors for render invariants.
- Semantic keybinding registry.
- Explicit input dispatch order.
- Callback fields for simple change notification.
- Defensive copies at state boundaries.
