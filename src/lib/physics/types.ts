// The entity and world shapes shared across the physics modules.

import type { Vec } from "./vector";

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
