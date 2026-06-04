// Collision detection and response: ball vs the static world (edges, floor,
// mounds), vs the free-floating pegs, and ball vs ball.

import { RESTITUTION, TANGENT_KEEP } from "./constants";
import type { Ball, Dome, Obstacle, Segment, World } from "./types";
import { add, clamp, dot, len, scale, sub, type Vec } from "./vector";

// A resolved contact: which way to push the ball out, and by how much.
export type Hit = { normal: Vec; depth: number };

// --- collision detection ----------------------------------------------------

export const closestOnSegment = (p: Vec, s: Segment): Vec => {
	const ab = sub(s.b, s.a);
	const denom = dot(ab, ab);
	const t = denom === 0 ? 0 : clamp(dot(sub(p, s.a), ab) / denom, 0, 1);
	return add(s.a, scale(ab, t));
};

// Ball vs a line segment. Endpoints behave like rounded caps.
export const hitSegment = (ball: Ball, s: Segment): Hit | null => {
	const offset = sub(ball.pos, closestOnSegment(ball.pos, s));
	const dist = len(offset);
	if (dist === 0 || dist > ball.radius) return null;
	return { normal: scale(offset, 1 / dist), depth: ball.radius - dist };
};

// Ball vs the convex outside of a dome. Only the upper half is solid (the hump
// rises from the floor), so the normal always points up and away from center.
export const hitDome = (ball: Ball, dome: Dome): Hit | null => {
	if (ball.pos.y > dome.center.y) return null;
	const offset = sub(ball.pos, dome.center);
	const dist = len(offset);
	const reach = dome.radius + ball.radius;
	if (dist === 0 || dist > reach) return null;
	return { normal: scale(offset, 1 / dist), depth: reach - dist };
};

// Ball vs a free-floating peg. Convex on every side, so the normal just points
// from the peg's center out to the ball.
export const hitObstacle = (ball: Ball, o: Obstacle): Hit | null => {
	const offset = sub(ball.pos, o.center);
	const dist = len(offset);
	const reach = o.radius + ball.radius;
	if (dist === 0 || dist > reach) return null;
	return { normal: scale(offset, 1 / dist), depth: reach - dist };
};

// --- collision response -----------------------------------------------------

// Push the ball back out of the surface, then reflect the velocity: the part
// along the normal bounces (scaled by restitution), the tangent part is kept
// (lightly damped by friction).
export const resolve = (ball: Ball, hit: Hit): void => {
	ball.pos = add(ball.pos, scale(hit.normal, hit.depth));
	const into = dot(ball.vel, hit.normal);
	if (into >= 0) return;
	const normal = scale(hit.normal, into);
	const tangent = sub(ball.vel, normal);
	ball.vel = sub(scale(tangent, TANGENT_KEEP), scale(normal, RESTITUTION));
};

// Static world: screen edges, floor, mounds. (Obstacles are handled separately
// because they move with the draggable rail.)
export const collide = (ball: Ball, world: World): void => {
	for (const s of world.segments) {
		const hit = hitSegment(ball, s);
		if (hit) resolve(ball, hit);
	}
	for (const d of world.domes) {
		const hit = hitDome(ball, d);
		if (hit) resolve(ball, hit);
	}
};

// The peg row. obsVel is the rail's velocity this frame, so a ball is bounced in
// the rail's moving frame and inherits its motion — a fast drag flings the ball
// out of the way instead of letting it clip through. With obsVel = 0 this is an
// ordinary static bounce.
export const collideObstacles = (ball: Ball, world: World, obsVel: Vec): void => {
	for (const o of world.obstacles) {
		const hit = hitObstacle(ball, o);
		if (!hit) continue;
		ball.pos = add(ball.pos, scale(hit.normal, hit.depth));
		const rel = sub(ball.vel, obsVel);
		const into = dot(rel, hit.normal);
		if (into >= 0) continue;
		const normalComp = scale(hit.normal, into);
		const tangent = sub(rel, normalComp);
		const bounced = sub(scale(tangent, TANGENT_KEEP), scale(normalComp, RESTITUTION));
		ball.vel = add(bounced, obsVel);
	}
};

// Resolve one ball against another. A resting ball is immovable (treated as a
// static surface), so it never moves once placed — the other ball just bounces
// off it. Two active balls share the push and swap their normal velocities
// (equal-mass elastic, damped by restitution).
const collidePair = (a: Ball, b: Ball): void => {
	if (a.resting && b.resting) return;
	const delta = sub(b.pos, a.pos); // a → b
	const dist = len(delta);
	const minDist = a.radius + b.radius;
	if (dist === 0 || dist >= minDist) return;

	const normal = scale(delta, 1 / dist);
	const overlap = minDist - dist;

	if (a.resting) {
		resolve(b, { normal, depth: overlap });
	} else if (b.resting) {
		resolve(a, { normal: scale(normal, -1), depth: overlap });
	} else {
		const shift = scale(normal, overlap / 2);
		a.pos = sub(a.pos, shift);
		b.pos = add(b.pos, shift);
		const approach = dot(sub(a.vel, b.vel), normal);
		if (approach > 0) {
			const impulse = scale(normal, ((1 + RESTITUTION) / 2) * approach);
			a.vel = sub(a.vel, impulse);
			b.vel = add(b.vel, impulse);
		}
	}
};

// O(n²) over the (small, capped) ball list — fine for a few dozen balls.
export const collideAllPairs = (balls: Ball[]): void => {
	for (let i = 0; i < balls.length; i++) {
		for (let j = i + 1; j < balls.length; j++) {
			collidePair(balls[i], balls[j]);
		}
	}
};
