# Herdr macOS Launcher and Shortcuts

## Thesis

Create a polished personal macOS entry point for Herdr: a dedicated Ghostty configuration launched as `Herdr.app`, with direct Cmd+Shift shortcuts that make common workspace, tab, and pane operations convenient without changing ordinary Ghostty windows.

## Scope

- Create machine-local Ghostty and Herdr configuration for the dedicated experience.
- Create a macOS application wrapper that launches a distinct Ghostty instance directly into Herdr and can be opened from Spotlight or the Dock.
- Assign and verify a small, coherent Cmd+Shift shortcut map for common Herdr actions, explicitly releasing conflicting bindings in the dedicated Ghostty configuration.
- Preserve Herdr's mouse-first UI with `ui.mouse_capture = true`.
- Verify pane links with Ctrl-click as the primary Herdr-handled gesture and Shift-Cmd-click as the terminal-native fallback.
- Keep implementation artifacts machine-local rather than adding personal workstation configuration to the ns repository.

## Non-Goals

- Adding first-class Ghostty profile or macOS launcher support to the Herdr product.
- Publishing a reusable installer, configuration package, or launcher for other users.
- Replacing all prefix bindings; existing prefix shortcuts may remain as fallbacks.
- Making ordinary Cmd-click distinguishable while Herdr captures mouse input; the captured terminal mouse protocol does not expose Cmd separately from a plain click.
- Changing shortcuts in normal Ghostty windows.

## Completion Criteria

- `Herdr.app` launches from Finder, Spotlight, or the Dock into a distinct Ghostty instance that starts Herdr directly.
- The dedicated Ghostty instance loads its Herdr-specific configuration without affecting normal Ghostty windows.
- The chosen direct Cmd+Shift bindings reach Herdr and perform their documented workspace, tab, and pane actions without accidental Ghostty actions.
- Herdr's ordinary mouse UI remains usable.
- Ctrl-click opens supported pane links through Herdr, and Shift-Cmd-click provides a verified terminal-native fallback.
- The final machine-local file locations and active shortcut map are recorded clearly enough to repair or recreate the setup.

## Assumptions and Risks

### Assumptions

- Ghostty 1.3.1 supports supplemental configuration through `--config-file`, per-binding `unbind`, and separate application instances launched with `open -na Ghostty.app`.
- Herdr accepts direct `cmd+shift+...` bindings and can reload its configuration without reinstalling the application.
- A Script Editor application wrapper is sufficient for a Spotlight- and Dock-launchable personal entry point.

### Risks

- macOS menu handling or Ghostty defaults may consume a proposed Cmd+Shift chord before Herdr receives it. Mitigation is to inspect Ghostty's effective keymap, unbind each conflict in the dedicated configuration, and choose a different chord where macOS owns it.
- A supposedly dedicated Ghostty launch may reuse global/default configuration in an unexpected way. Verification must compare dedicated and normal windows rather than assuming isolation from the launch command alone.
- App-wrapper quoting, Homebrew paths, or future binary locations may break launch. Record absolute paths used and keep the wrapper small enough to repair.
- Preserving mouse capture means ordinary Cmd-click is not available for Herdr-handled links. The accepted behavior is Ctrl-click, with Shift-Cmd-click as the native fallback.

## Open Questions

- Which final Cmd+Shift chord map is both mnemonic and conflict-free after testing against Ghostty and macOS?
- Should the launcher receive a custom icon after the functional workflow is proven?
- Is a Script Editor wrapper reliable enough long term, or should it later be replaced by a small Automator, Shortcuts, or native launcher artifact?
