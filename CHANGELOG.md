# Changelog

## v1.3.5 - 2026-05-26

- **Performance Improvement & Memory Optimization**: Implemented an LRU cache eviction mechanism for thumbnail image cache (limited to 40 items). Introduced a lightweight virtual URL schema (`/lite/session-images/...`) for React state history turns to replace heavy inline base64 image data. Added asynchronous image resolution inside `LazyHistoryImage` and Gemini API request wrapper to resolve virtual paths to IndexedDB blobs on-demand, resolving frontend OOM crashes and tab load issues under continuous generations.
- **Full TypeScript Type & Test Fixes**: Resolved strict compiler warnings and compile errors across components and Vitest tests, including union type narrowings, implicit `any` parameter definitions, mock property alignments, and callback closures causing TypeScript control flow analyzer to narrow properties to `never`. Secured complete test file compliance (716/716 passed).

## v1.3.4 - 2026-05-25

- Enhanced the "Image to Prompt" feature detail resolution by incorporating a strict Visual Forensic Protocol in the system instructions to explicitly extract subject expressions, fabric/surface textures, multi-layer background elements, precise color hues, camera focus, and rendering properties.
- Micro-adjusted the generation temperature to 0.3 and enhanced the user prompt for forensic-level details.
- Fixed a language switch bug where the "Image to Prompt" (Image-to-Prompt) tool would still generate English prompts on the first language switch. Wrapped `onImageToPrompt` with an arrow function to ensure it dynamically resolves to the latest handler reference instead of capturing a stale reference.

## v1.3.3 - 2026-05-24

- Implemented an LRU cache eviction mechanism for the browser-managed image memory cache, limiting full-resolution images to a maximum of 10 in memory to prevent frontend memory overload (OOM) and tab crashes during continuous generation inside Google AI Studio.
- Optimized startup image preloading to load only image thumbnails and the currently selected active image instead of preloading all historical full-resolution images, drastically reducing memory footprint at app startup.
- Enhanced the aggressive workspace snapshot pruning strategy to clear diagnostic logs and strip heavy text fields (thoughts, resultParts, grounding, and sessionHints) from non-selected history items when the local snapshot exceeds the browser storage limit.
- Wrapped direct `localStorage.getItem` access inside `loadWorkspaceSnapshot` with `try-catch` blocks to prevent React application boot crashes in restricted or sandboxed iframe environments.

## v1.3.2 - 2026-05-23

- Upgraded the prompt enhancer, random prompt generator, and image-to-prompt converter to use the official `gemini-3.5-flash` model instead of the older `gemini-3-flash-preview` model.
- Updated the content safety keywords identifier (`identifyBlockKeywords`) to use the official `gemini-3.5-flash` model.
- Added a custom `httpOptions` header `User-Agent: aistudio-build` when initializing the Google GenAI client in the service manager.
- Configured `"MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"` under `majorCapabilities` in metadata config to declare backend Gemini API capability.
- Added missing error toast notification (`showNotification`) to `handleSurpriseMe` failure paths in the Lite prompt tools hook.
- De-structured and enhanced the image-to-prompt converter output to yield an unstructured but highly comprehensive pure prompt with absolute forensic precision (covering subjects, backgrounds, lighting, camera composition, and art medium textures) to capture maximum visual details while preventing headings from polluting the composer.
- Redesigned the random prompt generator scaffolds to employ a 3-tier hybrid strategy (completely open-ended generation, semi-structured template fill-in, and anti-common-sense pairing strategy) to increase output surprise and variety while translating output to the active UI language.
- Simplified outbound prompt helper request payloads inside `geminiService.ts` to reduce rules redundancy, prevent instruction conflicts, and optimize token usage.
- Integrated style sensitivity guidelines to protect non-photorealistic art mediums (Anime, vector graphics, line art, watercolor) from being overwritten with realistic photographic terms (such as 35mm lens, realistic fur/skin texture, cinematic lighting) during prompt enhancement and random generation.

## v1.3.1 - 2026-05-21

- Added workspace reset terminal synchronization, so clearing the workspace now automatically cleans up the diagnostics terminal's local event history stored in localStorage.
- Emitted a workspace-clear sync event to ensure active components clear their local state and the terminal UI updates immediately to reflect the empty history.
- Enabled workspace snapshot auto-restoration by default on app mount to prevent state loss and API disconnects when reloaded inside Google AI Studio iframes.
- Implemented asynchronous persistence of generated images to IndexedDB, moving base64 records out of RAM cache to prevent memory bloat and iframe crashes.
- Introduced asynchronous preloading of stored image records from IndexedDB prior to React mounting, securing synchronous URL accessibility on initial layout rendering.
- Added a 5-second polling retry loop at startup to automatically detect and connect to asynchronously injected host API keys.

## v1.3.0 - 2026-05-18

- Added adjustable Gemini safety filters inside Lite Advanced Settings for the four officially supported safety categories: harassment, hate speech, sexually explicit, and dangerous content.
- Each safety category now supports the official threshold set through slider controls, including model default, off, block none, block only high, block medium and above, and block low and above.
- Moved the Safety filters card under Grounding mode in the right-side Advanced Settings column so the control stays available without becoming a noisy primary setting.
- Added a sync-all safety slider that can align all four safety categories in one move while still allowing per-category overrides afterward.
- Lite generation settings and prompt-helper flows now apply the same selected safety thresholds consistently instead of relying on a separate hidden default.

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
