# pinko — build timeline

The main steps and decision points in building the game, start to finish. Since
several early features were replaced along the way, this reflects the real arc
of decisions rather than every micro-edit.

## 1. Scaffold & first UI

- Started from a Svelte 5 + Vite boilerplate; added **Tailwind v4** (3-point
  wiring: vite plugin, `@import`, config).
- Built a lowercase alphabet rail with dividers; iterated on borders, then moved
  it to the **bottom** as a row of rounded "cups."
- Added a draggable "apparatus" (the cannon) following the mouse along the top.

## 2. Physics decision

- Talked through feasibility of a bouncing ball. **Decision:** hand-written
  deterministic 2D physics on a **canvas** (one source of truth for geometry +
  rendering), not a library — scope was one ball + static shapes.
- Moved cups/letters/ball onto the canvas; wrote `physics.ts` (vectors → shapes
  → collision → step) with sub-stepping to prevent tunneling.

## 3. From bowls to pachinko (the core design pivot)

- Click-to-drop balls from the apparatus; release point shared via a store.
- Noticed it wasn't skill-based — the concave **bowl was a stable well** that
  re-centered any ball, and the "straight" zone scaled with screen size.
  **Decision:** flip it — **convex domes between cups, narrow catch slots**,
  with slot width a **fixed pixel constant** so difficulty is identical on
  every screen.

## 4. Settle detection (debugging arc)

- Letter registered 5–10s late. A first fix introduced a bug (balls sleeping
  mid-air / frozen on dome sides). **Root cause:** tying "stopped" to
  velocity/contact frames in a chaotic system.
- **Decision:** detect rest by **position stillness + resting on flat-enough
  support** (`REST_FLATNESS`), independent of bounciness. Later made the whole
  sim **fixed-timestep** so it's frame-rate-independent and repeatable.

## 5. The game layer

- Random **target pin** + 6 slots; **submit button** — explicitly _not_
  auto-complete (Enter or click).
- **Decision:** inputs bind to **drop order, projected live** from each ball's
  current resting slot — so settle order doesn't matter and a ball bumped to a
  new slot (even by a resize) updates fairly. Capped balls to pin length. Added
  hint + "new pin."

## 6. Skill tools & obstacles

- Added floating **pegs** above each slot (harder).
- **Draggable peg rail** with grip handles, clamped travel, grab cursors.
- **Trajectory preview** (red dotted, first N bounces) — feasible _because_ the
  sim is deterministic; added marching dots + fade. Fixed a fast-drag
  **clipping** bug by making the rail a **swept collider**.
- Ball-to-ball collisions (resting balls immovable).

## 7. Responsiveness & guards

- Breakpoint-based value sets: **a–z / a–r / 0–9 / 0–5** (3xl/xl/md).
  **Decision:** crossing a breakpoint swaps the board + target but **keeps the
  balls** (only "new pin" fully resets).
