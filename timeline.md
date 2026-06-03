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

---

**Throughline:** most decisions chased **"skill, not luck"** (fixed-width slots,
deterministic preview, drop-order inputs, angle aiming) and **screen-independent
behavior** (fixed timestep, fixed slot width, responsive value sets, the
too-small guards).
