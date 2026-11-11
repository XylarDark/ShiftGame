# Shift

A 2D pixel-art shop + delivery game for **iPhone, iPad, Android, and desktop** browsers. You play the **key-lead** in a side-cutaway of the shop, then **hit the road** as the driver on a handmade city map. One shift runs **09:00–23:00**, then a **results card** closes the day.

## Play

Public build: **https://xylardark.github.io/ShiftGame/**

On a phone, turn it **sideways**. For a full-screen app:

- **iPhone / iPad:** Safari → Share → Add to Home Screen
- **Android Chrome:** menu → Add to Home screen / Install app
- **Samsung Internet:** menu → Add page to → Home screen

Pushes to `master` publish that link through GitHub Pages.

## Run locally

```bash
npm install
npm test
npm run dev
```

Open the printed local URL on desktop or your phone (same Wi-Fi). `npm run build` typechecks and emits `dist/` for any static host. `npm run preview` serves that production build.

## Controls

Shop (tap / click):
- Tablet → item TV → bag. Packed deliveries sit on the counter.
- Walk-ins: tap that TV, then the customer. No bag.
- Tap the flashing driver to **HIT THE ROAD** with packed deliveries.

Drive:
- **Auto-drive** between stops (primary). On-screen pad + WASD/arrows nudge if you need to steer
- At each stop: **call** → **ASK ID** → **CHECK ID** → **HAND BAG** → **PHOTO**
- Tap the shop when you return

Settings (Music · Settings cog): volume/mute, **End shift** (after any scored action), or reset the clock to 9:00 AM.

## Loops

- **In-store (counter sale):** customer at the counter → matching item → sold
- **Pickup:** tablet ticket → item → bag → wait → customer arrives → tap them
- **Delivery:** tablet ticket → item → bag → HIT THE ROAD → park → call → ASK ID → CHECK ID → HAND BAG → PHOTO

1 game minute = 1 real second (1 game hour = 1 real minute). The shop day is **09:00–23:00**; at 23:00 (or End shift) you get a results breakdown. Late deliveries still complete but lose points. While you drive, an NPC key-lead keeps working the shop.

Placeholder pixels only (T0). City maps stay handmade.
