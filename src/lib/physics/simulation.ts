// The fixed-step integrator that advances every ball together.

import { collide, collideAllPairs, collideObstacles, hitObstacle, resolve } from "./collision";
import { BALL_RADIUS, GRAVITY, MAX_SUBSTEPS } from "./constants";
import { tryRest } from "./rest";
import type { Ball, Obstacle, World } from "./types";
import { add, clamp, len, scale, v } from "./vector";

export const integrate = (ball: Ball, dt: number): void => {
	ball.vel = add(ball.vel, v(0, GRAVITY * dt));
	ball.pos = add(ball.pos, scale(ball.vel, dt));
};

// Advance every ball by dt together. A shared sub-step — sized to the fastest
// ball *and* the rail's travel this frame — keeps quick balls from tunnelling
// through walls/each other and the dragged peg row from clipping through balls.
// The rail is swept from pegFromY to pegToY across the sub-steps, and balls are
// bounced in its moving frame so a fast drag flings them aside. Resting balls
// are skipped for motion but still collide as immovable obstacles.
export const stepAll = (
	balls: Ball[],
	world: World,
	dt: number,
	pegFromY: number,
	pegToY: number,
	settle = true,
	blockers: Obstacle[] = []
): void => {
	if (dt === 0) return;

	let maxSpeed = 0;
	for (const b of balls) {
		if (!b.resting) maxSpeed = Math.max(maxSpeed, len(b.vel));
	}
	const maxTravel = Math.max(maxSpeed * dt, Math.abs(pegToY - pegFromY));
	const substeps = clamp(Math.ceil(maxTravel / (BALL_RADIUS * 0.5)), 1, MAX_SUBSTEPS);
	const h = dt / substeps;
	const obsVel = v(0, (pegToY - pegFromY) / dt);

	for (let i = 0; i < substeps; i++) {
		const pegY = pegFromY + (pegToY - pegFromY) * ((i + 1) / substeps);
		for (const o of world.obstacles) o.center.y = pegY;

		for (const b of balls) {
			if (b.resting) continue;
			integrate(b, h);
			collide(b, world);
			collideObstacles(b, world, obsVel);
			// static blockers (resting balls fed into a prediction) — immovable circles
			for (const o of blockers) {
				const hit = hitObstacle(b, o);
				if (hit) resolve(b, hit);
			}
		}
		collideAllPairs(balls);
	}

	if (settle) {
		for (const b of balls) {
			if (!b.resting) tryRest(b, world, balls, dt, blockers);
		}
	}
};
