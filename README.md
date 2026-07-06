# Nano Banana Ultra _lite_

[English](README.md) | [繁體中文](README.zh-TW.md)

Nano Banana Ultra _lite_ is the browser-only lightweight frontend edition of [App-Nano_Banana_Ultra](https://github.com/neophoeus/App-Nano_Banana_Ultra).

It keeps the fast local workspace flow for Gemini image generation, references, style control, sketch and editor entry points, and browser-side persistence, while removing heavier Ultra-only surfaces that do not fit the Lite product boundary.

Nano Banana Ultra _lite_ is intended to run inside Google AI Studio. Gemini API access comes from the AI Studio environment automatically; _lite_ does not support manual browser API-key entry or a separate local standalone key flow.

Inside AI Studio, _lite_ uses blocking Gemini image-generation requests instead of browser live-progress streams. When the final response includes visible thought text or thought images, _lite_ extracts those artifacts from the final payload; hidden thought signatures are kept as continuity metadata and are not displayed as visible thoughts.

## Lite Scope

- browser-only React + Vite frontend
- prompt-based image generation with model, ratio, size, and style controls
- reference images, sketch-first ideation, and lightweight editor entry points
- local browser persistence for the current workspace state
- multilingual UI and theme switching

## Removed From Lite

- queued batch workflow
- shared snapshot and shared restore plumbing
- live-progress streaming for Gemini image generation; _lite_ reads final-response thought artifacts from blocking calls
- backend-only or long-running orchestration copied from the full Ultra app

## Relationship To Ultra

Use the upstream Ultra project when you need the full product surface, broader recovery flows, or heavier engineering and testing infrastructure:

- Upstream repo: <https://github.com/neophoeus/App-Nano_Banana_Ultra>
- Local/manual API-key workflow: use the full Ultra app instead of _lite_

Use _lite_ when you want the simpler browser-first frontend experience with a smaller maintenance surface.

## Version

Current Lite release: `v1.7.0`

Release notes: see [CHANGELOG.md](CHANGELOG.md).

## Current Lite Capabilities

### Create

- text-to-image generation with model, ratio, size, and style controls
- reference-image guided prompting inside the same browser workspace
- prompt tools and sketch-first entry points for early ideation

### Iterate

- selection-first continuation and branching across current and older turns
- lightweight editor entry for follow-up image edits and reframing
- stage-source and version visibility so the current working source stays clear

### Review

- reusable result text, prompt context, and source-aware history browsing
- grounding, provenance, and related review surfaces when the active result exposes them
- comparison-friendly workspace flow for checking nearby variants before the next pass

### Persist

- browser-local workspace persistence across reloads
- multilingual UI and theme switching
- simpler frontend-only maintenance experience than the full Ultra app
