// Board construction: the row of domes plus the screen edges, the floating pegs,
// the lettered cups, and the rail's vertical travel. This geometry is the single
// source of truth for both physics and drawing.

import { BALL_RADIUS } from "./constants";
import type { Ball, Cup, Dome, Obstacle, Segment, World } from "./types";
import { v } from "./vector";

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

export const createBall = (x: number, y: number, vx = 0, vy = 0, radius = BALL_RADIUS): Ball => ({
	pos: v(x, y),
	vel: v(vx, vy),
	radius,
	resting: false,
	anchor: v(x, y),
	stillTime: 0
});

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
