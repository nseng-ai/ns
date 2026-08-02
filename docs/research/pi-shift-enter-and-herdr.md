# Pi Shift+Enter behavior through Ghostty and Herdr

**Researched:** 2026-08-02 against installed Pi `@earendil-works/pi-coding-agent` 0.83.0, installed Herdr 0.7.3, current first-party documentation/source, and this checkout's read-only Pi/Ghostty configuration.

## Conclusion

Pi's intended behavior has not recently changed away from Shift+Enter: `tui.input.newLine` currently defaults to both `shift+enter` and `ctrl+j`, while plain Enter submits and Alt+Enter queues a follow-up. What changed recently was reliability and fallback behavior: Pi 0.79.0 fixed intermittent Kitty keyboard negotiation on 2026-06-08, and the 0.80.0 changelog added Ctrl+J as a second default newline binding on 2026-06-23. The installed Pi is 0.83.0, published 2026-07-29. Pi originally added Kitty keyboard support for modified keys, including Shift+Enter in Ghostty, in 0.24.0 on 2025-12-19. Sources: [Pi keybindings](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/keybindings.md), [Pi changelog](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md), and [Pi terminal setup](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/terminal-setup.md).

The suspected tool is **Herdr**, not an unidentified `herd`: this process has `HERDR_*` pane/workspace variables, `/opt/homebrew/bin/herdr` reports 0.7.3, and this repo contains `pi-ns-herdr`. Herdr is a terminal workspace/agent multiplexer. Herdr historically could interfere by losing modified Enter information, but upstream fixed preservation of modified Enter, including Shift+Enter, in 0.5.11 on 2026-05-19. Current source explicitly tracks a pane application's Kitty keyboard state and tests that Shift+Enter is forwarded as CSI-u `ESC [ 13 ; 2 u`. Sources: [Herdr 0.5.11 changelog](https://github.com/herdrdev/herdr/blob/v0.5.11/CHANGELOG.md), [fix commit `d616bcd6`](https://github.com/herdrdev/herdr/commit/d616bcd6), and [current pane terminal tests](https://github.com/herdrdev/herdr/blob/master/src/pane/terminal.rs).

For this Ghostty → Herdr → Pi setup, the repo's custom multiline editor is **not needed for native Shift+Enter anymore**. It is still doing two other intentional jobs: making Alt+Enter insert a newline instead of Pi's default follow-up action, and composing with screenshot-path compaction. The safe change is therefore not to uninstall the whole package: remove/disable only `registerMultilineEditor` after correcting the Ghostty mapping, while retaining the screenshot feature if desired.

## Current Pi behavior and chronology

