<script lang="ts">
	import { untrack } from "svelte";

	import {
		aimAngle,
		CANNON_BASE_RATIO,
		cannonLength,
		clampStageWidth,
		createBall,
		createWorld,
		FIXED_DT,
		launchVelocity,
		MAX_BALLS,
		muzzle,
		predictLanding,
		predictPath,
		railRange,
		sandboxWorld,
		stageOffset,
		stepAll,
		wedgeGeometry,
		type Ball,
		type Obstacle,
		type World
	} from "$lib/physics";
	import { apparatus } from "$lib/stores/apparatus.svelte";
	import { addBall, balls, nextSlot, projectEntered, removeBall, slotFor } from "$lib/stores/balls";
	import { charset, syncCharset } from "$lib/stores/charset.svelte";
	import { game, newTarget, PIN_LENGTH } from "$lib/stores/game.svelte";
	import { hover } from "$lib/stores/hover.svelte";
	import { pegs } from "$lib/stores/pegs.svelte";
	import { FIRE_BAR_HEIGHT, touch } from "$lib/stores/touch.svelte";

	const DOME_FILL = "#fff";
	const WEDGE_FILL = "#fff"; // the win-screen funnel ramps
	const OBSTACLE_FILL = "#fff";
	const LETTER_FILL = "rgba(255, 255, 255, 0.7)";
	const LETTER_GREEN = "rgba(74, 222, 128, 0.95)"; // the target letter when the aim is on it
	const BALL_FILL = "#e5e5e5";
	const TRAJECTORY_RGB = "255, 70, 70";
	const TRAJECTORY_GREEN = "74, 222, 128"; // preview + slot go green when the shot lands on target
	const TRAJECTORY_ALPHA = 0.55;
	const TRAJECTORY_DASH_SPEED = 12; // px/sec the dots pan toward the target
	const PEG_LINE = "rgba(255, 255, 255, 0.3)";
	const EDGE_LINE = "rgba(255, 255, 255, 0.2)"; // light gray border at the stage edges
	const SANDBOX_SPAWN_MS = 120; // win-screen auto-stream cadence (~8 balls/sec)

	let canvas: HTMLCanvasElement;

	// the light gray borders marking the left/right edges of the (capped) play area
	const drawEdges = (ctx: CanvasRenderingContext2D, world: World): void => {
		ctx.fillStyle = EDGE_LINE;
		ctx.fillRect(0, 0, 2, world.height);
		ctx.fillRect(world.width - 2, 0, 2, world.height);
		// on touch the floor is raised to make room for the Fire button; close off
		// the play area with a matching border along the bottom, above the button
		if (touch.coarse) ctx.fillRect(0, world.height - 2, world.width, 2);
	};

	// red aim preview: the deterministic path a ball fired now would trace through
	// its first 3 bounces, as marching dots that fade out near the end
	const drawTrajectory = (
		ctx: CanvasRenderingContext2D,
		world: World,
		time: number,
		correct: boolean,
		collideWorld: World,
		blockers: Obstacle[]
	): void => {
		const rgb = correct ? TRAJECTORY_GREEN : TRAJECTORY_RGB;
		const m = muzzle(apparatus.x, world.cupWidth, apparatus.angle);
		const vel = launchVelocity(apparatus.angle);
		// the guideline is predicted against whichever world is live — the play
		// board, or the win-screen funnel — plus the resting balls as blockers, so
		// it bends around the existing pile and matches what's drawn
		const path = predictPath(collideWorld, m.x, m.y, vel.x, vel.y, 3, blockers);
		if (path.length < 2) return;

		// cumulative distance along the path (so dashes stay continuous across
		// segments and the tail can fade by distance rather than by point index)
		const dist = [0];
		for (let i = 1; i < path.length; i++) {
			dist[i] = dist[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
		}
		const total = dist[path.length - 1];
		if (total === 0) return;

		const fadeStart = total * 0.75; // last quarter fades to nothing
		const march = (time / 1000) * TRAJECTORY_DASH_SPEED;

		ctx.lineWidth = 2;
		ctx.setLineDash([6, 6]);
		for (let i = 1; i < path.length; i++) {
			const mid = (dist[i - 1] + dist[i]) / 2;
			const fade = mid <= fadeStart ? 1 : Math.max(0, 1 - (mid - fadeStart) / (total - fadeStart));
			ctx.strokeStyle = `rgba(${rgb}, ${TRAJECTORY_ALPHA * fade})`;
			ctx.lineDashOffset = dist[i - 1] - march; // continuous pattern, panning toward target
			ctx.beginPath();
			ctx.moveTo(path[i - 1].x, path[i - 1].y);
			ctx.lineTo(path[i].x, path[i].y);
			ctx.stroke();
		}
		ctx.setLineDash([]); // don't dash everything drawn afterward
	};

	// the white humps between cups — each is a filled upper half-disk on the floor
	const drawDomes = (ctx: CanvasRenderingContext2D, world: World): void => {
		ctx.fillStyle = DOME_FILL;
		for (const dome of world.domes) {
			ctx.beginPath();
			ctx.arc(dome.center.x, dome.center.y, dome.radius, Math.PI, 0, false);
			ctx.fill();
		}
	};

	// a soft green glow rising out of the target slot when the current aim would
	// land the ball there — drawn under the domes so it reads as light coming up
	// through the slot opening, with a gentle breathing pulse
	const drawSlotGlow = (
		ctx: CanvasRenderingContext2D,
		world: World,
		centerX: number,
		time: number
	): void => {
		const cy = world.height; // the floor — glow rises up out of the slot opening
		const r = world.domeRadius * 1.3; // concentrated to the opening, not the whole cup
		const pulse = 0.16 + 0.06 * Math.sin(time / 350);
		const g = ctx.createRadialGradient(centerX, cy, 0, centerX, cy, r);
		g.addColorStop(0, `rgba(${TRAJECTORY_GREEN}, ${pulse})`);
		g.addColorStop(1, `rgba(${TRAJECTORY_GREEN}, 0)`);
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.arc(centerX, cy, r, 0, Math.PI * 2);
		ctx.fill();
	};

	// the win-screen funnel: two mirrored solid wedges angling down to the center
	// drain gap (the ramp surfaces are the colliders; this just fills them in)
	const drawWedges = (ctx: CanvasRenderingContext2D, world: World): void => {
		const w = wedgeGeometry(world.width, world.height);
		ctx.fillStyle = WEDGE_FILL;
		ctx.beginPath();
		ctx.moveTo(0, w.topY);
		ctx.lineTo(w.gapLeftX, w.floorY);
		ctx.lineTo(0, w.floorY);
		ctx.closePath();
		ctx.fill();
		ctx.beginPath();
		ctx.moveTo(world.width, w.topY);
		ctx.lineTo(w.gapRightX, w.floorY);
		ctx.lineTo(world.width, w.floorY);
		ctx.closePath();
		ctx.fill();
	};

	// the draggable plinko row: a thin gray line spanning the screen (to the edge
	// handles) with the white pegs riding on it
	const drawPegRow = (ctx: CanvasRenderingContext2D, world: World): void => {
		ctx.strokeStyle = PEG_LINE;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(0, pegs.y);
		ctx.lineTo(world.width, pegs.y);
		ctx.stroke();

		ctx.fillStyle = OBSTACLE_FILL;
		for (const o of world.obstacles) {
			ctx.beginPath();
			ctx.arc(o.center.x, o.center.y, o.radius, 0, Math.PI * 2);
			ctx.fill();
		}
	};

	// Keep the peg row inside its travel range and push the result into the
	// physics. Recomputed every frame, so window resizes are handled for free:
	//   lowest  (largest y)  = the resting/default spot (letterY − one mound)
	//   highest (smallest y) = the same clearance the resting row has above the
	//                          mound tops, measured down from the apparatus mouth
	const positionPegRow = (world: World): void => {
		// reference the cannon's straight-down reach (fixed) so the rail's range
		// doesn't shift as the cannon aims
		const reach = cannonLength(world.cupWidth);
		const { lowest, highest } = railRange(world.letterY, world.domeRadius, reach);
		pegs.min = lowest;
		pegs.max = highest;
		if (pegs.y === 0) pegs.y = lowest; // start at rest
		pegs.y = Math.min(lowest, Math.max(highest, pegs.y));
	};

	// the letters sit in the catch slots between the domes
	const drawLetters = (ctx: CanvasRenderingContext2D, world: World, glowX: number | null): void => {
		ctx.font = "14px system-ui, sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		for (const cup of world.cups) {
			ctx.fillStyle = cup.centerX === glowX ? LETTER_GREEN : LETTER_FILL;
			ctx.fillText(cup.letter, cup.centerX, world.letterY);
		}
	};

	const drawBall = (ctx: CanvasRenderingContext2D, ball: Ball): void => {
		ctx.beginPath();
		ctx.fillStyle = BALL_FILL;
		ctx.arc(ball.pos.x, ball.pos.y, ball.radius, 0, Math.PI * 2);
		ctx.fill();
	};

	$effect(() => {
		const ctx = canvas.getContext("2d")!;
		let world!: World;
		let sandbox!: World; // win-screen funnel world, rebuilt on resize alongside `world`
		let stageX = 0; // left offset of the centered play area within the window

		// Size/position the canvas to the (width-capped, centered) play area and
		// the device pixel ratio so the drawing stays crisp, then rebuild the cup
		// geometry for the new size.
		const resize = (): void => {
			const dpr = window.devicePixelRatio || 1;
			// on touch, reserve a bottom band for the Fire button by raising the floor:
			// the play area is the window minus that band, so the button sits isolated
			// below the cups (createWorld derives the whole board from this height)
			const h = window.innerHeight - (touch.coarse ? FIRE_BAR_HEIGHT : 0);
			const sw = clampStageWidth(window.innerWidth);
			stageX = stageOffset(window.innerWidth);
			canvas.width = sw * dpr;
			canvas.height = h * dpr;
			canvas.style.width = `${sw}px`;
			canvas.style.height = `${h}px`;
			canvas.style.left = `${stageX}px`;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			// when a breakpoint is crossed, swap the value set (board rebuilds below)
			// and pick a fresh target — but keep the balls and progress in play
			if (syncCharset(sw)) newTarget();
			world = createWorld(sw, h, charset.values);
			sandbox = sandboxWorld(sw, h);
			// cannon pan position: center on first run, otherwise keep it on-stage
			const margin = world.cupWidth * CANNON_BASE_RATIO;
			apparatus.x =
				apparatus.x === 0 ? sw / 2 : Math.min(Math.max(apparatus.x, margin), sw - margin);
			// snap the rebuilt pegs to the rail's current spot so the next frame
			// doesn't sweep them up from the default position
			if (pegs.y > 0) for (const o of world.obstacles) o.center.y = pegs.y;
			// Pull balls back inside the resized viewport before re-settling — a
			// height shrink moves the floor up, and any ball left below it would
			// fall off-screen and vanish.
			for (const ball of balls) {
				ball.pos.x = Math.max(ball.radius, Math.min(sw - ball.radius, ball.pos.x));
				ball.pos.y = Math.max(ball.radius, Math.min(h - ball.radius, ball.pos.y));
				ball.resting = false; // re-settle into moved cups
			}
		};
		// untracked so this render effect doesn't re-run when the charset swaps —
		// the resize handler already rebuilds the world on a crossing
		untrack(resize);
		// re-lay out if the device's touch capability flips (mouse plugged in,
		// devtools emulation toggled) so the reserved Fire-button band appears/clears
		$effect(() => {
			touch.coarse;
			untrack(resize);
		});

		// which letter slot a settled ball came to rest in
		const slotLetterAt = (x: number): string => {
			const i = Math.max(0, Math.min(world.cups.length - 1, Math.floor(x / world.cupWidth)));
			return world.cups[i].letter;
		};

		let last = 0;
		let raf = 0;
		let acc = 0; // leftover time, advanced in fixed steps
		let lastSpawn = 0; // timestamp of the last win-screen auto-stream ball
		const frame = (time: number): void => {
			const dt = last ? Math.min((time - last) / 1000, 1 / 30) : 0;
			last = time;

			const playing = game.status === "playing";
			const inSandbox = game.status === "success";
			// Which world the sim + guideline collide against: the play board; the
			// win-screen funnel (wedges draining through a center gap); or, on a loss,
			// a plain bare floor.
			const simWorld = playing
				? world
				: inSandbox
					? sandbox
					: { ...world, domes: [], obstacles: [] };

			if (playing) positionPegRow(world); // clamp the draggable row's target
			// Advance the sim in fixed steps so it's frame-rate independent and
			// repeatable — this is what makes the ball follow the preview path. In the
			// sandbox, rest detection is off (`settle: false`) so balls keep flowing
			// down the shallow ramps and drain instead of settling into a locked pile.
			acc += dt;
			while (acc >= FIXED_DT) {
				const pegFromY = world.obstacles.length ? world.obstacles[0].center.y : pegs.y;
				stepAll(balls, simWorld, FIXED_DT, pegFromY, playing ? pegs.y : pegFromY, !inSandbox);
				acc -= FIXED_DT;
			}
			if (inSandbox) {
				// the win sandbox runs itself: the barrel is locked straight down (no
				// aiming) and pours a steady stream from the (still-pannable) cannon
				if (apparatus.angle !== 0) apparatus.angle = 0;
				if (time - lastSpawn >= SANDBOX_SPAWN_MS && balls.length < MAX_BALLS) {
					const m = muzzle(apparatus.x, world.cupWidth, 0);
					const vel = launchVelocity(0);
					balls.push(createBall(m.x, m.y, vel.x, vel.y));
					lastSpawn = time;
				}
				// drain: a ball that has fallen through the center gap and off the
				// bottom is wiped, which keeps the on-screen count self-limiting
				for (let k = balls.length - 1; k >= 0; k--) {
					if (balls[k].pos.y - balls[k].radius > world.height) balls.splice(k, 1);
				}
			}

			// resting balls are immovable circles for the predictors, so the guideline
			// and green indicator bend around / settle on the existing pile (only in
			// play — moving balls are left out, and there are none to read on a loss)
			const blockers: Obstacle[] = playing
				? balls
						.filter((b) => b.resting)
						.map((b) => ({ center: { x: b.pos.x, y: b.pos.y }, radius: b.radius }))
				: [];

			let glowX: number | null = null;
			if (playing) {
				// Project each resting ball onto the pin input it owns. Done live, so a
				// ball that re-settles in a new slot — from a resize bump, or after a
				// removal wakes the pile — updates its own input without changing which
				// input it owns. `game.dropped` is the slot the *next* ball will fill (a
				// freed one if you've removed a ball), or PIN_LENGTH when full.
				const entered = projectEntered(PIN_LENGTH, slotLetterAt);
				for (let i = 0; i < PIN_LENGTH; i++) {
					if (game.entered[i] !== entered[i]) game.entered[i] = entered[i];
				}
				const next = nextSlot(PIN_LENGTH) ?? PIN_LENGTH;
				if (game.dropped !== next) game.dropped = next;

				// Predicted landing for the current aim (lone ball, empty board). When
				// it matches the next required letter, the preview goes green and the
				// target slot glows — turning aiming into a deterministic skill.
				if (game.dropped < PIN_LENGTH) {
					const m = muzzle(apparatus.x, world.cupWidth, apparatus.angle);
					const vel = launchVelocity(apparatus.angle);
					const idx = predictLanding(world, m.x, m.y, vel.x, vel.y, blockers);
					if (idx !== null && world.cups[idx].letter === game.target[game.dropped]) {
						glowX = world.cups[idx].centerX;
					}
				}
			}

			ctx.clearRect(0, 0, world.width, world.height);
			if (glowX !== null) drawSlotGlow(ctx, world, glowX, time);
			// the win/lose screen clears the playfield — only the cannon's aim
			// guideline (and the stage frame) stay alongside the result message
			if (playing) {
				drawDomes(ctx, world);
				drawPegRow(ctx, world);
			} else if (inSandbox) {
				drawWedges(ctx, world);
			}
			drawTrajectory(ctx, world, time, glowX !== null, simWorld, blockers);
			if (playing) drawLetters(ctx, world, glowX);
			// balls render during play and in the win-screen sandbox (hidden on a loss)
			if (game.status !== "failure") for (const ball of balls) drawBall(ctx, ball);
			drawEdges(ctx, world);

			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);

		// fire a ball from the muzzle along the current aim
		const fire = (): void => {
			if (game.status !== "playing") return; // win/lose: no manual release
			const m = muzzle(apparatus.x, world.cupWidth, apparatus.angle);
			const vel = launchVelocity(apparatus.angle);
			addBall(createBall(m.x, m.y, vel.x, vel.y), PIN_LENGTH); // no-op when full
		};

		// Pan + aim: while idle the cannon pans to follow the pointer (angle 0). On
		// press it locks its position and the drag aims toward the pointer
		// (±MAX_AIM); release fires. pointerdown is on the canvas so the DOM
		// cannon/handles/buttons above it keep their own gestures; move/up are on
		// the window so a drag continues off the canvas.
		let aiming = false;
		const stageX2 = (clientX: number): number => clientX - stageX; // window → stage coords

		// topmost resting ball under a stage-space point (later balls draw on top).
		// `slop` pads the hit radius — a fingertip needs a far bigger target than a
		// mouse cursor, so touch presses get a generous one (see onPointerDown).
		const restingBallAt = (sx: number, sy: number, slop = 2): Ball | null => {
			for (let k = balls.length - 1; k >= 0; k--) {
				const b = balls[k];
				if (b.resting && Math.hypot(b.pos.x - sx, b.pos.y - sy) <= b.radius + slop) return b;
			}
			return null;
		};

		const onPointerDown = (e: PointerEvent): void => {
			// win/lose screens have no manual release or aiming — only panning (which
			// happens on move). During play: click a resting ball to remove it, else aim.
			if (game.status !== "playing" || apparatus.panning) return;
			// fingertips are imprecise, so touch gets a much larger tap target than a mouse
			const slop = e.pointerType === "touch" ? 16 : 2;
			const hit = restingBallAt(stageX2(e.clientX), e.clientY, slop);
			if (hit) {
				removeBall(hit);
				hover.slot = -1;
				return;
			}
			aiming = true;
			hover.slot = -1;
			apparatus.angle = aimAngle(stageX2(e.clientX), e.clientY, apparatus.x);
		};
		const onPointerMove = (e: PointerEvent): void => {
			if (aiming) {
				apparatus.angle = aimAngle(stageX2(e.clientX), e.clientY, apparatus.x);
				return;
			}
			// the top-panel owns the cannon while it's being grabbed — don't hover-pan over it
			if (pegs.dragging || apparatus.panning) return;
			// hover-pan + hover-highlight are mouse-only: on touch there's no hover, so a
			// stray move during a tap must not yank the cannon (it's moved via the handle)
			if (e.pointerType !== "mouse") return;
			const sx = stageX2(e.clientX);
			if (game.status === "playing") {
				// hover a resting ball → highlight the input it owns
				const hit = restingBallAt(sx, e.clientY);
				hover.slot = hit ? (slotFor(hit) ?? -1) : -1;
				canvas.style.cursor = hit ? "pointer" : "";
			}
			// pan the cannon to follow the pointer
			const margin = world.cupWidth * CANNON_BASE_RATIO;
			apparatus.x = Math.min(Math.max(sx, margin), world.width - margin);
			apparatus.angle = 0;
		};
		const onPointerUp = (e: PointerEvent): void => {
			if (!aiming) return;
			aiming = false;
			// Touch decouples aim from fire and keeps the aim from the last drag move:
			// reading the release point here would let the finger's lift-off wobble nudge
			// the angle (the precision-killer on mobile), so leave it untouched — the arc
			// preview stays put and the Fire button launches it. Desktop fires on release.
			if (touch.coarse) return;
			apparatus.angle = aimAngle(stageX2(e.clientX), e.clientY, apparatus.x);
			fire();
			apparatus.angle = 0; // back to straight-down while panning resumes
		};
		// a gesture the browser/OS takes over (second finger, system swipe) cancels
		// the aim without firing — just drop back to idle so the cannon isn't stuck
		const onPointerCancel = (): void => {
			if (!aiming) return;
			aiming = false;
			apparatus.angle = 0;
		};

		window.addEventListener("resize", resize);
		canvas.addEventListener("pointerdown", onPointerDown);
		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerUp);
		window.addEventListener("pointercancel", onPointerCancel);

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("resize", resize);
			canvas.removeEventListener("pointerdown", onPointerDown);
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
			window.removeEventListener("pointercancel", onPointerCancel);
		};
	});
</script>

<!-- the canvas IS the play area: width-capped and centered (left/size set in resize).
	 touch-none stops the browser from claiming a press-drag as a scroll/zoom gesture
	 (which would fire pointercancel and kill the aim drag on touch devices) -->
<canvas bind:this={canvas} class="fixed top-0 left-0 touch-none"></canvas>
