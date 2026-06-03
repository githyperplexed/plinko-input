// Hand-written 2D physics for a ball dropped onto a row of rounded "domes".
// The white domes sit between the lettered cups; the gap between two domes is a
// narrow slot. Land a ball in a slot and it settles (a hit); clip a dome and
// its convex face kicks the ball sideways into a neighbour (a miss).
// Pixels for distance, seconds for time. +y points down (screen space).

export type Vec = { x: number; y: number };

export type Ball = {
	pos: Vec;
	vel: Vec;
	radius: number;
	resting: boolean;
	anchor: Vec; // reference point for the "has it stopped moving" test
	stillTime: number; // seconds spent within REST_RADIUS of the anchor
};

// A straight wall: the screen edges and the floor.
export type Segment = { a: Vec; b: Vec };

// A convex hump sitting on the floor. The ball bounces off its outer surface.
export type Dome = { center: Vec; radius: number };

// A free-floating circular peg (obstacle) the ball bounces off from any side.
export type Obstacle = { center: Vec; radius: number };

export type Cup = { centerX: number; letter: string };

export type World = {
	width: number;
	height: number;
	railTop: number;
	railHeight: number;
	cupWidth: number;
	domeRadius: number;
	slotWidth: number;
	letterY: number;
	segments: Segment[];
	domes: Dome[];
	obstacles: Obstacle[];
	cups: Cup[];
};

// A resolved contact: which way to push the ball out, and by how much.
type Hit = { normal: Vec; depth: number };

// --- tunables ---------------------------------------------------------------

export const GRAVITY = 2200; // px/s²
export const RESTITUTION = 0.7; // 1 = perfectly bouncy, 0 = dead stop
export const TANGENT_KEEP = 0.98; // surface friction along the contact
export const MAX_SUBSTEPS = 16; // anti-tunnelling cap (covers fast balls and a fast-dragged rail)
// Fixed simulation step. Stepping at a constant dt (rather than the variable
// frame time) makes the sim frame-rate independent AND repeatable, so the
// trajectory preview matches the real ball through every bounce.
export const FIXED_DT = 1 / 60;

// "Settled" detection — kept fully separate from the bounce dynamics above. A
// ball counts as stopped once it has stayed within REST_RADIUS of a point for
// REST_TIME while resting against a surface (REST_MARGIN stops a mid-air bounce
// apex from qualifying). This fires right when the ball *looks* stopped, rather
// than waiting for every last micro-bounce to die out.
export const REST_RADIUS = 4; // px of wander still considered "stopped" — lower = lets it roll/bounce longer before settling
export const REST_TIME = 0.18; // s it must stay put
export const REST_MARGIN = 4; // px from a surface to count as resting on it
// How "upward-facing" the support surface must be to settle on it (the surface
// normal's upward component, 0–1). 1 = only dead-flat ground; lower allows
// steeper slopes. Stops the ball freezing mid-slope on a mound's side.
export const REST_FLATNESS = 0.7;

export const BALL_RADIUS = 10;
// The catch slot between two domes, in pixels. Fixed (not derived from cup
// width) so the difficulty is identical on every screen size. The tightest
// fair value is roughly one ball diameter; below that the ball can't fit.
export const SLOT_WIDTH = 24;

// Floating peg above each letter slot, sized relative to a mound. Larger = a
// bigger blocker over the slot = harder. Set to 0 to remove the obstacles.
export const OBSTACLE_RADIUS_RATIO = 0.15;

