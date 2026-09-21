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
4. Single-click/tap a channel for READY; double-click/tap for ALERT. Both clients update from the server broadcast. Keyboard Enter/Space sends READY; Shift+Enter/Space sends ALERT.
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

## Visual preservation and limits

The three documents retain the reference HTML, classes, inline CSS, fonts, colors, cards, navigation and PTT overlay. The Tailwind theme scripts are preserved. Old application scripts were replaced by `session.js`, `index.js`, `config.js` and `grid.js`; the Socket.IO client comes from the local server. The original 12-card template is retained, with the same labels for channels 1–12. Additional cards use `CHANNEL_13` etc.

Small functional differences: visual error banner only on failure; focus/keyboard support; mobile form/config scrolling to reach controls that the original clipped; grid rows adapt to 1–24 channels and scroll when necessary. At 12 channels the original two-column, six-row arrangement remains. Decorative navigation remains decorative; no extra screens were invented.

Rooms remain in process memory and disappear on restart. IDs/PINs are four digits; this is basic room admission, without rate limiting or production authentication. There is no database, room expiration, administrator authorization, audio transport, Voice-to-Text, or chat UI. Existing backend message support is validated and restricted to members. Tailwind and fonts still need internet access, as in the reference. UI encryption labels are inherited visual copy and do not implement application-level encryption.
