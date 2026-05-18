# Changelog

## v1.2.1 - 2026-05-18

- Lite AI Studio image generation now stays on blocking Gemini requests for both single-image and multi-image runs, instead of opening live-progress streams that can fail under AI Studio permission limits.
- Interactive batch variants, including 4-image runs, now read visible thoughts only from the completed final response and no longer hit the old first-slot stream fallback path before returning images.
- Capability gating, localized wording, and product documentation now describe the Lite boundary truthfully: streamed thoughts are not surfaced in AI Studio Lite, while hidden thought signatures remain continuity metadata when the model returns them.

## v1.2.0 - 2026-05-18

- Added a hidden debug terminal opened from the small top-header button, with a dedicated full-screen panel for inspecting sanitized Gemini requests, model responses, final result parts, retries, workflow logs, and errors.
- Debug traces now persist in a separate browser-local history with filtering, JSON export, copy-selected, and clear controls for later troubleshooting without affecting normal workspace restore data.
- Added debug terminal UI localization across all supported Lite languages.

## v1.1.2 - 2026-05-16

- Viewing another history image no longer clears the current object and character reference images.
- Continue and branch actions from history now preserve workspace reference images unless the user explicitly clears them.
- The explicit clear-references action remains the intentional path for removing object and character references.

## v1.1.1 - 2026-05-16

- Canceling a multi-image Lite run now enters a dedicated background finalizing state instead of freezing the whole foreground UI until the canceled batch fully settles.
- During that finalizing window, prompt editing and generation settings become available again immediately so the next idea can be prepared while the completed result is still being persisted.
- Fullscreen viewer, history-linked actions, and fresh generation still stay locked until the completed result is formally committed into history, preserving truthful Lite workspace behavior during cancel finalization.
- The composer now shows an explicit `Finalizing cancelled run` state and note after cancel is accepted, replacing the older still-canceling appearance.

## v1.1.0 - 2026-05-16

- Multi-image browser generation now unlocks each ready preview tile independently for stage-only preview during generation instead of waiting for the full batch to finish.
- Ready preview tiles shown during generation now stay preview-only, so fullscreen viewer and other history-linked actions remain locked until the batch is actually finalized.
- Cancel now aborts only unfinished Lite batch slots while preserving already completed results, so canceling after one image is ready no longer leaves a fake running tile or commits a late canceled result afterward.
- Browser-side Gemini request cancellation now propagates through both blocking and streaming SDK request paths, and batch stagger waits are abortable, so canceled requests stop launching or returning stale late results after cancel.

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