export const RAIL_HEIGHT = 48; // straight-wall height of a cup, before the rounded mound
export const LETTER_DROP = 12; // how far the letter sits below the mound tops
export const RAIL_HANDLE_HEIGHT = 40; // peg-rail handle height (matches its h-10)
export const APPARATUS_RAIL_GAP = 40; // min clearance kept between cannon tip and handle top — bigger = "too small" trips sooner
// Cannon dimensions as ratios of its (one-cup) width — all match top-panel. The
// cannon is a barrel pivoting on a semicircle base at top-center: 0 = straight
// down, aimed toward the pointer and clamped to ±MAX_AIM.
export const CANNON_BASE_RATIO = 0.5; // base semicircle radius → base width = one cup
export const CANNON_LENGTH_RATIO = 0.7; // barrel length from pivot (top edge) to muzzle
export const CANNON_WIDTH_RATIO = 0.34; // barrel width
export const MAX_AIM = Math.PI / 4; // ± aim from straight down (45°)
export const LAUNCH_SPEED = 720; // px/s the ball leaves the muzzle

// --- vector helpers ---------------------------------------------------------

const v = (x: number, y: number): Vec => ({ x, y });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
const len = (a: Vec): number => Math.hypot(a.x, a.y);
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

// --- collision detection ----------------------------------------------------

const closestOnSegment = (p: Vec, s: Segment): Vec => {
	const ab = sub(s.b, s.a);
	const denom = dot(ab, ab);
	const t = denom === 0 ? 0 : clamp(dot(sub(p, s.a), ab) / denom, 0, 1);
	return add(s.a, scale(ab, t));
};

// Ball vs a line segment. Endpoints behave like rounded caps.
const hitSegment = (ball: Ball, s: Segment): Hit | null => {
	const offset = sub(ball.pos, closestOnSegment(ball.pos, s));
	const dist = len(offset);
	if (dist === 0 || dist > ball.radius) return null;
	return { normal: scale(offset, 1 / dist), depth: ball.radius - dist };
};

// Ball vs the convex outside of a dome. Only the upper half is solid (the hump
// rises from the floor), so the normal always points up and away from center.
const hitDome = (ball: Ball, dome: Dome): Hit | null => {
	if (ball.pos.y > dome.center.y) return null;
	const offset = sub(ball.pos, dome.center);
	const dist = len(offset);
	const reach = dome.radius + ball.radius;
	if (dist === 0 || dist > reach) return null;
	return { normal: scale(offset, 1 / dist), depth: reach - dist };
};

// --- collision response -----------------------------------------------------

// Push the ball back out of the surface, then reflect the velocity: the part
// along the normal bounces (scaled by restitution), the tangent part is kept
// (lightly damped by friction).
const resolve = (ball: Ball, hit: Hit): void => {
	ball.pos = add(ball.pos, scale(hit.normal, hit.depth));
	const into = dot(ball.vel, hit.normal);
	if (into >= 0) return;
	const normal = scale(hit.normal, into);
	const tangent = sub(ball.vel, normal);
	ball.vel = sub(scale(tangent, TANGENT_KEEP), scale(normal, RESTITUTION));
};

// Ball vs a free-floating peg. Convex on every side, so the normal just points
// from the peg's center out to the ball.
const hitObstacle = (ball: Ball, o: Obstacle): Hit | null => {
	const offset = sub(ball.pos, o.center);
	const dist = len(offset);
	const reach = o.radius + ball.radius;
	if (dist === 0 || dist > reach) return null;
	return { normal: scale(offset, 1 / dist), depth: reach - dist };
};

