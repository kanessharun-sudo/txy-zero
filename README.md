# Ten × You — Zero-Reference Foot Sizer (Demo)

Premium B/W demo of a zero-reference foot-sizing flow with phone levelling enforced by `DeviceOrientationEvent`. Built as a single-file React component (`src/App.jsx`) for easy drop-in.

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL **on a phone** for the full experience (sensors fire on iOS Safari and Android Chrome; iOS requires the user-gesture permission prompt, which the "Got it" button satisfies). On desktop, the demo automatically falls back to a manual tilt slider.

## Build

```bash
npm run build       # outputs dist/
npm run preview     # local production preview
```

Deploy `dist/` to any static host. **Camera + DeviceOrientation require HTTPS** in production.

## Flow

1. **Permissions** — privacy dialog explaining on-device processing. "Got it" requests sensor permission (iOS gesture requirement) and probes for sensor data.
2. **Instructions** — one-line directive ("Hold phone parallel to floor"), diagram, sensor-status badge.
3. **Camera + Leveller** — live rear camera, top-centre spirit level, foot-framing guide. Capture button is **disabled** until the device is within ±5° of flat. On desktop with no sensor, a slider appears below the viewport so demos always work.
4. **Measuring** — analysis animation with rotating phrases.
5. **Result** — large TXY size 8, UK 8 / US 8.5 / EU 42, foot length 26.5 cm. "Add to cart" button toggles to "Added" with a cart-badge bump in the header.

## Customising

- `LEVEL_THRESHOLD_DEG` (top of `App.jsx`) — currently 5°.
- `DEMO_RESULT` — the hard-coded demo output values.
- Colour palette is pure B/W/grey via Tailwind's `neutral-*`; the only accent is emerald for the "level" state.

## Browser support notes

- iOS Safari 13+: requires user-gesture permission for `DeviceOrientationEvent`. The "Got it" button is the trigger.
- Android Chrome: works without permission prompt.
- Desktop: no sensor → simulated leveller is shown automatically.
