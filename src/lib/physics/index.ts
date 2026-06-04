// Hand-written 2D physics for a ball dropped onto a row of rounded "domes".
// The white domes sit between the lettered cups; the gap between two domes is a
// narrow slot. Land a ball in a slot and it settles (a hit); clip a dome and
// its convex face kicks the ball sideways into a neighbour (a miss).
// Pixels for distance, seconds for time. +y points down (screen space).
//
// This barrel preserves the flat `$lib/physics` import surface; the
// implementation is split by concern into the sibling modules.

export type { Vec } from "./vector";
export type { Ball, Cup, Dome, Obstacle, Segment, World } from "./types";

export {
	BALL_RADIUS,
	FIXED_DT,
	GRAVITY,
	MAX_BALLS,
	MAX_SUBSTEPS,
	RESTITUTION,
	TANGENT_KEEP
} from "./constants";

export { REST_FLATNESS, REST_MARGIN, REST_RADIUS, REST_TIME } from "./rest";

export { stepAll } from "./simulation";

export { cupIndexAt, predictLanding, predictPath } from "./prediction";

export {
	APPARATUS_RAIL_GAP,
	createBall,
	createWorld,
	LETTER_DROP,
	OBSTACLE_RADIUS_RATIO,
	railRange,
	RAIL_HANDLE_HEIGHT,
	RAIL_HEIGHT,
	SLOT_WIDTH
} from "./world";

export {
	aimAngle,
	CANNON_BASE_RATIO,
	CANNON_LENGTH_RATIO,
	CANNON_WIDTH_RATIO,
	cannonLength,
	launchVelocity,
	LAUNCH_SPEED,
	MAX_AIM,
	muzzle
} from "./cannon";

export { clampStageWidth, STAGE_MAX_WIDTH, stageOffset } from "./stage";

export type { Wedges } from "./sandbox";
export { sandboxWorld, WEDGE_ANGLE, WEDGE_GAP_BALLS, wedgeGeometry } from "./sandbox";