// Static world: screen edges, floor, mounds. (Obstacles are handled separately
// because they move with the draggable rail.)
const collide = (ball: Ball, world: World): void => {
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
const collideObstacles = (ball: Ball, world: World, obsVel: Vec): void => {
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

// Is the ball resting on a surface that faces upward enough to actually hold it
// (normal's upward component ≥ REST_FLATNESS)? This both stops it settling at a
// bounce apex (no surface near) and on a mound's steep side (normal too tilted),
// while still letting it settle on the floor or a near-flat spot. The normal of
// a near surface points from that surface toward the ball center.
const onFlatSupport = (ball: Ball, world: World, balls: Ball[], margin: number): boolean => {
	const reach = ball.radius + margin;
	const upward = (offset: Vec, dist: number): boolean =>
		dist > 0 && -offset.y / dist >= REST_FLATNESS;

	for (const s of world.segments) {
		const offset = sub(ball.pos, closestOnSegment(ball.pos, s));
		const dist = len(offset);
		if (dist <= reach && upward(offset, dist)) return true;
	}
	for (const d of world.domes) {
		if (ball.pos.y > d.center.y) continue;
		const offset = sub(ball.pos, d.center);
		const dist = len(offset);
		if (dist - d.radius <= reach && upward(offset, dist)) return true;
	}
	// a settled ball is solid ground too — lets a ball rest on top of a pile
	for (const other of balls) {
		if (other === ball || !other.resting) continue;
		const offset = sub(ball.pos, other.pos);
		const dist = len(offset);
		if (dist - other.radius <= reach && upward(offset, dist)) return true;
	}
	return false;
};

const integrate = (ball: Ball, dt: number): void => {
	ball.vel = add(ball.vel, v(0, GRAVITY * dt));
	ball.pos = add(ball.pos, scale(ball.vel, dt));
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
const collideAllPairs = (balls: Ball[]): void => {
	for (let i = 0; i < balls.length; i++) {
		for (let j = i + 1; j < balls.length; j++) {
			collidePair(balls[i], balls[j]);
		}
	}
};

// Settle on stillness of *position*, not velocity: if the ball hasn't strayed
// from its anchor for REST_TIME — small hops and slosh stay inside REST_RADIUS
// — and it's on flat-enough support, it's stopped. Independent of bounciness.
const tryRest = (ball: Ball, world: World, balls: Ball[], dt: number): void => {
	if (len(sub(ball.pos, ball.anchor)) > REST_RADIUS) {
		ball.anchor = ball.pos;
		ball.stillTime = 0;
	} else {
		ball.stillTime += dt;
		if (ball.stillTime >= REST_TIME && onFlatSupport(ball, world, balls, REST_MARGIN)) {
			ball.resting = true;
			ball.vel = v(0, 0);
		}
	}
};

// --- public step ------------------------------------------------------------

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
	pegToY: number
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
		}
		collideAllPairs(balls);
	}

	for (const b of balls) {
		if (!b.resting) tryRest(b, world, balls, dt);
	}
};

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
	maxBounces: number
): Vec[] => {
	const ball = createBall(x, y, vx, vy);
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
			const contact = touchingAnything(ball, world);
			if (contact && !inContact) bounces += 1; // count each fresh impact once
			inContact = contact;
			collide(ball, world);
			collideObstacles(ball, world, still);
			path.push({ x: ball.pos.x, y: ball.pos.y });
		}
		if (ball.pos.y > world.height || ball.pos.x < 0 || ball.pos.x > world.width) break;
	}
	return path;
};

// --- construction -----------------------------------------------------------

export const createBall = (x: number, y: number, vx = 0, vy = 0, radius = BALL_RADIUS): Ball => ({
	pos: v(x, y),
	vel: v(vx, vy),
	radius,
	resting: false,
	anchor: v(x, y),
	stillTime: 0
});

// --- shared geometry (single source for cup / rail / cannon math) ------------

// keep a fixed slot, but never let it swallow the whole cup on tiny screens
const slotWidthFor = (cupWidth: number): number => Math.min(SLOT_WIDTH, cupWidth * 0.6);
const domeRadiusFor = (cupWidth: number): number =>
	Math.max((cupWidth - slotWidthFor(cupWidth)) / 2, 0);

// The rail's vertical travel: lowest = resting spot (largest y); highest = top
// of travel (smallest y) — two mound-clearances below the cannon mouth, but
// never above the resting spot.
export const railRange = (
	letterY: number,
	domeRadius: number,
	apparatusY: number
): { lowest: number; highest: number } => {
	const lowest = letterY - domeRadius;
	const clearance = domeRadius + LETTER_DROP; // gap above the mounds at rest
	const highest = Math.min(apparatusY + clearance * 2, lowest);
	return { lowest, highest };
};

