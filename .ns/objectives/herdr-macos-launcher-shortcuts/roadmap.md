# Roadmap

## Work

- [ ] Establish the dedicated Ghostty and Herdr shortcut contract.
  - Inspect Ghostty's effective macOS keybindings, choose the smallest mnemonic Cmd+Shift map, and identify every binding that the dedicated profile must release.
  - Keep Herdr's prefix bindings as fallbacks unless a tested direct binding intentionally replaces them.
- [ ] Create and validate the machine-local dedicated configuration.
  - Add the Herdr-specific Ghostty configuration, matching Herdr key overrides, and preserve `ui.mouse_capture = true`.
  - Evidence: Ghostty validates the supplemental config and Herdr reloads its config without diagnostics.
- [ ] Build the macOS `Herdr.app` launcher.
  - Launch a distinct Ghostty instance with the dedicated config and start the installed Herdr binary directly.
  - Record the application wrapper source and all absolute machine-local paths needed to recreate it.
- [ ] Prove the complete interactive workflow and document the final setup.
  - Verify Spotlight/Dock launch, isolation from normal Ghostty windows, every direct shortcut, ordinary Herdr mouse controls, Ctrl-click pane links, and Shift-Cmd-click fallback.
  - Evidence: a manual acceptance checklist records the final shortcut map and confirms each required behavior.

## Parked

- A reusable installer or checked-in configuration template for other users.
- First-class Herdr support for creating or managing dedicated terminal profiles and macOS app launchers.
- A custom application icon and other cosmetic packaging beyond a functional personal launcher.
- Ordinary Cmd-click handling while Herdr mouse capture remains enabled, pending a terminal input mechanism that can distinguish Command-modified mouse events.