- Current official defaults are `tui.input.newLine = ["shift+enter", "ctrl+j"]`, `tui.input.submit = "enter"`, and `app.message.followUp = "alt+enter"`. User overrides belong in `~/.pi/agent/keybindings.json`; no such override was found in the inspected user config. Source: [official keybindings documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/keybindings.md).
- Pi uses the Kitty keyboard protocol for reliable modifiers. Its Ghostty instructions say Ghostty generally needs no Shift+Enter remap. They specifically warn that the old Claude Code mapping `shift+enter=text:\n` emits raw LF, which is indistinguishable from Ctrl+J; Pi's newer Ctrl+J alias makes that old mapping insert a newline, but the original Shift modifier has already been lost. Source: [official terminal setup, Ghostty section](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/terminal-setup.md#ghostty).
- Pi 0.79.0 (2026-06-08) changed Kitty fallback negotiation from timeout-driven to response-driven to fix intermittent Shift+Enter. The 0.80.0 changelog (2026-06-23) added Ctrl+J beside Shift+Enter. These are the relevant recent changes; neither makes Shift+Enter cease to be the primary native chord. Source: [official Pi changelog](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md).
- Earlier Pi 0.24.0 (2025-12-19) introduced Kitty keyboard support for Shift+Enter and other modified keys in Ghostty, Kitty, and WezTerm. Source: [official Pi changelog](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md#0240---2025-12-19).

## Herdr's role

Herdr sits between Ghostty and Pi in the current process. Its keyboard documentation correctly says a chord must survive the OS, outer terminal, multiplexer, and pane application; a wrapper cannot reconstruct a modifier that an earlier layer collapsed. Source: [Herdr keyboard documentation](https://herdr.dev/docs/keyboard/).

Upstream evidence shows the relevant forwarding problem was fixed before the installed version:

- Herdr 0.4.3 (2026-04-07) stopped normalizing bare LF to Enter, preserving cases that could represent Ctrl+J or a terminal workaround for Shift+Enter. Source: [Herdr changelog](https://github.com/herdrdev/herdr/blob/master/CHANGELOG.md#043---2026-04-07).
- Herdr 0.5.11 (2026-05-19) states: “Modified Enter input such as Shift+Enter is now preserved in supported terminals.” Source: [Herdr v0.5.11 changelog](https://github.com/herdrdev/herdr/blob/v0.5.11/CHANGELOG.md).
- Current Herdr source observes the child pane's Kitty keyboard pushes, replays keyboard state, and has regression tests asserting Shift+Enter is encoded as `\x1b[13;2u`. Source: [Herdr `pane/terminal.rs`](https://github.com/herdrdev/herdr/blob/master/src/pane/terminal.rs).

Installed Herdr 0.7.3 is newer than those Unix/macOS fixes. Homebrew currently offers 0.7.5. Later changelog/source work includes Windows-specific Shift+Enter fixes, but there is no evidence that current Unix Ghostty passthrough requires a Pi-side editor workaround.

## Local configuration evidence

Read-only inspection found:

- macOS Ghostty config at `~/Library/Application Support/com.mitchellh.ghostty/config.ghostty` contains `keybind = shift+enter=text:\x1b\r`.
- That mapping is **not** Pi's documented old Claude mapping (`text:\n`). It emits Escape followed by carriage return, the legacy encoding of **Alt+Enter**, so it discards Shift before Herdr or Pi sees the key.
- Project `.pi/settings.json` loads `@internal/pi-editor-mods`. Its `multiline-editor.ts` intercepts both Shift+Enter and Alt+Enter and replaces either with a literal LF. This explains why the current Ghostty remap still appears to work: Ghostty turns Shift+Enter into Alt+Enter, then the custom extension turns Alt+Enter into newline.
- The same package also owns screenshot compaction, independently of multiline handling. Sources: [`pi-editor-mods` README](../../ts/packages/internal/hosts/pi/tools/pi-editor-mods/README.md) and [`multiline-editor.ts`](../../ts/packages/internal/hosts/pi/tools/pi-editor-mods/src/multiline-editor.ts).

No secret values were inspected or recorded.

## Recommendation

1. Remove the Ghostty `shift+enter=text:\x1b\r` mapping and restart/reload Ghostty. It converts the key into Alt+Enter and masks whether the native path works.
2. On installed Herdr 0.7.3 or newer, test Pi with extensions disabled (`pi -ne`) or with only the multiline decorator disabled. Expected bytes/behavior are native Shift+Enter → newline, Enter → submit, Alt+Enter → follow-up.
3. If native Shift+Enter works—as upstream source says it should—disable only `registerMultilineEditor` in `pi-editor-mods`. Keep the package if screenshot compaction is wanted.
4. Keep the custom multiline decorator only if the deliberate product choice is “Alt+Enter also means newline,” or if a reproducible Herdr regression remains after removing the Ghostty remap. It is no longer justified merely to support Shift+Enter.
5. Update Herdr from 0.7.3 to current stable 0.7.5 as routine hygiene, then fully restart its server/client before retesting. If the problem survives, capture the raw key outside and inside Herdr and report it upstream; do not add another byte-remapping layer first.