// --- cannon (pan + aim-at-pointer) -------------------------------------------
// The pivot sits at the top edge (y = 0) at `pivotX`, which pans across the top
// while idle. The barrel hangs down by `cannonLength` and swings ±MAX_AIM toward
// the pointer once aiming.

export const cannonLength = (cupWidth: number): number => cupWidth * CANNON_LENGTH_RATIO;

// Aim angle for a pointer position relative to the pivot: 0 = straight down,
// + = toward the right.
export const aimAngle = (pointerX: number, pointerY: number, pivotX: number): number =>
	clamp(Math.atan2(pointerX - pivotX, Math.max(pointerY, 0)), -MAX_AIM, MAX_AIM);

// Muzzle position (ball spawn / preview start) for a given pivot + aim.
export const muzzle = (pivotX: number, cupWidth: number, angle: number): Vec => {
	const length = cannonLength(cupWidth);
	return v(pivotX + Math.sin(angle) * length, Math.cos(angle) * length);
};

// Launch velocity along the aim.
export const launchVelocity = (angle: number): Vec =>
	v(Math.sin(angle) * LAUNCH_SPEED, Math.cos(angle) * LAUNCH_SPEED);

// True when the cannon's straight-down reach meets the top edge of the rail
// handle at the rail's highest position (plus a margin) — no room to keep the
// cannon above the rail, so a ball could be dropped beneath it: "too small".
export const apparatusMeetsRail = (width: number, height: number, letters: string[]): boolean => {
	const cupWidth = width / letters.length;
	const domeRadius = domeRadiusFor(cupWidth);
	const letterY = height - domeRadius - LETTER_DROP;
	const reach = cannonLength(cupWidth); // lowest the muzzle can get (straight down)
	const { highest } = railRange(letterY, domeRadius, reach);
	return reach >= highest - RAIL_HANDLE_HEIGHT / 2 - APPARATUS_RAIL_GAP;
};

// Build the row of domes plus the screen edges for a given viewport size, one
// cup per value in `letters`. Domes sit on each divider; the fixed-width slot
// left between neighbours is the catch target. Returned geometry is the single
// source of truth for physics + drawing.
export const createWorld = (
	width: number,
	height: number,
	letters: string[],
	railHeight = RAIL_HEIGHT
): World => {
	const count = letters.length;
	const cupWidth = width / count;
	const railTop = height - railHeight;
	const slotWidth = slotWidthFor(cupWidth);
	const domeRadius = domeRadiusFor(cupWidth);
	const letterY = height - domeRadius - LETTER_DROP;
	const obstacleRadius = domeRadius * OBSTACLE_RADIUS_RATIO;
	// one mound-height above the letter
	const obstacleY = letterY - domeRadius;

	const segments: Segment[] = [
		{ a: v(0, 0), b: v(0, height) }, // left edge
		{ a: v(width, 0), b: v(width, height) }, // right edge
		{ a: v(0, 0), b: v(width, 0) }, // top edge
		{ a: v(0, height), b: v(width, height) } // floor
	];
	const domes: Dome[] = [];
	const obstacles: Obstacle[] = [];
	const cups: Cup[] = [];

	for (let i = 0; i <= count; i++) {
		domes.push({ center: v(i * cupWidth, height), radius: domeRadius });
	}
	for (let i = 0; i < count; i++) {
		const centerX = (i + 0.5) * cupWidth;
		cups.push({ centerX, letter: letters[i] });
		if (obstacleRadius > 0) {
			obstacles.push({ center: v(centerX, obstacleY), radius: obstacleRadius });
		}
	}

	return {
		width,
		height,
		railTop,
		railHeight,
		cupWidth,
		domeRadius,
		slotWidth,
		letterY,
		segments,
		domes,
		obstacles,
		cups
	};
};
