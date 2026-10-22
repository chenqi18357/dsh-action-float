# dsh-action-float

**Action Float for DeepSeek Harness** — a quiet, per-session ticker for real file diffs and command status.

[中文说明](README.zh.md)

When the AI edits a file or runs a command, Action Float shows what actually happened in a lightweight layer above the current reply area or the composer. It does not reserve layout space, push the conversation around, or register custom chat nodes.

## Features

- **Real diffs** — added/deleted lines and line numbers come from the tool's actual `before`/`after` result, not from guessed model arguments.
- **Command lifecycle** — a command appears in blue while running, then turns green on success or orange on failure, with duration and exit code.
- **Five-row cap** — at most five lines are visible at once; overflow queues, and large diffs collapse into a representative preview plus a summary.
- **Quiet by default** — text with a theme-aware halo and radial scrim, no opaque card at rest. The scrim is sized to the text line, so blank space to the right stays clear.
- **Hover to focus** — hovering pauses fading and reveals the full text box; clicking a row opens the complete diff or command output.
- **No layout shift** — the layer is fixed-position and measures the live UI; it never inserts DOM into the conversation transcript.
- **Per-session isolation** — Host events are bucketed by `sessionId`; settings can be global or overridden per session.
- **Theme-aware** — colors come from Harness theme tokens, so light and dark themes both work.
- **No core changes** — implemented entirely as an installable bundle using Host tools events, `webServer`, `conversation.input.dock`, and `settings.section`.

## Where it appears

The ticker is placed automatically:

1. It finds the current turn's first reply block and the composer.
2. It takes the higher of their top edges:
   `anchorTop = max(12, min(replyBlock.top, composer.top))`.
3. The ticker sits 8 px above that anchor.
4. On scroll, resize, or layout change, the anchor is re-measured.

If no usable anchor exists, it falls back to the composer area. The placement is a single continuous rule, not two separate display modes.

## What is shown

### File edits

- `write` and `edit` results are diffed from their real `before` and `after` text.
- Added line: green `+ code`.
- Deleted line: red `− code`.
- Replacement: red old line followed by green new line.
- Each line includes `filename:line`.
- Up to 5 preview rows; larger changes keep representative rows and fold the rest into a summary.
- Detail view shows up to 2000 diff rows.

### Commands

- Start: blue command line with `Running`.
- Finish: green `Succeeded` or orange `Failed`, plus duration and exit code.
- Background, foreground, timed-out, and killed commands share the same lifecycle.
- Full command output is available on demand, capped at 24 KB.

## Requirements

- A DeepSeek Harness installation with the Web UI.
- The `@deepseek-ai/dsh-client-ui-conversation` Client package (shipped with Harness).
- No external runtime dependencies, build step, or CDN assets.

## Installation

Clone or download this repository, then install the package directory with Plugin Manager.

From an Agent:

```text
plugin_manager action=install_bundle target=C:\path\to\dsh-action-float
```

Or use the Plugin Manager UI and select this directory as a local bundle.

After installation, refresh the Web UI once so the Client bundle is loaded. The plugin appears as **dsh-action-float** in Settings.

### From npm

The package is published to npm. Install it by package name:

```text
plugin_manager action=install_bundle target=dsh-action-float
```

Use `dsh-action-float@1.0.1` to pin a version. The package page is `https://www.npmjs.com/package/dsh-action-float`.

## Usage

1. Let the AI run a command or edit a file.
2. Watch the ticker near the current reply/composer.
3. Hover to pause and show the text box.
4. Click a row for the complete diff or command output.
5. Press `Esc` or click outside to close the detail view.

## Settings

Open **Settings → dsh-action-float**:

- **Scope** — all sessions, or a per-session override.
- **Font size** — 9–20 px.
- **Dwell time** — 2–15 s.
- **Animation speed** — 400–4000 ms.
- **Reset** — restore defaults for the selected scope.
- **Live preview** — shows the current colors and typography.

Position is automatic and intentionally not configurable. Settings are stored in the local browser.

## How it works

### Host

- Listens to `tools/execute` and `tools/result`.
- Reads real command outcomes and file changes from tool results.
- Captures `edit`/`write` `before`/`after` values and computes line diffs with absolute line numbers.
- Publishes per-session events over `/action-float/events` (SSE) and serves full detail at `/action-float/detail`.
- Authenticates routes with `ctx.connection` and keeps session data isolated.
- No Harness core files are modified.

### Client

- Registers only `conversation.input.dock` and `settings.section`.
- Measures the current reply block and `[data-composer-card]` to place the fixed layer.
- Deliberately does **not** register `conversation.chat.node`; this avoids touching Conversation projections and prevents a malformed custom node from blanking the chat view.
- Uses `requestAnimationFrame` for per-row fade/upward motion and pauses while hovered or while detail is open.

### Readability layer

At rest, each row uses:

- theme primary text colors, with semantic red/green/blue/orange for diff and command states;
- a soft text halo;
- two radial theme-colored scrims with the same 74% / 48% / 82% falloff;
- a 5 px backdrop blur masked with the same radial shape.

Hovering replaces the soft scrim with a full text box and a 12 px blur.

## Limits

- At most 5 rows visible and 24 queued; very large diffs are summarized.
- Detail rows are capped at 2000; command output at 24 KB.
- DOM anchors depend on current Harness Web UI data attributes. If those change, the plugin falls back to the composer.
- Browser auth is required for the SSE and detail routes.
- Automated pixel-level visual regression is not included; verify visually after upgrading Harness.

## Development

```powershell
cd dsh-action-float
node --check index.js
node --check client.js
node --test test/*.test.js
```

The test suite covers line numbers, insertions/deletions, replacements, multiple hunks, large-diff fallback, five-row folding, detail truncation, package metadata, locale metadata, and placement/readability CSS invariants.

## Project layout

```text
dsh-action-float/
├─ index.js            Host half: tool observation, SSE, detail endpoint
├─ client.js           Client half: overlay, placement, settings, styles
├─ diff.js             Line diff and preview/folding helpers
├─ cordis.patch.yml    Bundle patch
├─ locale/{en,zh}.json Plugin Manager metadata (default host icon)
└─ test/               Node test suite
```

## Author

Created by **chenqi18357**.

## License

MIT. See [LICENSE](LICENSE).

Copyright © 2026 chenqi18357.
