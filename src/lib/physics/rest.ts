// "Settled" detection — kept fully separate from the bounce dynamics. A ball
// counts as stopped once it has stayed within REST_RADIUS of a point for
// REST_TIME while resting against a surface (REST_MARGIN stops a mid-air bounce
// apex from qualifying). This fires right when the ball *looks* stopped, rather
// than waiting for every last micro-bounce to die out.

import { closestOnSegment } from "./collision";
import type { Ball, Obstacle, World } from "./types";
import { len, sub, v, type Vec } from "./vector";

export const REST_RADIUS = 4; // px of wander still considered "stopped" — lower = lets it roll/bounce longer before settling
export const REST_TIME = 0.18; // s it must stay put
export const REST_MARGIN = 4; // px from a surface to count as resting on it
// How "upward-facing" the support surface must be to settle on it (the surface
// normal's upward component, 0–1). 1 = only dead-flat ground; lower allows
// steeper slopes. Stops the ball freezing mid-slope on a mound's side.
export const REST_FLATNESS = 0.7;

// Is the ball resting on a surface that faces upward enough to actually hold it
// (normal's upward component ≥ REST_FLATNESS)? This both stops it settling at a
// bounce apex (no surface near) and on a mound's steep side (normal too tilted),
// while still letting it settle on the floor or a near-flat spot. The normal of
// a near surface points from that surface toward the ball center.
const onFlatSupport = (
	ball: Ball,
	world: World,
	balls: Ball[],
	margin: number,
	blockers: Obstacle[] = []
): boolean => {
	const reach = ball.radius + margin;
	const upward = (offset: Vec, dist: number): boolean =>
		dist > 0 && -offset.y / dist >= REST_FLATNESS;

	for (const s of world.segments) {
		const offset = sub(ball.pos, closestOnSegment(ball.pos, s));
		const dist = len(offset);
		if (dist <= reach && upward(offset, dist)) return true;
	}
	// Mounds are deliberately NOT settle surfaces. The slot (≥4px wider than the
	// ball) always lets a caught ball drop to the floor between two mound bases —
	// that's the segment check above. The only contact a mound could ever satisfy
	// here is the unstable perch on its upper arc (the apex normal points straight
	// up, so it would pass the flatness test); excluding mounds lets such a ball
	// keep sliding until it drops into a slot instead of freezing on the curve.
	// a settled ball is solid ground too — lets a ball rest on top of a pile
	for (const other of balls) {
		if (other === ball || !other.resting) continue;
		const offset = sub(ball.pos, other.pos);
		const dist = len(offset);
		if (dist - other.radius <= reach && upward(offset, dist)) return true;
	}
	// blockers (e.g. resting balls fed into a prediction) are solid ground too
	for (const o of blockers) {
		const offset = sub(ball.pos, o.center);
		const dist = len(offset);
		if (dist - o.radius <= reach && upward(offset, dist)) return true;
	}
	return false;
};

// Settle on stillness of *position*, not velocity: if the ball hasn't strayed
// from its anchor for REST_TIME — small hops and slosh stay inside REST_RADIUS
// — and it's on flat-enough support, it's stopped. Independent of bounciness.
export const tryRest = (
	ball: Ball,
	world: World,
	balls: Ball[],
	dt: number,
	blockers: Obstacle[] = []
): void => {
	if (len(sub(ball.pos, ball.anchor)) > REST_RADIUS) {
		ball.anchor = ball.pos;
		ball.stillTime = 0;
	} else {
		ball.stillTime += dt;
		if (ball.stillTime >= REST_TIME && onFlatSupport(ball, world, balls, REST_MARGIN, blockers)) {
			ball.resting = true;
			ball.vel = v(0, 0);
		}
	}
};
