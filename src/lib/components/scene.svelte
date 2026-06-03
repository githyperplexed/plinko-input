<script lang="ts">
	import { untrack } from "svelte";

	import {
		createBall,
		createWorld,
		FIXED_DT,
		predictPath,
		railRange,
		stepAll,
		type Ball,
		type World
	} from "$lib/physics";
	import { apparatus } from "$lib/stores/apparatus.svelte";
	import { balls } from "$lib/stores/balls";
	import { charset, syncCharset } from "$lib/stores/charset.svelte";
	import { game, newTarget, PIN_LENGTH } from "$lib/stores/game.svelte";
	import { pegs } from "$lib/stores/pegs.svelte";

	const DOME_FILL = "#fff";
	const OBSTACLE_FILL = "#fff";
	const LETTER_FILL = "rgba(255, 255, 255, 0.7)";
	const BALL_FILL = "#e5e5e5";
	const TRAJECTORY_RGB = "255, 70, 70";
	const TRAJECTORY_ALPHA = 0.55;
	const TRAJECTORY_DASH_SPEED = 12; // px/sec the dots pan toward the target
	const PEG_LINE = "rgba(255, 255, 255, 0.3)";

	let canvas: HTMLCanvasElement;

	// red aim preview: the deterministic path a ball dropped now would trace
	// through its first 3 bounces, as marching dots that fade out near the end
	const drawTrajectory = (ctx: CanvasRenderingContext2D, world: World, time: number): void => {
		const path = predictPath(world, apparatus.x, apparatus.y, 3);
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
			ctx.strokeStyle = `rgba(${TRAJECTORY_RGB}, ${TRAJECTORY_ALPHA * fade})`;
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
		const { lowest, highest } = railRange(world.letterY, world.domeRadius, apparatus.y);
		pegs.min = lowest;
		pegs.max = highest;
		if (pegs.y === 0) pegs.y = lowest; // start at rest
		pegs.y = Math.min(lowest, Math.max(highest, pegs.y));
	};

	// the letters sit in the catch slots between the domes
	const drawLetters = (ctx: CanvasRenderingContext2D, world: World): void => {
		ctx.fillStyle = LETTER_FILL;
		ctx.font = "14px system-ui, sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		for (const cup of world.cups) {
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

		// Match the canvas to the viewport and the device pixel ratio so the
		// drawing stays crisp, then rebuild the cup geometry for the new size.
		const resize = (): void => {
			const dpr = window.devicePixelRatio || 1;
			const w = window.innerWidth;
			const h = window.innerHeight;
			canvas.width = w * dpr;
			canvas.height = h * dpr;
			canvas.style.width = `${w}px`;
			canvas.style.height = `${h}px`;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			// when a breakpoint is crossed, swap the value set (board rebuilds below)
			// and pick a fresh target — but keep the balls and progress in play
			if (syncCharset(w)) newTarget();
			world = createWorld(w, h, charset.values);
			// snap the rebuilt pegs to the rail's current spot so the next frame
			// doesn't sweep them up from the default position
			if (pegs.y > 0) for (const o of world.obstacles) o.center.y = pegs.y;
			// Pull balls back inside the resized viewport before re-settling — a
			// height shrink moves the floor up, and any ball left below it would
			// fall off-screen and vanish.
			for (const ball of balls) {
				ball.pos.x = Math.max(ball.radius, Math.min(w - ball.radius, ball.pos.x));
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
			// Project each ball onto its pin input by drop order: input i shows
			// ball i's current resting slot (or "" while it's still moving). Done
			// live, so a ball that re-settles in a new slot — even from a resize
			// bump — updates its own input, without changing which input it owns.
			for (let i = 0; i < PIN_LENGTH; i++) {
				const ball = balls[i];
				const letter = ball && ball.resting ? slotLetterAt(ball.pos.x) : "";
				if (game.entered[i] !== letter) game.entered[i] = letter;
			}
			if (game.dropped !== balls.length) game.dropped = balls.length;

			ctx.clearRect(0, 0, world.width, world.height);
			drawDomes(ctx, world);
			drawPegRow(ctx, world);
			drawTrajectory(ctx, world, time);
			drawLetters(ctx, world);
			for (const ball of balls) drawBall(ctx, ball);

			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);

		// release a ball from the dispenser's current position. Bound to the canvas
		// (not the window) so the DOM handles/cannon above it don't trigger drops —
		// the pointer-events-none HUD still passes clicks through to here.
		const release = (): void => {
			if (game.status !== "playing") return;
			if (balls.length >= PIN_LENGTH) return; // only as many balls as pin slots
			balls.push(createBall(apparatus.x, apparatus.y));
		};

		window.addEventListener("resize", resize);
		canvas.addEventListener("click", release);

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("resize", resize);
			canvas.removeEventListener("click", release);
		};
	});
</script>

<canvas bind:this={canvas} class="fixed inset-0"></canvas>
