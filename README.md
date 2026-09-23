# AV-COMM

Visual interface recovered from `c69939a944fbf3df3173b36047239d8bc848a40a`, with new JavaScript using the existing `*_show` Socket.IO protocol. PTT uses native browser speech recognition to send text; AV-COMM does not record, store, or transmit audio.

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
6. Hold PTT (pointer or Enter/Space) and allow microphone access. Wait for LISTENING, speak in Portuguese (pt-PT), then release. FINALIZING waits for the recognition end event before sending text. The sender and other room members see the message, role and timestamp for four seconds.

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

The backend, session, creation/join/configuration logic, and event payloads remain unchanged. Channel gestures are now handled by `channel-gestures.js`: single tap toggles READY/IDLE, double tap sends ALERT, and a stationary 1.5-second hold sends EMERGENCY. PTT logic is isolated in `voice-ptt.js`. Its live transcript replaces the former placeholder, and `broadcast_message` now updates the existing incoming-message overlay, which disappears after four seconds and does not intercept grid input. Decorative SYSTEM/PATCH/COMMS/LOGS items do not introduce new screens.

Browser tests cover 2560×1440, 1440×900, 1366×768, 820×1180, 1024×768, 390×844 and 320×568, plus the existing functional scenarios. Screenshots are written to `AVCOMM_SCREENSHOT_DIR` when set, otherwise to the OS temporary directory under `avcomm-visual-review`. DOM tests verify unique IDs and retained hooks instead of requiring the superseded visual layout to remain identical.

Rooms remain in process memory and disappear on restart. IDs/PINs are four digits; this is basic room admission, without rate limiting or production authentication. There is no database, room expiration, administrator authorization, audio transport or typed-chat composer. Existing backend message support is validated and restricted to members. Google Fonts still use an external stylesheet, with local font fallbacks. Layout and colors no longer require the Tailwind CDN.

## Native PTT Voice-to-Text

The constructor is selected with `window.SpeechRecognition || window.webkitSpeechRecognition`. The initial language is `pt-PT`, centralized in `AV_VOICE_SETTINGS` in `public/voice-ptt.js`. There are no API keys, SDKs, external service integrations, or new socket events. The browser itself may use its vendor's network recognition service: native does not mean on-device or offline.

Press starts a fresh recognition session (STARTING while permission/start is pending, LISTENING once started). Interim results are displayed but never sent. Release requests `stop()`, leaves FINALIZING visible, and waits for `onend`. Only non-empty finalized segments are trimmed and emitted once with `new_message {showId, text, sender: role}`. Interim-only sessions send nothing. If recognition ends early while held, release sends the final text already captured; recognition is not restarted automatically. New presses are ignored until the current session is finalized.

Cancellation, lost pointer capture, window blur, hidden page, disconnect, and recognition errors abort/discard the session. A release before recognition starts is remembered. Late events from discarded or completed sessions cannot send anything. An 8-second finalization watchdog and 15-second start timeout prevent a stuck LISTENING state. Unsupported browsers display VOICE UNAVAILABLE; permission denial and microphone/network errors show explicit feedback without disabling the grid. There is no automatic message retry after an uncertain acknowledgement, avoiding duplicate sends. The existing server maximum of 2000 characters is enforced before transmission.

Use HTTPS or localhost for testing microphone access; HTTP over a LAN address may be blocked by the browser. Chrome may need network access to its recognition service. Safari/iOS behavior depends on OS/browser permissions and Siri availability; in-app browsers may expose the API without being able to start it. Constructor availability is detected at runtime, but does not guarantee that recognition will work. Real speech quality, microphone permissions and mobile interruptions must still be checked on target devices.

Automated tests use a controlled SpeechRecognition mock (including the webkit prefix, absent API, late final results, permission errors, duplicate end events and touch input), with real Socket.IO between clients. They do not send microphone audio to any recognition service.

References: [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [stop](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/stop), [WebKit Safari speech recognition](https://webkit.org/blog/11648/new-webkit-features-in-safari-14-1/).
