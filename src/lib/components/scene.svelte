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
		muzzle,
		predictLanding,
		predictPath,
		railRange,
		stageOffset,
		stepAll,
		type Ball,
		type World
	} from "$lib/physics";
	import { apparatus } from "$lib/stores/apparatus.svelte";
	import { addBall, balls, nextSlot, projectEntered, removeBall, slotFor } from "$lib/stores/balls";
	import { charset, syncCharset } from "$lib/stores/charset.svelte";
	import { game, newTarget, PIN_LENGTH } from "$lib/stores/game.svelte";
	import { hover } from "$lib/stores/hover.svelte";
	import { pegs } from "$lib/stores/pegs.svelte";

	const DOME_FILL = "#fff";
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

	let canvas: HTMLCanvasElement;

	// the light gray borders marking the left/right edges of the (capped) play area
	const drawEdges = (ctx: CanvasRenderingContext2D, world: World): void => {
		ctx.fillStyle = EDGE_LINE;
		ctx.fillRect(0, 0, 2, world.height);
		ctx.fillRect(world.width - 2, 0, 2, world.height);
	};

	// red aim preview: the deterministic path a ball fired now would trace through
	// its first 3 bounces, as marching dots that fade out near the end
	const drawTrajectory = (
		ctx: CanvasRenderingContext2D,
		world: World,
		time: number,
		correct: boolean
	): void => {
		const rgb = correct ? TRAJECTORY_GREEN : TRAJECTORY_RGB;
		const m = muzzle(apparatus.x, world.cupWidth, apparatus.angle);
		const vel = launchVelocity(apparatus.angle);
		const path = predictPath(world, m.x, m.y, vel.x, vel.y, 3);
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
		let stageX = 0; // left offset of the centered play area within the window

		// Size/position the canvas to the (width-capped, centered) play area and
		// the device pixel ratio so the drawing stays crisp, then rebuild the cup
		// geometry for the new size.
		const resize = (): void => {
			const dpr = window.devicePixelRatio || 1;
			const h = window.innerHeight;
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

		// which letter slot a settled ball came to rest in
		const slotLetterAt = (x: number): string => {
			const i = Math.max(0, Math.min(world.cups.length - 1, Math.floor(x / world.cupWidth)));
			return world.cups[i].letter;
		};

		let last = 0;
		let raf = 0;
		let acc = 0; // leftover time, advanced in fixed steps
		const frame = (time: number): void => {
			const dt = last ? Math.min((time - last) / 1000, 1 / 30) : 0;
			last = time;

			positionPegRow(world); // clamp the draggable row's target
			// Advance the sim in fixed steps so it's frame-rate independent and
			// repeatable — this is what makes the ball follow the preview path.
			// Each step sweeps the pegs from where they are toward the target, so a
			// fast drag still can't clip a ball.
			acc += dt;
			while (acc >= FIXED_DT) {
				const pegFromY = world.obstacles.length ? world.obstacles[0].center.y : pegs.y;
				stepAll(balls, world, FIXED_DT, pegFromY, pegs.y);
				acc -= FIXED_DT;
			}
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

			// Predicted landing for the current aim (lone ball, empty board). When it
			// matches the next required letter, the preview goes green and the target
			// slot glows — turning aiming into a deterministic, readable skill.
			let glowX: number | null = null;
			if (game.status === "playing" && game.dropped < PIN_LENGTH) {
				const m = muzzle(apparatus.x, world.cupWidth, apparatus.angle);
				const vel = launchVelocity(apparatus.angle);
				const idx = predictLanding(world, m.x, m.y, vel.x, vel.y);
				if (idx !== null && world.cups[idx].letter === game.target[game.dropped]) {
					glowX = world.cups[idx].centerX;
				}
			}

			ctx.clearRect(0, 0, world.width, world.height);
			if (glowX !== null) drawSlotGlow(ctx, world, glowX, time);
			drawDomes(ctx, world);
			drawPegRow(ctx, world);
			drawTrajectory(ctx, world, time, glowX !== null);
			drawLetters(ctx, world, glowX);
			for (const ball of balls) drawBall(ctx, ball);
			drawEdges(ctx, world);

			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);

		// fire a ball from the muzzle along the current aim
		const fire = (): void => {
			if (game.status !== "playing") return;
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

		// topmost resting ball under a stage-space point (later balls draw on top)
		const restingBallAt = (sx: number, sy: number): Ball | null => {
			for (let k = balls.length - 1; k >= 0; k--) {
				const b = balls[k];
				if (b.resting && Math.hypot(b.pos.x - sx, b.pos.y - sy) <= b.radius + 2) return b;
			}
			return null;
		};

		const onPointerDown = (e: PointerEvent): void => {
			// click a resting ball to remove it (and free its input slot) — no aiming
			const hit = restingBallAt(stageX2(e.clientX), e.clientY);
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
			if (pegs.dragging) return;
			// hover a resting ball → highlight the input it owns; else pan the cannon
			const sx = stageX2(e.clientX);
			const hit = restingBallAt(sx, e.clientY);
			hover.slot = hit ? (slotFor(hit) ?? -1) : -1;
			canvas.style.cursor = hit ? "pointer" : "";
			const margin = world.cupWidth * CANNON_BASE_RATIO;
			apparatus.x = Math.min(Math.max(sx, margin), world.width - margin);
			apparatus.angle = 0;
		};
		const onPointerUp = (e: PointerEvent): void => {
			if (!aiming) return;
			aiming = false;
			apparatus.angle = aimAngle(stageX2(e.clientX), e.clientY, apparatus.x);
			fire();
			apparatus.angle = 0; // back to straight-down while panning resumes
		};

		window.addEventListener("resize", resize);
		canvas.addEventListener("pointerdown", onPointerDown);
		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerUp);

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("resize", resize);
			canvas.removeEventListener("pointerdown", onPointerDown);
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
		};
	});
</script>

<!-- the canvas IS the play area: width-capped and centered (left/size set in resize) -->
<canvas bind:this={canvas} class="fixed top-0 left-0"></canvas>
