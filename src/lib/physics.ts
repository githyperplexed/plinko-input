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
// Hard cap on simultaneous balls, used by the post-win free-play sandbox. The
// only superlinear sim cost is the O(n²) ball-ball pass, so this bounds it;
// ~150 stays smooth without spatial partitioning.
export const MAX_BALLS = 150;
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
	// blockers (e.g. resting balls fed into a prediction) are solid ground too
	for (const o of blockers) {
		const offset = sub(ball.pos, o.center);
		const dist = len(offset);
		if (dist - o.radius <= reach && upward(offset, dist)) return true;
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
const tryRest = (
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

// The play area is capped to a max width and centered; beyond it the screen
// shows margins (with a light border). Capping keeps cups/cannon a sane size on
// ultra-wide setups, so the plain width/height checks are all the "too small"
// guard we need.
export const STAGE_MAX_WIDTH = 2560;
export const clampStageWidth = (windowWidth: number): number =>
	Math.min(windowWidth, STAGE_MAX_WIDTH);
export const stageOffset = (windowWidth: number): number =>
	(windowWidth - clampStageWidth(windowWidth)) / 2;

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

// --- win-screen sandbox ------------------------------------------------------
// A free-play funnel shown after a win: two mirrored ramps angle down to a gap
// in the center; balls roll/bounce through and are wiped, so the pile drains
// itself. Rest detection is disabled while stepping this world (the 30° ramp is
// shallower than REST_FLATNESS, so balls would otherwise settle instead of
// flowing) — see stepAll's `settle` flag.

export const WEDGE_ANGLE = Math.PI / 6; // ramp incline from horizontal (30°)
export const WEDGE_GAP_BALLS = 5; // center drain gap width, in ball diameters

export type Wedges = {
	floorY: number;
	gapLeftX: number; // inner lip of the left ramp / left edge of the gap
	gapRightX: number; // inner lip of the right ramp / right edge of the gap
	topY: number; // ramp height where it meets the side walls
};

// Mirrored ramp geometry: each ramp runs from a side wall down to the center gap
// at WEDGE_ANGLE. Single source for both the colliders and the drawing.
export const wedgeGeometry = (width: number, height: number): Wedges => {
	const halfGap = WEDGE_GAP_BALLS * BALL_RADIUS; // (balls × diameter) / 2
	const gapLeftX = width / 2 - halfGap;
	const topY = height - gapLeftX * Math.tan(WEDGE_ANGLE); // rise over the wall→gap run
	return { floorY: height, gapLeftX, gapRightX: width / 2 + halfGap, topY };
};

// Bare world for the sandbox: side walls plus the two draining ramps, and no
// floor between their inner lips — balls that reach the gap fall through (the
// scene removes them once they're past the bottom).
export const sandboxWorld = (width: number, height: number): World => {
	const w = wedgeGeometry(width, height);
	const segments: Segment[] = [
		{ a: v(0, 0), b: v(0, height) }, // left wall
		{ a: v(width, 0), b: v(width, height) }, // right wall
		{ a: v(0, w.topY), b: v(w.gapLeftX, w.floorY) }, // left ramp
		{ a: v(w.gapRightX, w.floorY), b: v(width, w.topY) } // right ramp
	];
	return {
		width,
		height,
		railTop: height,
		railHeight: 0,
		cupWidth: width,
		domeRadius: 0,
		slotWidth: 0,
		letterY: height,
		segments,
		domes: [],
		obstacles: [],
		cups: []
	};
};
