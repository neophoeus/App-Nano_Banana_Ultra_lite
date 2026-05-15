# Changelog

## v1.0.1 - 2026-05-15

- Fullscreen viewer metadata now resolves correctly for browser-managed images instead of staying stuck in a loading state.
- Workspace startup now always begins from a clean empty state and clears previously browser-stored workspace data instead of auto-restoring the last session.
- Browser-managed generated images now use a session-memory-first cache during normal use to reduce browser-side accumulation while keeping the workspace portable.
- Export Workspace now assembles the portable JSON snapshot on demand and embeds browser-managed saved image assets only when exporting.
- Clearing the workspace now removes browser-stored workspace and saved-image state instead of writing back an empty restored snapshot.
- Closing or reloading the app now triggers a localized browser warning when the current workspace still has content, prompting users to export the workspace before leaving.

## v1.0.0 - 2026-05-14

- First dedicated lite release for the browser-only frontend edition of `Nano Banana Ultra`.
- Feature parity with Nano Banana Ultra v3.6.8.
