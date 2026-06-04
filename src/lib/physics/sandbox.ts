// The win-screen sandbox: a free-play funnel shown after a win. Two mirrored
// ramps angle down to a gap in the center; balls roll/bounce through and are
// wiped, so the pile drains itself. Rest detection is disabled while stepping
// this world (the 30° ramp is shallower than REST_FLATNESS, so balls would
// otherwise settle instead of flowing) — see stepAll's `settle` flag.

import { BALL_RADIUS } from "./constants";
import type { Segment, World } from "./types";
import { v } from "./vector";

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