- **Screen-too-small** message (360w / 500h + a geometric "cannon tip meets the
  rail" cutoff). **Decision:** isolate game state into a `balls` module so the
  too-small screen can unmount/**freeze and resume** without losing anything.

## 8. Ship it

- Extracted from the monorepo into a standalone **bun** repo, deps updated,
  Prettier set up, pushed to a private GitHub repo as subsystem-sliced commits.

## 9. Pivoting cannon — pan + aim

- Reworked the cannon from a horizontally-sliding dispenser into a smaller
  **barrel that pivots on a semicircle base**.
- **Decision (control scheme):** kept the **hover-to-pan** positioning and added
  aiming on top — while idle the cannon pans to follow the pointer (barrel
  straight down); on **press** it locks its position and the drag **aims toward
  the pointer** (clamped to ±45°); **release fires**, then it snaps back to
  straight-down and resumes panning. (Considered a fixed-center aim-only model
  first, but that only reaches a cone — keeping pan preserves full-width reach.)
- Balls now **launch** along the aim with an initial velocity (not just drop);
  the deterministic **trajectory preview bends to match for free**.
- `aimAngle`/`muzzle` take the live pivot X so the cannon can fire from anywhere
  across the top; pan is gated off the rail drag; rail range + too-small check
  reference the cannon's fixed straight-down reach so they don't shift while
  aiming. Tunables: `LAUNCH_SPEED`, `MAX_AIM`, `CANNON_*_RATIO`.
- Known gap: panning relies on mouse hover, so **touch can't pan** before
  pressing (no hover events) — a press aims from the cannon's last spot.

## 10. Width-capped stage (replaces the apparatus guard)

- Bug: fast resizes triggered a false **"screen too small"** that then stuck,
  even after resizing back. **Root cause:** the apparatus-vs-rail geometric
  check keyed off the charset count, which goes stale while the scene is
  unmounted — once tripped it stayed tripped.
- **Decision:** drop that check entirely and instead **cap the play area to
  2560px wide, centered**, with a light-gray border on each edge. Capping bounds
  `cupWidth`/cannon size, so the ultra-wide "cannon dips below the rail" exploit
  can't happen — which makes the plain `width < 360 || height < 500` check the
  only "too small" guard needed (and it uses live values, so it can't stick).
- The canvas itself is the stage (sized to `min(innerWidth, 2560)`, offset to
  center); pointer math, the cannon position, and the peg-rail handles are all
  shifted by the stage offset. Tunable: `STAGE_MAX_WIDTH`.

## 11. Skill legibility — the green guideline (and the power meter that wasn't)

- Diagnosed why it _felt_ like luck: the sim is deterministic, but a chaotic peg
  field isn't **legible** — a human can't predict a multi-bounce path, so aiming
  was guessing. **Reframe:** determinism ≠ skill; skill needs _legibility_
  (predict the outcome) + _control_ (choose the input that gets it).
- **Decision:** make the outcome legible. Added `predictLanding` — a lone ghost
  ball run to rest with the real step/settle logic — and when its predicted slot
  matches the next required letter, the aim guideline turns **green**, a soft
  glow rises out of that slot opening, and the target letter greens. (Balls
  already in play are ignored on purpose — reading around them is the player's
  skill.)
- Considered a **power meter** (angle + oscillating "stop the bar" power) as a
  second axis. **Measured it first:** swept launch power across the range on the
  real board — straight-down ignores power entirely, and every angled shot
  scattered into ~565 fragments, median band **2 px/s** (≈2 ms visible per meter
  pass vs ~250 ms human reaction). **Decision:** drop it — on a peg-over-every-
  slot board the power→slot map is chaos, so a meter is "luck with extra steps."
  That same chaos is _why_ the green preview is right: let the machine predict
  what the human can't, and make **finding and holding a green aim** the skill (a
  direct control you can hold — fitting the "frustrating but fair" identity). The
  draggable rail remains the legitimate second axis.

## 12. Editable drops — click to remove, clearer inputs

- **Click a resting ball to remove it**, freeing its pin slot; the next ball
  refills that slot, reused **LIFO** (last removed → next refilled), and removing
  the last ball resets the ordering. **Decision:** decouple a ball's input
  binding from its position in the physics array — ownership lives in a
  `Map<Ball, number>` keyed by ball identity (+ a freed-slot stack), so splicing
  one out never re-binds another's input. A removal wakes the pile so anything
  stacked on the gone ball re-settles fairly.
- **Hover a ball** to highlight the input it owns (a subtle bg tint), making the
  otherwise-invisible drop-order binding legible. (Considered click-to-clear on
  the inputs too, but it tangled with the live projection — dropped it.)
- Inputs go **green when correct** (right letter, right place); the **submit**
  button restyled from emerald to a faint input-shaped cell that fills solid
  white with a black arrow once every slot is settled.

---

**Throughline:** most decisions chased **"skill, not luck"** (fixed-width slots,
deterministic preview, drop-order inputs, angle aiming, the green legibility
preview, editable drops) and **screen-independent behavior** (fixed timestep,
fixed slot width, responsive value sets, the too-small guards) — with a standing
habit of **measuring before committing** (the power-meter band sweep).
