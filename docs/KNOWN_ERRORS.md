# Known errors and fixes

**Purpose:** record failures that were **expensive** or **non-obvious**, so nobody pays for them twice. Append new entries; do not delete history — mark an entry addressed instead.

**When to add an entry:** after you debug a non-obvious failure and have a verified fix. **Read this file before** touching audits, source-scanning tests, or Phaser input wiring.

**The theme of every entry below:** none of these bugs were caught by the thing that should have caught them. Some passed a check that measured **nothing**; some were hidden by the one value at which right and wrong agree; some had no check at all, only a constant or a comment asserting they were fine. A green check is not evidence unless you know what it measured — and a claim in the source is not a check.

---

## Failures that verified nothing

### Source-scanning test defeated by CRLF, then failed open

- **Date:** 2026-09-07
- **Symptom:** `src/art/shopInterior.test.ts` passed while asserting almost nothing. It reads its own sibling source, `shopInterior.ts`, to check what a function paints.
- **Cause:** two faults compounding. The scan searched for a newline-anchored closing `}` to find the end of a function, but `core.autocrlf` is `true` in this repo, so a checkout delivers **CRLF** and the LF-anchored search never matched. On a miss the helper *failed open* — `return end < 0 ? rest : rest.slice(0, end)` handed back the entire rest of the file, so every later function's code counted toward the assertions.
- **Fix:** normalise the text on read, `readFileSync(..., "utf8").replace(/\r\n/g, "\n")`, and **throw** on a miss instead of returning the remainder: `if (end < 0) throw new Error(...)`. Commit `7a5ec79`.
- **Prevention:** if you scan source text, always normalise line endings **and** throw when a marker is missing. A fail-open fallback in a test is worse than no test, because it reports success. Remember `core.autocrlf` is `true` here — the bytes on disk are not the bytes in the commit.

### Layout audit read a Phaser data value as a plain property

- **Date:** 2026-09-07
- **Symptom:** the text-overflow layout audit reported clean while overflowing text was plainly visible on screen.
- **Cause:** the audit read `text.typekitBox` as an object property. That value does not live on the object — it is stored in **Phaser's data manager** under the key `typekitBox` (see `TYPEKIT_BOX` in `src/ui/typekit.ts`), so it must be read with `text.getData("typekitBox")`. The property was `undefined` for every text object, so every overflow check hit its skip branch and the audit examined nothing.
- **Fix:** read the box through the data manager, and run the audit at **camera zoom 1** so measured bounds are comparable.
- **Prevention:** an audit that finds **zero** items to inspect is a failed audit, not a passing one. Assert that it found a plausible non-zero number of boxed texts before trusting a pass. When reading Phaser state, check whether the value is a property or a data-manager entry.

### Non-null assertion hid an uninitialised Phaser input and crashed the HUD

- **Date:** 2026-09-07
- **Symptom:** `npx tsc --noEmit` was clean, tests were green, and the HUD crashed on boot.
- **Cause:** `settingsDim.input!.enabled` asserted away a nullable. A Phaser game object's `input` is **null until `setInteractive()` has been called**, so the assertion silenced the one warning that would have caught it. `tsc` cannot see the runtime lifecycle. The same dim also swallowed clicks meant for objects behind it.
- **Fix:** drive interactivity through the real API — `setInteractive({ useHandCursor: false })` when the overlay is on, `disableInteractive()` when it is off — instead of reading and asserting `input`. Commit `e90c0b1`, in `src/scenes/HudScene.ts`.
- **Prevention:** prefer the real API over asserting a nullable away; `!` deletes exactly the signal you need. And because `tsc` demonstrably misses boot-time crashes, the definition of done requires **a capture proving the game still renders** — see [AGENTS.md](../AGENTS.md).

---

## Bugs hidden by a coincidence in the numbers

Distinct from the section above, and worth keeping apart from it. Those checks passed
by measuring **nothing**. These ones did run and did measure something real — they
passed because the single value they happened to probe is the one value at which a
broken implementation and a correct one agree. A round number is the usual accomplice.

### Every HUD button's hit box sat half a button up and to the left of its paint

- **Date:** 2026-09-07
- **Symptom:** roughly three quarters of every HUD button's visible area was dead to clicks, and an equal slab of adjacent blank panel was live. Nobody noticed, because clicking a button in the middle — which is what everyone does — worked.
- **Cause:** `addHudButton` handed its hit rectangle to `setInteractive` in the same coordinates it had just used to fill the background. Phaser's `pointWithinHitArea` adds `displayOrigin` to the local point before testing it, and a **Container's origin is its centre**, so the effective hit region sat half a button up and to the left of the paint. For `End Shift`: hit `[1431,1725]x[568.5,667.5]` against a visible `[1578,1872]x[618,717]`.
- **Why it hid for so long — the part worth remembering:** every button was an even **132px** tall. Half of 132 is a whole number, so a dead-centre click landed *exactly* on the displaced rectangle's corner, and Phaser's bounds test is inclusive, so it passed. Shrinking the settings buttons to an odd **99px** made the half-height fractional; the centre click fell 0.5px outside, and a long-latent bug surfaced looking like a brand-new regression in the resize. It was proved by clicking (1435, 573) — well outside the visible button — and watching it fire.
- **Fix:** offset the rectangle by the container's own `displayOrigin`, which is origin-agnostic by construction rather than tuned per call site. Commit `8af52e3`, in `src/ui/chrome.ts`; it affected the settings panel, the results panel and the Title screen.
- **Prevention:** a hit area is only verified by clicking **near its edges** — a few pixels outside each of the four, then the centre and both inside corners, reading the result back with `eval` rather than trusting pixels. A centre-only check passes on a rectangle that is half off the control, so it is not evidence of anything. And treat an **even-numbered dimension as a hazard** wherever geometry gets halved: it can place your one test point exactly on a boundary and hide an off-by-half error indefinitely. The Title screen's own button, the one origin variant (0.5) the others do not cover, is reachable for this check with `--query "?howto=1" --start-clicks 1 --ready-scene title`; see [AGENTS.md](../AGENTS.md).

### A box with 1px of margin looked exactly like the bug it was not

- **Date:** 2026-09-08
- **Symptom:** nothing visible, which is what makes it worth recording. The doorstep prompt's `maxHeight` was raised from 90 to 113 to carry a 25px seed, on the correct reasoning that `fitTypeToBox` only ever shrinks. The change was then credited with fixing a rendering fault that had never been happening.
- **Cause:** the two-line prompt measures **89px**, and the old ceiling was **90**. The box had exactly 1px of margin, so the text had always rendered at its full 25px. The raise bought headroom for the next edit to the copy; it repaired nothing. Nobody had measured the 89, so the margin's size was unknown and quietly assumed to be negative.
- **How it was caught, which is the part to steal:** the old number was put **back** on the live object, and the text rendered identically at 25px. Reverting a change to see whether the symptom returns is the cheapest test of a fix that exists, and it is almost never run — the change is green, so the change gets the credit.
- **Fix:** none was needed. The taller box was kept as deliberate headroom, and its comment in `src/scenes/DoorScene.ts` records the derivation (90 × 1.25 = 112.5, rounded **up**, because rounding down is this same trap in miniature). The 89-against-90 measurement lives here, since that is the number which says the raise bought headroom rather than repaired a fault. Commit `24870c1`.
- **Prevention:** the same species as the hit box above with a thinner accomplice — 1px rather than half of an even 132 — and the same trap underneath: a measurement that happens to sit on the correct side of a boundary says nothing about how far it is from it. **Measure the margin, not just the pass.** And before crediting a change with a fix, revert it and confirm the symptom comes back.

---

## Claims in the source that nothing enforced

Distinct from both sections above, and the reason this one is separate: there was no check
here to fool. These bugs lived in the gap between what the source **said** — a constant
naming a font size, a header comment naming a derivation, a colour token named `flash`, a
function named for a correction it quietly declined to make — and what the code did.
Nothing measured any of those claims, so each read as true until someone finally measured
the thing it described.

### A size constant read 20px, the caption rendered 18, and a comment vouched for geometry it did not control

