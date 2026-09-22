# AV-COMM

Visual interface recovered from `c69939a944fbf3df3173b36047239d8bc848a40a`, with new JavaScript using the existing `*_show` Socket.IO protocol. No voice recording or transcription is implemented.

## Run locally

Use Node.js 20 or later and pnpm (the dependency versions are recorded in `pnpm-lock.yaml`).

```sh
pnpm install --frozen-lockfile
pnpm start
```

Open http://localhost:3000. `PORT=3001 pnpm start` selects another port. `pnpm dev` enables nodemon.

1. In browser A, enter a show name and select **GENERATE SHOW ID**.
2. In configuration, note the ID/PIN, choose 1–24 channels and FOH/BOH/MICS/CUSTOM, then **INITIALIZE UPLINK**.
3. In a separate browser profile/private window B, enter that ID/PIN on the start page and join.
4. Single-click/tap an IDLE channel for READY; a single tap on READY, ALERT or EMERGENCY resets it to IDLE. Double-click/tap for ALERT. Hold a primary pointer (mouse, trackpad or touch) still for 1.5 seconds for EMERGENCY; the red progress indicator confirms the hold, and release never sends a second action. Moving more than 12px, scrolling, cancellation, loss of focus or disconnect cancels pending gestures. Both clients update from the server broadcast. Keyboard Enter/Space uses the same READY/IDLE toggle; Shift+Enter/Space sends ALERT.
5. Reload a grid or reconnect its network: it rejoins and applies the server snapshot.
6. Hold PTT to display the original visual overlay; release to hide it (also stops after three seconds). It does not access the microphone.

Use separate browser profiles for independent sessions because localStorage is shared between tabs in the same profile.

## Tests

```sh
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
```

Alternatively, use an installed Chrome on macOS:

```sh
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' pnpm test:browser
```

The integration tests start temporary localhost servers and real Socket.IO clients. Browser tests use isolated desktop/mobile contexts and write screenshots only to the OS temporary directory.

## Session

All pages use `localStorage.av_session`:

```json
{
  "version": 1,
  "showId": "1234",
  "pin": "5678",
  "name": "MY SHOW",
  "channels": 12,
  "role": "FOH"
}
```

The server owns the channel count and channel states. Role is a client display label, not an authorization level. Custom role labels are at most 40 characters. Invalid/legacy sessions redirect to the start page. States are not persisted in localStorage: every successful join returns the latest snapshot.

## Socket.IO contract

| Client → server | Payload | Server → client |
| --- | --- | --- |
| `create_show` | `{name, channels, role}` | `show_created` → `{showId, pin, config}` |
| `join_show` | `{showId, pin, role}` | `join_success` → `{showId, pin, config}` or `join_error` → string |
| `configure_show` | `{showId, channels}` | `show_configured` → `{showId, pin, config}` to all room members |
| `update_channel` | `{showId, chId, status}` | `state_changed` → `{showId, chId, status}` to all room members, including sender |
| `new_message` | `{showId, text, sender}` | `broadcast_message` → `{text, sender, timestamp}` |

`config` contains `{name, pin, channels, states, messages}`. All handlers optionally acknowledge `{ok:true}` or `{ok:false,error}`; successful `configure_show` acknowledgements also include the snapshot. Other errors emit `operation_error` → `{event,message}`. The config page navigates only after its own configuration acknowledgement.

`configure_show`/`show_configured` is the only new operation pair. It is needed to apply the channel count after the room is created. Any socket admitted to that room may configure it; there is no administrator role in this phase. Shrinking the room removes states beyond the new limit and broadcasts a fresh snapshot. Counts must be integers 1–24. Channel IDs must be integers within that count; states are `IDLE`, `READY`, `ALERT`, `EMERGENCY`.

## Visual revision and limits

The functional baseline is commit `eb9a82693ee8470127c142a29965da216f9fb843`, originally recovered from `c69939a`. The current visual revision uses a local `ui.css` stylesheet, compact access panels, a wider configuration panel, and a responsive operating matrix: three columns on desktop, two on tablets/phones, one below 351px. Twelve channels fit without grid scrolling at desktop/MacBook test sizes. More channels and shorter touch screens scroll within the matrix, keeping the command bar visible.

The backend, session, creation/join/configuration logic, and event payloads remain unchanged. Channel gestures are now handled by `channel-gestures.js`: single tap toggles READY/IDLE, double tap sends ALERT, and a stationary 1.5-second hold sends EMERGENCY. Grid JavaScript changes are presentation only: card markup, state colors, connection labels, show metadata and pressed PTT styling. The PTT panel is explicitly a visual preview; its sample phrase is not recognized speech. The incoming-message overlay is a hidden UI template, not connected to live message delivery yet; its preview automatically fades after six seconds and never intercepts grid input. Decorative SYSTEM/PATCH/COMMS/LOGS items do not introduce new screens.

Browser tests cover 2560×1440, 1440×900, 1366×768, 820×1180, 1024×768, 390×844 and 320×568, plus the existing functional scenarios. Screenshots are written to `AVCOMM_SCREENSHOT_DIR` when set, otherwise to the OS temporary directory under `avcomm-visual-review`. DOM tests verify unique IDs and retained hooks instead of requiring the superseded visual layout to remain identical.

Rooms remain in process memory and disappear on restart. IDs/PINs are four digits; this is basic room admission, without rate limiting or production authentication. There is no database, room expiration, administrator authorization, audio transport, Voice-to-Text, or chat UI. Existing backend message support is validated and restricted to members. Google Fonts still use an external stylesheet, with local font fallbacks. Layout and colors no longer require the Tailwind CDN.
