// Deterministic "ghost ball" predictors. Because the sim steps at a fixed dt,
// replaying a drop from the same spot reproduces the real ball exactly — that's
// what lets the aim preview match the shot and the target slot glow on a hit.

import { collide, collideObstacles, hitDome, hitObstacle, hitSegment } from "./collision";
import { BALL_RADIUS, FIXED_DT, MAX_SUBSTEPS } from "./constants";
import { integrate, stepAll } from "./simulation";
import type { Ball, Obstacle, World } from "./types";
import { clamp, len, v, type Vec } from "./vector";
import { createBall } from "./world";

// Is the ball touching any static surface or peg right now?
const touchingAnything = (ball: Ball, world: World): boolean => {
	for (const s of world.segments) if (hitSegment(ball, s)) return true;
	for (const d of world.domes) if (hitDome(ball, d)) return true;
	for (const o of world.obstacles) if (hitObstacle(ball, o)) return true;
	return false;
};

// Simulate a lone "ghost" ball forward from (x, y) through the current board
// (pegs treated as fixed where they are now) and return the path it traces up to
// and including its `maxBounces`-th impact. Deterministic, so it matches a real
// drop from the same spot — used to draw the aim preview.
export const predictPath = (
	world: World,
	x: number,
	y: number,
	vx: number,
	vy: number,
	maxBounces: number,
	blockers: Obstacle[] = []
): Vec[] => {
	const ball = createBall(x, y, vx, vy);
	// resting balls collide exactly like static pegs — fold them into the obstacle
	// set (predictPath never sweeps obstacles, so this is safe)
	const cw = blockers.length ? { ...world, obstacles: [...world.obstacles, ...blockers] } : world;
	const path: Vec[] = [{ x, y }];
	const still = v(0, 0);
	const dt = FIXED_DT;
	let bounces = 0;
	let inContact = false;

	for (let step = 0; step < 240 && bounces < maxBounces; step++) {
		const substeps = clamp(Math.ceil((len(ball.vel) * dt) / (BALL_RADIUS * 0.5)), 1, MAX_SUBSTEPS);
		const h = dt / substeps;
		for (let i = 0; i < substeps && bounces < maxBounces; i++) {
			integrate(ball, h);
			const contact = touchingAnything(ball, cw);
			if (contact && !inContact) bounces += 1; // count each fresh impact once
			inContact = contact;
			collide(ball, cw);
			collideObstacles(ball, cw, still);
			path.push({ x: ball.pos.x, y: ball.pos.y });
		}
		if (ball.pos.y > cw.height || ball.pos.x < 0 || ball.pos.x > cw.width) break;
	}
	return path;
};

// Which cup index an x-position falls in (clamped to the row).
export const cupIndexAt = (world: World, x: number): number =>
	clamp(Math.floor(x / world.cupWidth), 0, world.cups.length - 1);

// Simulate a lone ghost ball from (x, y) all the way to rest and return the cup
// index it settles in. Reuses the real step + settle logic, so it matches an
// actual drop. `blockers` are the resting balls already in play (immovable
// circles) so the ghost bounces off / settles on the existing pile; moving balls
// are deliberately ignored (reading around those is the player's skill). Pegs
// are held where they are now. Used to color the aim preview and glow the slot.
export const predictLanding = (
	world: World,
	x: number,
	y: number,
	vx: number,
	vy: number,
	blockers: Obstacle[] = []
): number | null => {
	const ghost = createBall(x, y, vx, vy);
	const ghosts = [ghost];
	const pegY = world.obstacles.length ? world.obstacles[0].center.y : 0;
	for (let step = 0; step < 600; step++) {
		stepAll(ghosts, world, FIXED_DT, pegY, pegY, true, blockers);
		if (ghost.resting) return cupIndexAt(world, ghost.pos.x);
	}
	return null;
};