- **Date:** 2026-09-08
- **Symptom:** none, which is the point. The delivery phone's two-line `Tap to call <name>` had been rendering at about **18px while `PHONE_STATUS_PX` read `"20px"`**, for an unknown length of time. Nothing looked wrong, nothing failed, and no check covered it. It surfaced only because the phone was being grown 15% for an unrelated request and its status band was measured on the way past.
- **Cause:** two unenforced claims compounding. First, `fitTypeToBox` **only ever shrinks**, so a seed larger than its box renders smaller and the constant stops describing the screen: the two-line caption measures **64px** tall at 20px, and the band it had to fit was **58px**. Second, the reason the band was 58: the app chrome heights were typed in as raw numbers — `34`, `58`, `4` — immediately beneath a header comment stating that *every* phone dimension derived from `PHONE_SCALE` and that "nothing here may be typed in independently". That comment was true of the chassis, the glass, the app rect, the hit area and the map, and false of the three numbers directly under it. The contradiction cost nothing while the scale sat still, and became visible the moment it moved: the glass grew and the title and status bars stayed put — a bigger phone running a smaller app.
- **Fix:** state the chrome in cells so it genuinely derives (`PHONE_CELL * 2.5`, `* 4`, `* 0.25`), which puts the band at 64.4px and lets the caption reach its authored 20px — read back off the live text object, not inferred from the constant. The band now carries a comment naming it the tightest box on the phone and quoting the two numbers that make it tight (64 of 64.4), so the next person who wants a taller map can see what they would be spending. Commit `be757d4`, in `src/scenes/HudScene.ts` and `src/art/phoneArt.ts`.
- **Prevention:** **assert the effective rendered size, never the declared constant.** A test pinning `PHONE_STATUS_PX` would have passed identically in the broken state and the fixed one; only `style.fontSize` off the object in a browser distinguishes them. And read a comment asserting a derivation as an unverified claim rather than a guarantee — nothing fails when a hand-written number quietly replaces a derived one, so the drift is silent by construction and the person who finds it is never the person who caused it. The same shape is worth watching for wherever a constant names a size: see the `RESET TO 9 AM` label, which was pinned at 18px next to a sibling's 26px until the copy was cut.

### Height-fill crop left HUD chrome off the visible screen

- **Date:** 2026-09-09
- **Symptom:** after switching contain to always fill viewport height (no top letterbox), iPad / tall landscape cropped the sides of the 16:9 stage. The settings cog and other HUD chrome sat in the clipped overhang and were unreachable.
- **Cause:** `layoutHud` only applied CSS safe-area insets. It never added the design-space overhang from a negative `stage.left`, so chrome was still laid out as if the full 1920×1080 was visible.
- **Fix:** `designLayoutInset` / `designHudInset` fold `stageCropCss` into the inset; the shell publishes the live stage frame via `setStageFrame`.
- **Prevention:** any layout that pads from the design edge must use the crop-aware inset when height-fill can set `stage.left < 0`. Cover with a test that places the cog inside the visible design range on a 1024×768 contain.

### Waiting-worker activate blanked phone cold opens for seconds

- **Date:** 2026-09-09
- **Symptom:** phone Chrome took a couple of seconds of sky/blank before Welcome; install coach often never appeared on the first attempt.
- **Cause:** `main` awaited `bootKindlingPwa`, which `skipWaiting`'d a waiting worker, slept 800ms, returned `"reloading"`, and skipped `startGame` until `location.reload` — a full double boot after every deploy that left a waiting SW. Navigations already use `cache: "no-store"`, so the reload was unnecessary for fresh HTML/JS.
- **Fix:** start Phaser immediately; register the SW in the background; never activate/reload on boot or resume.
- **Prevention:** do not gate `startGame` on service-worker outcomes. Source-guard that `startGame()` precedes `void bootKindlingPwa()` and that `pwaUpdate` has no `activateWaiting` / `location.reload`.

### Phaser smoothed delta put the whole sim in slow motion on phones (wall-clock era)

- **Date:** 2026-09-09 (reverted 2026-09-10 — product override)
- **Symptom:** clock, walkers, and van all felt slower than real time on phone Chrome — one game minute took longer than one real second, and motion matched.
- **Cause:** `HudScene` fed Phaser's smoothed `delta` into `GameSim.tick`. With `fps.smoothStep` (default true), `TimeStep.smoothDelta` caps each step to ~16.7 ms whenever `!inFocus` or during post-blur `_coolDown`. Low-FPS phone frames still take ~40–50 ms wall time, so the sim advanced only a fraction of real time.
- **Fix (2026-09-09):** tick from `game.loop.rawDelta` (capped at 1000 ms) and set `fps.smoothStep: false` — sim clock matched wall time but phone PWA felt choppy/stalling once GPU fill-rate was unmasked.
- **Product override (2026-09-10):** restored smoothed scene `delta` + `fps.smoothStep: true` — consistent motion feel matters more than wall-clock sim accuracy on phone PWA right now. Keep session render-tier lock (PR #29) so mid 0.85 does not thrash via mid-session `scale.resize`.
- **Prevention:** do not flip back to `rawDelta` for “accuracy” without measuring phone feel; wall-clock unmasks hitch but reads worse on Kindling today.

### Service-worker fetch-on-every-GET made play choppy after PWA updates

- **Date:** 2026-09-09
- **Symptom:** after the installed-app update work, gameplay felt hitchy/choppy even once wall-clock sim time was fixed; local DEV was especially bad.
- **Cause:** `public/sw.js` called `respondWith(fetch(...))` on every GET, putting Vite assets (and prod static files) on the SW hop with no CacheStorage win. DEV also registered the same worker, so HMR traffic paid the same cost. Resume `reg.update()` on every visibility flicker added spikes.
- **Fix:** intercept navigations only; skip SW registration in DEV; throttle resume updates to ≥10 minutes.
- **Prevention:** do not blanket-`respondWith` asset GETs for installability. Measure `actualFps` / p95 `rawDelta` with controller on vs off before changing SW fetch policy.

### Shrink-to-fit plus a CSS floor drew glyphs outside the box

- **Date:** 2026-09-09
- **Symptom:** raising `minCssFloor` for mobile readability made labels escape their plaques and HUD bands. `tsc` and the shrink-loop tests stayed green: the loop still exited, and the stored `basePx` was unchanged.
- **Cause:** `fitTypeToBox` only ever walked *down* from the authored seed and stopped at the floor. When the floor was larger than the box, it applied that floor and returned — overflow was the success path. Nothing measured `text.width` against `typekitBox.maxWidth` after the loop.
- **Fix:** clamp-fit in `src/ui/typeFit.ts` picks the largest size in `[floor, ceiling]` that fits, can grow toward a CSS cap, and if even the floor sticks out it drops below the floor (or clips) rather than drawing outside the box. The interval is a pure function with tests; Phaser only rasterizes the chosen size.
- **Prevention:** a one-way clamp plus a floor is two contracts that fight. Test the matrix (grows, shrinks, sub-floor, clip) on the pure fitter, not on a Phaser Text. An overflow audit that skips items with no `typekitBox` is the other half of this — see the layout-audit entry above.

### A tint named `flash` multiplied a green sprite by green, and changed nothing

- **Date:** 2026-09-08
- **Symptom:** the doorstep delivery bag was supposed to flash while it was the next tap target, and it did not. The code looked correct and had presumably been trusted for a long time: it animated `alpha` and applied `Color.flash`, the shared "next tap target" token. Every property read back exactly as it had been set.
- **Cause:** a Phaser tint **multiplies**. `Color.flash` is a near-white lime (`0xb8ffb0`) and the bag is already green, so the tint had almost nothing left to scale. Sampling the rendered framebuffer over the bag at both extremes of a white-to-flash blend moved the average about **five values per channel** — invisible. The only value that did move was alpha, and it moved *downward*, to 0.7, which against a busy doorstep reads as unfinished art rather than as a call to action.
- **The expensive part, and why this entry is filed here:** the obvious next move — *animating* that existing tint rather than holding it constant — produced two stills that were **indistinguishable**. A change that looks done, reads back correctly, and does nothing. The source said `flash`, the token was literally named `flash`, and nothing anywhere enforced that anything flashed.
- **Fix:** move **luminance**, the one channel a green sprite has left. Alpha pinned at 1, the same token swung between 45% and full brightness so the peak still lands exactly on `Color.flash` and the shared colour identity is untouched, plus a 12% scale swell, because motion reads as "tap me" better than colour at this sprite size. Measured luma over the bag body then moved **35 → 78** per cycle, a 2.2x swing, repeatable. Commit `a1051d6`, in `src/scenes/DoorScene.ts`.
- **Prevention:** a multiplicative tint **cannot brighten a sprite that already shares its hue** — check the hue relationship before reaching for one. Note the same alpha-plus-`Color.flash` pattern is still in use on the customer sprite a few lines away, and is correct there: a person is not green, so the multiply has room to work. The hue check is the lesson, not the pattern. And verify a visual effect by **sampling rendered pixels**, never by reading back the property you just set — here every property was exactly what the code asked for.

### A lane snap that silently declined, and a driveable pad read as a routable one

- **Date:** 2026-09-08
- **Symptom:** the delivery van reached some stalls from the far side of the road, cutting across oncoming traffic, and arrived so skewed it had to swing up to **132°** to square up. **Seven of fourteen lots** were affected — `house-2` and `house-10` at 132°, `house-6` at 87°, `house-13` at 84°, and `house-5`, `house-7` and `house-9` at 76°. `tsc` and the whole suite were green throughout, because nothing anywhere asserted anything about the arrival angle.
- **Cause, the snap that declined:** `driveLaneCell(cell, next)` picks a lane from the direction *out of* `cell`. Where that step runs perpendicular to the street — which is precisely the cell where the van turns off it — no street pair matches, and the function hands the cell **back unchanged**, keeping whichever of the two lanes A\* happened to pick. The one cell whose lane decides the arrival is the one cell the snap left alone, and the caller cannot tell a corrected cell from a declined one.
- **Cause, walkability read as permission:** parking pads are driveable, so a two-cell driveway was a legal through-route. A\* used it to enter stalls from the back, without the route ever touching the frontage the van parks against.
- **Fix:** `routeToStall` forces the tail of the route — from the first junction upstream of the frontage, along the kerb lane, to the stall — and closes that run, the pad, and the cell just past the frontage while the lead-in is searched. The closure is the load-bearing part: without it A\* joins the forced run halfway by crossing the oncoming lane, which is the original fault rather than a fix for it. The cell past the frontage covers the case where the frontage is itself a junction and the run is therefore a single cell. Every lot now squares up **within 40°**, against an asserted ceiling of 55°. Commit `1c41707`, in `src/sim/driveRoute.ts`.
- **Prevention — a transform that no-ops on unmatched input fails open:** returning the input unchanged looks like a safe default and is exactly the bug, because success and refusal become the same value. This is the same shape as the source-scanning helper in [Failures that verified nothing](#failures-that-verified-nothing) above, which returned the whole rest of the file when its marker did not match — a reader who has internalised one has most of the other. If a function cannot do its job on an input, make it say so rather than hand the input back.
- **Prevention — walkability is not permission:** a tile the van *can* drive on is not a tile a route *may* use. The grid answers "is this passable"; the router read that as "is this allowed", and the two had to be separated by closing the pads explicitly. Worth looking for wherever a permissive data structure is doubling as an authorisation check — the structure will keep answering the question it was built for, not the one being asked.
- **Prevention — assert the outcome over every case, not a sample:** the affected seven have a shape, checkable against `CITY.houses`: every EW-fronting lot (`street.c === stop.c` — `house-5`, `7`, `9`, `13`) plus exactly the three NS-fronting lots whose kerb tile sits **west** of their stall (`street.c === stop.c - 1` — `house-2`, `6`, `10`). The other seven front their street from the east and always arrived square, so a spot check that sampled only those would have passed on a broken city. Driving all fourteen lots costs **3.1s**, which is essentially the whole of the suite's rise from 7.7s to ~10.6s — a trade the sim worker flagged rather than hid. Pair it with the cheap structural test that checks the *shape* of each route instead of driving it: that catches the same class in **53ms** from a different angle, so the fast one localises a fault and the slow one proves the thing the player actually sees.

### A hook configured fail-open, hard-coded to deny, and a header comment vouching for neither

- **Date:** 2026-09-08
- **Symptom:** two, at opposite extremes, from one script — and the second is the one worth remembering. First a total outage: the vendored secret-scan hook shipped as `.js` inside an ESM package, so it crashed on load, and under its original fail-closed setting that denied **every** file read and shell command in the repo. Then, once it loaded, no symptom at all: a scanner whose posture could not be determined from its configuration, its comments, or the denial it handed you.
- **Cause, the config and the code disagreed:** `.cursor/hooks.json` set `failClosed: false` on both `beforeReadFile` and `beforeShellExecution`, but the script **hard-coded `deny` on its own malfunctions**, so that setting only governed the case where the script never spoke at all. Five paths blocked on a non-finding: empty stdin, unparsable JSON, an unrecognised `hook_event_name`, any throw inside its read or decide functions, and a shell event missing `command` — that one returned `ask`, which blocks pending a human who may not be watching. The effective posture was fail-**closed** wherever it could still emit a verdict.
- **Cause, an unbounded read behind a bounded timer:** there was **no payload size limit anywhere in the script**. `beforeReadFile` carries the whole file, chunks accumulate into a string with no cap, and a single 5000ms `setTimeout` resolves the read whether or not `end` has arrived. A large or slow read therefore resolved on a **truncated** payload, which failed `JSON.parse`, which returned `deny`. The script even set `stdinTimedOut` and wrote it to its audit log with a comment saying a truncation "would otherwise look like a policy decision" — and then never read the flag when deciding, so that is exactly what it looked like.
- **Cause, the comment asserted the opposite of the file beside it:** the header called it a "Fail-closed secret scanner" and stated that `failClosed: true` in `.cursor/hooks.json` "is what actually closes that hole". The config in the same directory said `false`. Nothing checks a hook's comment against its own configuration, so both read as true for as long as nobody put them side by side.
- **Fix:** removed rather than repaired — commit `a345d07` (introduced in `98d853d`, with `90c4959` a later trailing-newline fix). Nothing here depended on it: `.gitignore` already excludes `.env` and `.env.*`, and the game reads no environment variables. What replaced it is design, not enforcement, and what that no longer covers is named in [operational/automation-gaps.md](operational/automation-gaps.md) — read-time and machine-scoped checks, which a commit-scoped scan does not substitute for.
- **Prevention — three of these are properties of the hook protocol, not of this script,** so they will be waiting for the next attempt at one: (1) `failClosed` governs only a hook that fails to answer; a hook that emits its own `deny` overrides the setting, so the posture lives in the script and must be stated there. (2) The stdin contract is bounded in **time** and unbounded in **size**, and `beforeReadFile` delivers the entire file — so any read-size cliff turns into a parse failure, and a parse failure must not be spelled `deny` unless truncation has been ruled out first. Resolve on `end`, and if a timer fires, treat the payload as unusable evidence rather than as evidence of a secret. (3) Cursor discards hook output above roughly 1.4KB, which is a separate defect on the **output** side and the one `failClosed: false` genuinely did cover; conflating the two produced a wrong account of this failure in the gaps file that had to be corrected afterwards.
- **Prevention — the general form, and why this entry sits in this section:** a control that cannot be characterised is not a control. Before trusting one, get a **deny** and an **allow** out of it deliberately and confirm each came from the rule you think it did — here a denial could mean a matched secret, a changed payload shape, a crash, or a file too big to fit through stdin, and the message did not distinguish them. And when a comment describes configuration that lives in another file, treat it as a claim with nothing enforcing it: this one had been wrong since the commit that introduced it.

---

## Environment traps

### `npm run dev -- --port 5174` silently targets the wrong host

- **Date:** 2026-09-07
- **Symptom:** Chrome fails to resolve a hostname of `5174`.
- **Cause:** the `dev` script is `vite --host`. npm appends forwarded arguments, so the port folds into the `--host` value rather than becoming its own flag.
- **Fix:** invoke Vite directly: `npx vite --host --port 5174 --strictPort`.
- **Prevention:** recorded in [operational/automation-gaps.md](operational/automation-gaps.md); see [AGENTS.md](../AGENTS.md) for the shared dev-server protocol. One server serves everything on port **5174** — do not start a second.

### Concurrent agents deadlocked on the shared browser tab

- **Date:** 2026-09-07
- **Symptom:** three agents hung for 46 minutes with no error output and no screenshots.
- **Cause:** the `cursor-ide-browser` tools drive a **single shared tab**. Concurrent agents contend for it and block; the failure is completely silent, so no agent is told it happened.
- **Fix:** capture through a per-agent Chrome instance — `npx tsx scripts/agent-shot.ts --lane N`, where the lane picks a dedicated debug port (`9400 + lane`) and its own Chrome profile.
- **Prevention:** full protocol in [AGENTS.md](../AGENTS.md); the underlying limitation is logged in [operational/automation-gaps.md](operational/automation-gaps.md).

### The Cursor browser's 2-second fuse is lit by the `position` argument

- **Date:** 2026-09-07
- **Symptom:** `browser_navigate` returned `[cursor.browserView.newTab] Timed out waiting for glass browser view: a36aa3`, twice in one hour, with only a single caller — so contention was not the explanation.
- **Cause:** the extension derives `preserveFocus` from the **absence** of `position`. Without it, Cursor creates the browser view inside the workbench renderer and cannot time out. With it, creation is delegated to the separate glass window and then polled for a webview element against a hard 2000 ms deadline (`AUk = 2e3` in `workbench.glass.main.js`). The logged failure took 2126 ms, matching the deadline rather than any network delay. A second factor explains the clustering around concurrency: `listTabs` filters by owning agent, so a tab held by another agent is invisible, reuse is skipped, and the call falls through to the one path that can expire.
- **Fix:** omit `position` to create, then reveal by passing the returned `viewId` **with** `position` — reuse never enters the creation path. Verified: the same call that timed out twice succeeded immediately without `position`, and revealing by `viewId` afterwards also succeeded.
- **Prevention:** `scripts/browser-probe.ts` reads Cursor's own automation logs offline and reports whether the subsystem has failed recently; it touches no MCP tool and cannot hang, so it is safe as a preflight. Retry at most once and only with the call changed — and never retry the *hanging* variant, which an agent cannot cancel from inside. Protocol in [AGENTS.md](../AGENTS.md); the un-diagnosable remainder is in [operational/automation-gaps.md](operational/automation-gaps.md).

### A capture run could still hang forever, because nothing had a timeout

- **Date:** 2026-09-07
- **Symptom:** the class of failure behind the 46-minute deadlock above. A run produced no output and never returned, so there was nothing to debug and no exit code to react to.
- **Cause:** every wait in `scripts/agent-shot.ts` was unbounded. `cdp.send` returned a promise that only ever settled on a reply, so if Chrome stopped answering — or died, closing the socket with calls in flight — the promise never settled at all. The debug-port poll used a bare `fetch`, which waits indefinitely on a socket that accepts and then says nothing. There was no overall wall-clock limit, and `chrome.kill()` in a `finally` block ran on none of the paths that matter: an unhandled rejection unwinds nothing, and a signal skips `finally` entirely.
- **Fix:** a wall-clock watchdog derived from the requested work, a per-operation timeout on every CDP round-trip and HTTP request, rejection of in-flight calls when the websocket closes, and synchronous teardown wired to `exit`, `SIGINT`, `SIGTERM`, `SIGHUP`, `SIGBREAK`, `uncaughtException` and `unhandledRejection`. On expiry the run names the step it died on and exits non-zero. Decisions live in `scripts/lib/laneProtocol.ts` with unit tests; the wiring is asserted structurally by `scripts/laneSafety.test.ts`.
- **Prevention:** teardown must stay **synchronous** — `process.on("exit")` will not await a promise, so an async cleanup silently does nothing on exactly the paths you added it for. Never write a bare `await cdp.send(...)`; the guard test fails the build if one reappears. A run that dies loudly is infinitely better than one that hangs silently.

### Killing only the parent Chrome leaves the rest of the tree behind

- **Date:** 2026-09-07
- **Symptom:** "endless browsers" — orphaned Chrome processes accumulating with no owning run.
- **Cause:** two things. `chrome.kill()` targets one process, but Chrome spawns renderer, GPU, utility and crashpad children. And the obvious identifier was wrong: **only the browser process and its renderers carry `--remote-debugging-port`**, while every process in the tree carries `--user-data-dir`. Reaping by port would therefore have stranded the GPU, utility and crashpad children. Verified by inspecting a real launch.
- **Fix:** identify lane processes by **profile directory** (`--user-data-dir` ending in exactly `kindling-shot-laneN`), never by process name, and kill with `taskkill /PID <pid> /T /F` — measured taking an 8-process tree to zero.
- **Prevention:** `taskkill /T` **exits non-zero when any child vanishes while it walks the tree**, which happens constantly with Chrome's renderers. It was observed reporting failure on a tree it had in fact destroyed. Its exit code is not evidence; `killTree` now measures the outcome with a liveness check instead of trusting it.

### A blank capture that looked like a broken game was a cold shader cache

- **Date:** 2026-09-07
- **Symptom:** a capture that had worked returned a flat `#241c16` rectangle. The obvious reading was a boot crash in the scene under edit.
- **Cause:** not a crash at all. `eval` showed the game fully alive — `shop` scene active with 54 children, WebGL renderer, render loop running. Deleting the lane profile at the end of every run (the fix for a 688 MB disk leak) made every launch start with a **cold shader cache**, and headless Chrome renders through SwiftShader, so first paint at 1920x1080 landed after the default 2500ms settle had already expired. The screenshot was of the page background.
- **Fix:** gate the first capture on real rendered frames — poll `window.kindlingGame.loop.frame` until it passes a threshold, bounded by its own timeout and charged to the run budget. `--no-ready-wait` restores the old fixed sleep, `--min-frames` retunes it.
- **Prevention:** a fixed sleep cannot express "has painted"; it encodes an assumption about machine speed that software rendering breaks. When a capture looks broken, **read state with `eval` before believing the pixels** — that is what separated "still painting" from "crashed on boot" here in one step.

### The render gate passed, and it was measuring the wrong scene

- **Date:** 2026-09-07
- **Symptom:** with the render gate in place, a capture came back rendering correctly but showing `Paused - tap to start` at 09:00. The click that starts play had silently done nothing.
- **Cause:** two mistakes compounding. The gate ran *after* the start click, so the click still raced Phaser's input plugin and was dropped when it arrived first — Phaser discards pointer events received before the plugin is live, with no error. Moving the gate ahead of the click exposed the second problem: with `--no-click` the active scene is `title`, not `shop`, so the gate was satisfied by the title screen painting, and the shop's own first paint still raced the settle afterwards.
- **Also seen from the other end, and this is the symptom you will search for:** the settings **cog click simply did not open the panel**. The hit test found the cog, the pointer position was right, the handler never fired, and nothing errored. It cost four capture runs to establish that this was not a code regression, because a pre-change baseline reproduced it exactly — the same dropped-pointer race, presenting as a dead control rather than as a paused game.
- **Fix:** gate twice. Once before the click, so input is live when it lands; once after, re-armed against the frame number captured at click time, because `loop.frame` is monotonic and an absolute threshold is already met by then. Both gates are charged to the wall-clock budget. Commit `d7b9106`.
- **Durable workaround for any plan that opens something:** make the opening step **idempotent** rather than assuming the first click landed. A `clickeval:` that returns the cog's position when the panel is shut and a harmless piece of panel dead space when it is already open can be run unconditionally and repeated safely — so a lost click costs one extra step instead of an entire run and a false bug report.
- **Prevention:** this is the repo's own warning in miniature — the gate was green while measuring something that did not answer the question. When a readiness check passes, ask *which* scene satisfied it: `eval` the active scene keys, do not infer them from the fact that frames advanced. `--ready-scene` now does exactly that and fails the run on a miss.

### A capture obeyed its URL, applied none of it, and returned a perfect screenshot

- **Date:** 2026-09-07
- **Symptom:** `scripts/agent-shot.ts --url "http://127.0.0.1:5174/?howto=1"` produced a clean, correctly rendered capture of the shop — with no welcome or how-to overlay anywhere. The conclusion drawn at the time was that "neither `--query` nor `--url` got the parameter to the page", and that the Title screen's overlays were simply unreachable from a capture run. Both halves of that were wrong.
- **Cause:** the script composed its target as `` `${BASE}/${QUERY}` `` unconditionally, so a `--url` that already carried a query was glued to the default one: `http://127.0.0.1:5174/?howto=1/?howto=0`. That URL is entirely valid. Its path is `/`, so Vite serves the game and everything downstream succeeds — but `howto` parses as the single value `1/?howto=0`, which matches neither `"1"` nor `"0"`, so `shouldShowHowTo()` fell through to its `isLiveBuild()` default of **off**. No error, no warning, no clue.
- **Fix:** `resolveNavigationUrl` in `scripts/lib/laneProtocol.ts` reconciles the two sources instead of concatenating them — a query on `--url` is used as-is, `--query` supplies one when the URL has none, a query missing its leading `?` is repaired rather than turned into a path segment, and a query given in *both* places throws before Chrome is launched instead of silently picking one.
- **Prevention:** the render gate could not have caught this, and that is the general lesson: counting frames proves the page painted, never that it painted the screen you asked for. `--ready-scene <key>` makes the run assert which scene it ended on and **fails** when that scene never arrives — deliberately harsher than the frame gate, which forgives a shortfall as a slow machine. Verified by running the old failing invocation against the fix (`howto` now reads `"1"`) and by asking for `--ready-scene shop` on a URL that stays on `title`, which exits non-zero and names the scenes it found instead.

### Teardown was unbounded, and deleting a locked profile took 38 seconds

- **Date:** 2026-09-07
- **Symptom:** one run's teardown took **37.8 seconds** — longer than the capture it was cleaning up after — and reported a profile it could not remove.
- **Cause:** `rmSync` with `maxRetries` set retries *per directory entry*. Chrome had not yet released its file handles, and a profile holds several thousand files, so the backoff multiplied across every one of them. The watchdog does not cover teardown, so nothing bounded it.
- **Fix:** `removeProfileDir` now takes an explicit budget (5s default), sets `maxRetries: 0` so the retry loop is the caller's and not the filesystem's, and logs when it gives up. A leftover profile is a disk cost the reaper collects later, not a reason to hold the process open.
- **Prevention:** anything that runs after the watchdog stops needs its own bound. Measure teardown duration and print it — that number is what surfaced this at all.

### A process query matched its own command line

- **Date:** 2026-09-07
- **Symptom:** every clean capture run printed `WARNING pid NNNNN mentions a lane profile but could not be attributed`.
- **Cause:** the reaper enumerates processes with `Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%kindling-shot-lane%'"`. The PowerShell process running that query has the pattern **in its own command line**, so it matched its own filter, and the "could not attribute this browser" branch fired on it.
- **Fix:** treat a command line as an unattributable browser only when it carries a `--user-data-dir` flag *and* mentions the profile prefix. A process that merely names a profile path — the query itself, a shell, an editor — is ignored.
- **Prevention:** this only surfaced because the unattributable case is reported loudly instead of skipped. Keep it that way: the alternative is a reaper that silently fails to find things.

### Sprites baked into a hand-built capture scene render solid black

- **Date:** 2026-09-07
- **Symptom:** a contact-sheet scene added by hand for reviewing character art drew its background and shapes correctly, but every person came out a solid black silhouette. Cost three captures before the cause was clear.
- **Cause:** sprites inherit the game's day/night pipeline, which needs lighting state the ad-hoc scene never set up. Graphics shapes do not go through that pipeline, so they were unaffected — which is what makes it deceptive: the scene plainly works, only the subject is missing.
- **Fix:** `setPipeline("MultiPipeline")` on sprites drawn into a scene built for inspection rather than play.
- **Prevention:** true of any harness scene, not just contact sheets. If a capture shows a working background and a black subject, suspect the pipeline before suspecting the art — and note this is a harness limitation, not a game bug: the same textures render correctly in the real scenes.

### Two stills of an animation, taken half a period apart, disproved a working effect

- **Date:** 2026-09-08
- **Symptom:** two screenshots taken to prove the doorstep bag's new brightness pulse worked appeared to show it doing nothing at all. The frame labelled "lit" was in fact the trough of the cycle.
- **Cause:** capture latency. The shots were taken *between* phase gates, and the oscillator advanced roughly **half a period** between the frame being asked for and the frame arriving — so the label on each still was a guess about when it had been taken. The effect was fine and the measurement was not, which is the more dangerous way round: believing this evidence would have meant reverting a correct fix and hunting a bug that did not exist.
- **Fix:** one screenshot **per phase gate**, with the phase read back immediately after each shot, so every frame is attributable to a known point in the cycle instead of to the moment its step was issued.
- **Settled fact, recorded so nobody re-derives it:** **`gameMs` advances 1:1 with real time** — measured at **1.0103** and **0.9952** in separate runs. `GameSim.tick` feeds Phaser's frame delta into the clock unscaled, and `MS_PER_GAME_MINUTE` is an interpretation constant that does not multiply it. So an oscillator written against `gameMs` runs at real-time speed: the door flash measured **1125ms** and **1144ms** per period off the rendered object against a predicted 1131ms. That makes it a legible throb rather than a strobe, and driving it from game time rather than wall time is what freezes it correctly when the sim pauses instead of animating a frozen scene.
- **Prevention:** a single still can never demonstrate an animation, and two stills only do it if each one is independently anchored to the cycle. Pair them with a numeric read-back over time — the luma sampling in the tint entry above is what actually proved that pulse; the stills only illustrated it.

### Spacing customers apart made a delivery test lose a customer

- **Date:** 2026-09-08
- **Symptom:** giving each shopper their own standing slot, a pure layout change, broke an unrelated simulation test: `holds a normal delivery run cleanly and only sheds once parked for good` began reporting `shopCover.lost` of 1.
- **Cause:** the first slot ladder fanned out from `CUSTOMER_SPOT` in both directions, so a customer in an off-centre slot had *further to walk* than before. That delay pushed a pickup past its no-show deadline. Layout and timing are coupled here because the walk is simulated, not instant, and nothing about the change looked temporal.
- **Fix:** queue the slots backward from `CUSTOMER_SPOT` towards the door instead of fanning out, so slot 0 keeps the original walk and no slot is ever nearer the door than the one before it. Bubbles alternate rows to stay legible at the tighter pitch.
- **Prevention:** when moving where a simulated actor stands, check the tests that assert *when* they arrive. A geometry constant that feeds a walk is a clock, and "no slot walks further than the old single spot" is the invariant worth stating in code.

### A source-scanning test flagged the camera's own backdrop as a text chip

- **Date:** 2026-09-08
- **Symptom:** the test guarding the new ink-on-white plaque scheme failed on `DriveScene.ts` after every text box had already been converted.
- **Cause:** the scan banned `setBackgroundColor(`, but Phaser cameras carry the same method, and the road legitimately paints its sky through `cameras.main.setBackgroundColor` every frame. The scan was reading a real call that had nothing to do with text.
- **Fix:** scan line-wise and exclude lines mentioning `cameras.main`, then assert on the offending lines themselves so a failure names what it found rather than only that something matched.
- **Prevention:** a banned-substring test is only as good as the namespace it assumes. Before trusting one, inject a violation and confirm it fails *for the right reason*, which is what showed this guard was firing on the sky and not on a chip.

### A test for a new traffic rule passed with the rule switched off

- **Date:** 2026-09-08
- **Symptom:** an end-to-end test asserted the van "crossed without ever waiting" was false — that it did wait — and passed. Disabling the new crossing rule entirely, by dropping the steering intent at the call site, left it passing unchanged.
- **Cause:** the van waits for several reasons. The wait being measured came from the junction give-way rule that already existed, on the way to the stall, not from the crossing rule under test. Any "did it hesitate" assertion is satisfied by whichever brake happens to be nearest.
- **Fix:** split the claim by what can actually observe it. The rule itself is asserted directly on `driveSpeedForTraffic` with a car placed in the lane being crossed; the end-to-end test drops the hesitation claim and pins what only it can see — the van still arrives, and never comes within a car length of one. The wiring that connects them, the intent argument, is pinned by a source scan, because removing it changes no test's outcome.
- **Prevention:** after writing a test for a new rule, turn the rule off and watch it fail. A behavioural assertion that survives its own subject being deleted is measuring the rest of the system.

### A van that had finished its delivery looked like a van stuck in traffic

- **Date:** 2026-09-08
- **Symptom:** a capture of the new crossing behaviour showed the van stationary in 28 of 32 samples, moving 160px in 6 seconds against a cruise of 380px/s, with the stop pin still reading 50m away. It read as a traffic deadlock in the new rules.
- **Cause:** the van had arrived and parked. `?drivems` seeds the drive before the capture harness has finished waiting for the scene, which costs about three seconds of game time, so the still landed past the arrival rather than inside the run. The 50m was the distance to the *house door*, which is never zero at the kerb, and a parked van is stationary by definition.
- **Fix:** read the state rather than inferring it from movement. Patching the scene's day/night hook, which is already handed the live snapshot every frame, gives `autoDriving`, the dropoff phase and `gameMs` directly — and it showed the van parked `atCurb` with the clock running at 1.04× real time.
- **Prevention:** in this game, "not moving" has several innocent causes and the harness's own latency shifts every seeded moment later than asked. Confirm the sim's state before reading a still as a stall; a deterministic sweep in Node is the cheaper answer to "does it ever get stuck" anyway.

### `Set-Content -Encoding UTF8` silently replaced every em dash in a source file

- **Date:** 2026-09-08
- **Symptom:** after a one-line import edit through `(Get-Content $p) -replace ... | Set-Content $p -Encoding UTF8`, an unrelated test failed on a copy assertion: an em dash in the expected string had become the three characters `U+00E2 U+20AC U+201D`. `git diff` reported 147 changed lines in a file that had one line edited.
- **Cause:** Windows PowerShell 5's `Get-Content` decodes a BOM-less UTF-8 file as ANSI, so every multi-byte character was already mangled before `Set-Content` wrote it back as UTF-8. The same pipeline also prepends a BOM, which is how two test files ended up starting with `EF BB BF`.
- **Fix:** revert the file with `git checkout --` and redo the edit with the editing tools instead of a shell pipeline. Where the shell is unavoidable, `[System.IO.File]::ReadAllText`/`WriteAllText` with `UTF8Encoding($false)` round-trips without either fault.
- **Prevention:** never pipe source through `Get-Content`/`Set-Content` on this machine — this codebase is full of em dashes in comments and copy, and the damage is invisible in a diff summary and in the edited line itself. `git diff --stat` after a scripted edit is the cheap check: a one-line edit that reports a hundred changed lines has re-encoded the file. `node .devenv/scripts/tools/fix-mojibake.js <file...>` names the damaged lines and repairs them; note that its own `--check` mode only scans `.devenv`, so game files have to be passed explicitly. Do not paste a mangled sequence into this file as evidence — it makes the scanner flag the write-up forever, which is why the symptom above names the code points instead.

### A grep for mojibake came back clean on files that were full of it

- **Date:** 2026-09-08
- **Symptom:** immediately after the encoding damage above, `Select-String -Pattern "â€|Ã"` over `src` reported zero hits, and a recursive `Get-ChildItem | Select-String` grouping reported no files. Both were wrong: `traffic.test.ts` held sixteen mangled lines and `signText.test.ts` three, and they were committed. The template's `fix-mojibake.js` found them the same day.
- **Cause:** the search pattern travels through the same shell that mangled the files. Typing mojibake characters into a PowerShell command line re-encodes them in transit, so the pattern that arrived at `Select-String` no longer contained the bytes being hunted, and it matched nothing. A passing scan was read as proof of a clean tree — the same fail-open shape as a source scan whose markers do not land.
- **Fix:** detect this class by code point rather than by pasted glyph. Reading the file in Node and printing `codePointAt` for anything above 126 shows `U+00E2 U+20AC U+201D` plainly, and the repo has a purpose-built tool that does it properly.
- **Prevention:** a corrupted-text search cannot be written in corrupted text. Assert the pattern works before trusting a clean result — grep for a string you know is present, or use a tool whose patterns live in a file rather than on the command line. Also note what a green suite does *not* cover: this damage sat in comments, one test title and one assertion message, so all 500 tests passed with it in place.

### Full-resolution DayNight PostFX looked like a "slow game" after wall-clock sim

- **Date:** 2026-09-09
- **Symptom:** after HudScene switched to `rawDelta` (so sim stayed real-time on low FPS), phones felt hitchy rather than smoothly slow. Captures showed ~20 `actualFps` with or without a service worker.
- **Cause:** always rendering **1920×1080** WebGL plus a fullscreen **DayNight PostFX** (highp, up to 8 lights, fresh `Float32Array`s every upload). Drive also painted lighting twice per frame (`update` + `PRE_RENDER`). Wall-clock sim unmasked the GPU fill-rate cost that smoothed deltas had previously hidden as slow-mo.
- **Fix (history):** first response resized the backbuffer + camera zoom; that raced with scene create and looked permanently zoomed-in on desktop. Mid-period **effects-only** freeze kept design/WebGL at **1920×1080** zoom **1** while PostFX/lights/upload Hz adapted. **Current (2026-09-10 density-first):** adaptive `renderScale` (high 1.0 / mid **0.85** / low **0.65**) with `scale.resize` + matching camera zoom; layout/sim stay in GAME_* coords; CSS shell still presents 16:9. Phones seed mid (PostFX off); mood via Graphics only. Soft **0.45 / 0.32** superseded — killed phone pixel sharpness. Per-scene `syncSceneRenderCamera` on create + `applyCanvasDisplayScale` using live `gameSize` avoid the READY race. Boot warms DayNight + textures behind `#loading-gate`. Idle SW activate shows “Updating…” before reload.
- **Prevention:** do not treat "sim clock matches wall" as proof of smoothness — measure `actualFps` with PostFX on/off and at each `renderScale`. Product chose smoothed delta (2026-09-10) because wall-clock `rawDelta` unmasked hitch as stutter on phone PWA. Do not attach DayNight to Hud/Title cameras. When resizing for budget, always re-zoom every scene (including late `create`) and map pointers via live backbuffer size — never leave CSS fit assuming a frozen 1920×1080 buffer. First-use shader compile belongs in Boot warm-up, not the first shop frame. Coarse phones: lock render tier at boot mid 0.85 — no mid-session `scale.resize` (PR #29).
- **Follow-up (2026-09-10):** density-first phone mid/low **0.85 / 0.65** (supersedes 0.55/0.4 and soft 0.45/0.32); Drive bakes static ground/roads/props into ≤2048px `RenderTexture` cells then destroys per-tile Images (movers only as live sprites); coarse FPS `limit` 30; see [guides/smooth-2d-runtime.md](guides/smooth-2d-runtime.md).
- **Drawing-board (2026-09-10):** soft mid/low **0.45 / 0.32** landed then **superseded** by density-first **0.85 / 0.65**; desktop high DayNight at **postFxScale 0.5** (halfFrame); Shop static bake; city tile atlas; overdraw cuts; **people atlases**; **Door facade bake**; **skyVisualDirtyKey** cadence; ASTC/ETC still deferred (canvas RGBA bake); see guides/smooth-2d-runtime.md and plans/2026-09-10-density-first-budget.md.

### Canvas resize + zoom for mid/low budget looked permanently zoomed-in

- **Date:** 2026-09-09
- **Symptom:** Cursor / tall desktop panes showed a cropped shop (`#game-root` with negative `left`); phones recovered mid-session as FPS rose and tiers promoted.
- **Cause:** height-fill CSS on non-phone panes side-cropped; RenderBudget also shrank the WebGL buffer and zoomed cameras after READY, racing late scene creates.
- **Fix:** coarse → height-fill; fine → contain (stops IDE side-crop). Adaptive budget uses resize+zoom with per-scene sync; display fit remains CSS 16:9.
- **Prevention:** every scene `create` must call `syncSceneRenderCamera`; viewFit tests assert tall IDE panes keep `stage.left >= 0` in contain mode. Do not apply height-fill on fine-pointer / desktop panes.

### Install coach vanished after dismiss while BIP was still pending

- **Date:** 2026-09-09
- **Symptom:** phone Chrome in a normal tab never offered Install; motion stayed choppy at full 1920×1080 after resolution scaling had been withdrawn.
- **Cause:** (1) Chrome often fires `beforeinstallprompt` only after ~30s engagement and a tap. We `preventDefault`'d BIP then called `presentInstallCoach()` without `force`, so an earlier "Not now" / TTL dismiss permanently hid Install and the browser UI was already suppressed. (2) Auto-show gated only on `(pointer: coarse)`, which some Android builds do not report. (3) Backbuffer scale had been disabled after a zoom bug, leaving phones on full-res fill-rate.
- **Fix:** BIP handler uses `presentInstallCoach({ force: true })`; audience includes `any-pointer: coarse`, `maxTouchPoints > 1`, and Android/iOS UA; adaptive RenderBudget (phones seed mid @ 0.85×, PostFX off); **desktop / IDE panes use `containStage(..., "contain")`** so tall Cursor browser views letterbox instead of side-cropping (`left: -229` style zoom).
- **Prevention:** if you `preventDefault` BIP, you own the install UI — never let dismiss TTL swallow a later prompt event. Source-guard the BIP `force: true` call. Design layout stays 1920×1080 even when the WebGL buffer shrinks — do not let IDE-pane FPS change GAME_* layout. Height-fill side crop is for coarse/phone only.

### SW comment claimed the page posted skipWaiting; nothing did until idle activate

- **Date:** 2026-09-09
- **Symptom:** installed phones could keep an old controlling worker (including earlier asset-hopping fetch handlers) forever after a deploy, because nothing ever posted `kindling-skip-waiting` despite `public/sw.js` saying the page would.
- **Cause:** boot deliberately avoided activate+reload so mid-shift play would not hitch; the comment was never updated when that path was removed.
- **Fix:** idle-only activate — `setPwaIdle` from Title / shift-ended Hud posts `SKIP_WAITING_MESSAGE` and reloads once (sessionStorage guard). Never from resume mid-shop/drive. Align the SW file comment with that rule.
- **Prevention:** source-scanning tests that forbid boot/resume `skipWaiting` must still allow the named idle helper; comments that claim a handshake must have a caller.

### Mid-shift hitch on first doorstep and shop walk-in

- **Date:** 2026-09-10
- **Symptom:** playthrough felt slow until the customer ID screen, then smoother; customer walking into the shop was choppy.
- **Cause:** `DriveScene` / `DoorScene` first-created mid-delivery (`launch` not `wake`), paying city draw + door DayNight `bootFX` on the critical path. Shop walk-in allocated `Image` + two `addSignText` plaques on first sight. Boot warm only touched the boot camera and same-frame texture stamps (often no GPU upload). A longer blank loading screen alone does not fix this.
- **Fix:** under `#loading-gate`, flush textures for a full frame; launch shop/hud; warm DayNight; `launch` drive then door, render ≥2 frames each, then `sleep` so Hud prefers wake. Shop pre-allocates a customer visual pool. Door dirty-guards `houseLabel` setText/fitTypeToWidth.
- **Prevention:** never first-create drive/door mid-shift; warm must **draw** PostFX/scenes under the loading gate. Pool walk-in display objects at shop create. Do not treat “Loading…” idle wait as a hitch fix without real warm draws.

### People atlas boot blanked installed PWA (rails only, no loading/title)

- **Date:** 2026-09-10
- **Symptom:** after PR #25 deployed, installed PWA showed green KINDLING side rails and a blank sky center — no `#loading-gate`, title never appeared. Browser tab could still work.
- **Cause:** (1) `#loading-gate` only opened in `BootScene.create()` after audio preload, so the shell laid out rails first with no overlay. (2) `peopleAtlas` packed ~1920×1088 sheets via `canvas drawImage(getSourceImage())`, which throws or no-ops on some installed iOS/Android WebGL paths; uncaught failure could abort boot. (3) `flushTextures` stamped every baked key **and** both atlases **and** all 50+ individual people textures in one frame — mobile WebGL context loss → permanent blank canvas.
- **Fix:** `showLoading` from `main.ts` before `Phaser.Game`; pack people atlases with `RenderTexture.draw` + try/catch fallback to legacy keys; flush baked tiles before people pack; destroy packed source textures after atlas build so boot flush does not double-upload.
- **Prevention:** never rely on BootScene alone for first paint of the loading gate. Atlas builds must fail open (legacy texture keys). Do not stamp both atlas sheets and their unpacked sources in one boot flush.

### Loading gate click-through and orphan Door stall on installed mobile

- **Date:** 2026-09-10
- **Symptom:** taps reached Title under “Loading Kindling…”; on installed phones the gate stuck on the Door stage and never cleared.
- **Cause:** `#loading-gate` used `pointer-events: none`. Boot `Promise.race`d warm against Phaser `delayedCall` (game-time), which barely advances during sync Drive create; when the race “won,” `hideLoading` + Title ran while orphaned `runBootWarm` kept going and called `showLoading(Door)` again with no second hide.
- **Fix:** gate uses `pointer-events: auto` + swallow pointer/touch/click while visible. Warm abort is wall-clock `setTimeout` + `warmAborted` flag; `showBootStage` no-ops after abort; per-scene warm capped; `waitFrames` falls back to wall `setTimeout`.
- **Prevention:** never gate a loading overlay with `pointer-events: none`. Never `Promise.race` a continuing async warm that can `showLoading` after the race loser path already hid the gate — abort flag before every show.

### Customer speech refit every Shop frame during key-lead fetch

- **Date:** 2026-09-11
- **Symptom:** shop felt fine at shift start and on first tap; p95 frame time climbed once the key lead walked toBack/inBack/fromBack with customers on the floor.
- **Cause:** `ShopScene.syncCustomers` called `setText` + `fitTypeToBox` on every customer bubble every frame. `setText` is monkey-patched in `typekit.ts` to re-run polish and canvas upload even when the string was unchanged. `layoutCustomerSpeech` and `applyPersonTexture` also ran unconditionally.
- **Fix:** dirty-guard bubble/feedback `setText` and `fitTypeToBox` on copy + layout width; store last look on the visual; key `layoutCustomerSpeech` on settled order ids + quantized x; skip pulse/tint unless the customer is the current hint target. PR #35 already removed `getBounds` from key-lead bubble follow.
- **Prevention:** source-scan `shopSpeech.test.ts` for text/compare-before-setText guards; never call `fitTypeToBox` in a per-frame sync without a dirty key.

### GameSim.tick touch() rebuilt the full snapshot every frame

- **Date:** 2026-09-11
- **Symptom:** same fetch walk window as above — HUD/Shop paid for a full `snapshot()` rebuild (customer bubbles, order views, cover) on every sim step even when only `gameMs` and entity positions moved.
- **Cause:** `GameSim.tick()` called `touch()` at entry, nulling `snapCache`; the next `snapshot()` remapped customers/orders/cover from scratch each frame.
- **Fix:** remove entry `touch()`; `patchSnapCacheFromTick()` mutates cached `gameMs`, key-lead pose, customer `x`, and other tick-motion fields in place; discrete mutations (arrival, failOrder, spawn) still call `touch()`.
- **Prevention:** `gameSim.test.ts` expects same snapshot object after tick with updated `gameMs`; `scenePerfGuards.test.ts` asserts tick no longer opens with `touch()`.

### Tablet pointerdown built a full snapshot on the click stack

- **Date:** 2026-09-11
- **Symptom:** p95 frame spike on the frames after tapping the ORDERS tablet — worse than strain/bag taps because the handler ran before any press feedback.
- **Cause:** `ShopScene` tablet `pointerdown` called `getSim().snapshot()` just to read `tabletTicket.id`, remapping customers/orders on the input stack.
- **Fix:** cache `tabletTicketId` during `syncTablet`; pointer handler reads the cached id only.
- **Prevention:** `shopSpeech.test.ts` and `scenePerfGuards.test.ts` source-scan for `snapshot(` inside `pointerdown` blocks.

### shopClick touch() on every tap, including no-ops

- **Date:** 2026-09-11
- **Symptom:** repeat taps on an already-selected ticket or empty bag rack still paid for a full snapshot rebuild before HUD/Shop could paint the notice.
- **Cause:** `GameSim.shopClick` called `touch()` before dispatch, nulling `snapCache` even when the click only re-set the same notice string.
- **Fix:** drop entry `touch()`; make `setOrdersNotice` / feedback / callout setters and discrete mutation paths call `touch()` only when exposed snapshot fields actually change.
- **Prevention:** `gameSim.test.ts` same-ticket re-tap and repeated bag-rack no-op keep order count/phase stable and preserve the snap cache when the notice is unchanged.

### Typekit clamp-fit hitch on interaction strings

- **Date:** 2026-09-11
- **Symptom:** after #35–#38, shop taps (tablet, strain, bag, walk-in bubble) still showed a p95 frame cliff vs idle — one heavy frame on the same turn as the tap.
- **Cause:** `bindPolish` wrapped every `setText` with `fitTypeToBox`, which walks font sizes from ceiling down; each probe calls `updateText()` (full canvas raster + GPU upload). Call sites such as `ShopScene.syncCustomers` also called `fitTypeToBox` after `setText` when copy changed, paying the search twice. `addSignText` PRE_RENDER repainted plaques from measured bounds even for hidden chips.
- **Fix:** store `lastSize` on the type box; when limits are unchanged, raster once at `lastSize` and skip the clamp loop unless the new string overflows or the ceiling still fits (slack to grow). `bindPolish` returns early on identical strings. Shop customer bubbles refit on layout width only. Hud cover/phone rely on bindPolish alone. Hidden plaque sync skips width/height measurement.
- **Prevention:** `typekit.test.ts` asserts same-box string swaps stay ≤2 measure probes; `shopSpeech.test.ts` fit key excludes copy; `canReuseFitSize` unit tests in `typeFit.test.ts`.

### A* open.sort hitch on Hit the road

- **Date:** 2026-09-11
- **Symptom:** tapping Hit the road / driver showed a post-input frame cliff unrelated to typekit — depart was smooth after idle shop but spiked on the first drive route build.
- **Cause:** `findPath` sorted the open list every pop (`open.sort` + `shift`), used string tile keys, and `setVehiclePosition` called `refreshDriveRoute` on every van nudge. First depart from the shop paid full A* on the input stack with no session cache.
- **Fix:** binary min-heap + numeric tile indices + closed `Uint8Array`; session path cache keyed by start|goal; `refreshDriveRoute` skips when `driveRouteDestKey` is unchanged; boot `warmDriveDeparturePaths()` precomputes shop→house stalls under the loading gate.
- **Prevention:** `pathfinding.test.ts` forbids `open.sort` and asserts cache hits; `scenePerfGuards.test.ts` asserts `setVehiclePosition` does not call `refreshDriveRoute`.

### Per-plaque PRE_RENDER listeners

- **Date:** 2026-09-11
- **Symptom:** shop/HUD frame cost scaled with customer bubble + toast + ID plaque count even when chips were hidden or unchanged — every label registered its own `PRE_RENDER` handler.
- **Cause:** `addSignText` attached one `scene.events.on(PRE_RENDER, sync)` per text; Phaser dispatched N listeners every frame before any early-out.
- **Fix:** `SceneSignPlaquePump` — one PRE_RENDER pump per scene, dirty-flagged from hooked `setText` / `setPosition` / `setVisible`; pump skips when `anyDirty` is false.
- **Prevention:** `signText.test.ts` and `scenePerfGuards.test.ts` source-scan for the shared pump and absence of per-chip listeners.

### trafficCars rebuilt every tickDrive slice and DriveScene frame

- **Date:** 2026-09-11
- **Symptom:** driving cost scaled with physics slices (50 ms steps) plus a duplicate list build in `DriveScene.update` every render frame.
- **Cause:** `tickManualDrive` / `tickAutoDrive` called `trafficCars(...)` inside each catch-up slice; `DriveScene.update` called it again for sprites with the same `gameMs`.
- **Fix:** `GameSim.trafficForDrive()` caches one list per `clock.gameMs`; tickDrive slices and DriveScene read the shared cache.
- **Prevention:** `scenePerfGuards.test.ts` asserts DriveScene uses `trafficForDrive()` and not direct `trafficCars` in `update`.

### Coarse DPR×3 text canvas upload on first show

- **Date:** 2026-09-11
- **Symptom:** after #39 removed clamp-fit search cost, first walk-in bubble, Grabbing… toast, and ID card fields still showed a one-frame upload hitch on phone PWAs (DPR 3).
- **Cause:** `typeResolution` used full `devicePixelRatio` — a speech chip's first `updateText()` allocated a 3× backing store. Pooled customer bubbles and ID fields started empty, so boot did not pay the raster until gameplay.
- **Fix:** cap final `typeResolution` at 3 on `(pointer: coarse)` (desktop keeps 4–8); boot-warm customer pool bubbles with sample copy under the loading gate; ID card template strings rasterize at Hud create.
- **Prevention:** `typekit.test.ts` asserts coarse DPR 3 → resolution ≤3; shop pool `warmCustomerSpeech` guarded by boot warm tests.

### Coarse mid-tier boot freeze — blue shell (#1b2238)

- **Date:** 2026-09-15
- **Symptom:** on coarse-pointer phones (mid tier 0.85), the canvas stayed shell blue after load; side rails looked oversized because the 16:9 stage never painted. Game loop stuck at ~frame 11; only `boot` scene active.
- **Cause:** Phase 5 `registerTypeAtlas()` ran inside `BootScene.runBootWarm` while GPU texture flush / shop warm was in flight. The atlas canvas upload blocked the loop on coarse mid tier. A secondary hazard was `applyRenderScale(0.85)` on `Phaser.Core.Events.READY` resizing the backbuffer before boot warm finished.
- **Fix:** defer `registerTypeAtlas` to `TitleScene.create` (after boot warm); gate mid-tier `scale.resize` + world camera zoom at 1 until Title via `bootRenderGate.ts`; stamp shop static bakes at camera zoom 1 (Door #119 pattern); `forceBootExit` wall-clock watchdog so a Door-stall never orphans the loading gate; narrow portrait gates even when Chrome omits `(pointer: coarse)`. **Stage fit (current):** shell always uses `contain` so wide phone landscape (844×390) pillarboxes with Shift/Kindling side rails instead of `width-fill` vertical crop that read as zoomed-in.
- **Prevention:** `bootResidency.test.ts` + `typeAtlas.test.ts` source-scan boot vs title registration; `renderBudget.test.ts` boot render gate; `shell.test.ts` asserts contain+rails on 844×390; device-toolbar capture (mobile metrics, no touch emulation).

### Drive city bake misaligned with van/grid (Door #119 class)

- **Date:** 2026-09-18
- **Symptom:** delivery map roads/lots looked shifted off the grid relative to the van, pin, and traffic — same class of misalignment as the doorstep house facade.
- **Cause:** `bakeStaticCityMap` allocated cells with `bakeCellDimension` + `configureSceneBakeRT` (RT camera zoom = mid `renderScale`). `batchDraw` also inherited the live scene camera zoom, so static ground drifted vs live sprites in world coords.
- **Fix:** stamp each ≤2048px cell at full design size with scene + RT camera zoom 1 and scroll `(x,y)`; keep cell tiling for max-texture-size. Matches Door/Shop zoom-1 bake.
- **Prevention:** `scenePerfGuards.test.ts` + `driveScene.test.ts` assert design-size Drive bake and forbid `bakeCellDimension` / `configureSceneBakeRT` on that path.

---

## Size / speed / readability plan — closed (2026-09-15)

**Purpose:** measurement procedure, inventories, and contract guards for the phased perf/readability plan — **not** a failure entry. Baseline tables: [operational/perf-baseline-phase0.md](operational/perf-baseline-phase0.md). Phase scans: [operational/perf-phase6-scans.md](operational/perf-phase6-scans.md). Plan: [plans/2026-09-15-size-speed-readability.md](plans/2026-09-15-size-speed-readability.md).

### Meter checklist (`?meter=1`)

| # | Scenario | What to record |
|---|----------|----------------|
| A | Idle Shop | fps, p95, tier, renderScale, **`resize× === 0`** on coarse after boot |
| B | Tap strain | TV jar click — p95 spike; `kindlingPerfProbe.sample()` setText / upload counts |
| C | Hit the road | Depart frame p95 |
| D | First door | Door prompt + HUD readout column |
| E | How-to / Title | HUD hidden under title/how-to |

Hooks: `feelMeter.ts` overlay, `kindlingClock.stats()`, `kindlingRenderBudget.resizeCount()`, `kindlingPerfProbe.sample()`.

### Phase status (ShiftGame PRs #112–#117 + Phase 6)

| Phase | Status | PR | Exit |
|-------|--------|-----|------|
| **0 — Baseline** | Shipped | [#112](https://github.com/XylarDark/ShiftGame/pull/112) | Meter checklist + bake/Text inventory + gate confirm |
| **1 — Correctness** | Shipped | [#113](https://github.com/XylarDark/ShiftGame/pull/113) | Title/HUD/dropoff source guards |
| **2 — Type** | Shipped | [#114](https://github.com/XylarDark/ShiftGame/pull/114) | Role-token setText without clamp-fit hitch |
| **3 — VRAM** | Shipped | [#115](https://github.com/XylarDark/ShiftGame/pull/115) | Scene bakes at render tier |
| **4 — Boot** | Shipped | [#116](https://github.com/XylarDark/ShiftGame/pull/116) | Boot warm residency + title pass-through |
| **5 — Atlas** | Shipped | [#117](https://github.com/XylarDark/ShiftGame/pull/117) | Coarse phone BitmapText atlas for HUD roles |
| **6 — Scans** | Shipped | *(Phase 6 PR)* | `phase6Guards.test.ts` + this table |

**Contracts enforced by Phase 6 scans:** no `snapshot(` on `pointerdown`; no `rawDelta` in `src/sim/**`; coarse `sessionTierLocked` (no mid-session `scale.resize`; mid **0.85**, not 0.45/0.32); no `throw` in `layoutPlaque`. Pages CI: `npm test` + `npm run build` + `npm run build:embed` → `dist/` + `dist/embed/`.

If Title/HUD leak or dropoff skip regresses, fix under the correctness guards — do not mix into unrelated PRs.

---

## Related

- [AGENTS.md](../AGENTS.md) — operational protocol and definition of done
- [operational/automation-gaps.md](operational/automation-gaps.md) — what automation cannot do reliably
- [operational/perf-baseline-phase0.md](operational/perf-baseline-phase0.md) — Phase 0 meter checklist, bake/Text inventory, gate status
- [.cursor/rules/05-error-handling.mdc](../.cursor/rules/05-error-handling.mdc) — defensive coding and where to record errors
