// The cannon: a barrel pivoting on a semicircle base at the top-center of the
// stage. The pivot sits at the top edge (y = 0) at `pivotX`, which pans across
// the top while idle; the barrel hangs down by `cannonLength` and swings
// ±MAX_AIM toward the pointer once aiming. 0 = straight down, + = toward right.

import { clamp, v, type Vec } from "./vector";

// Cannon dimensions as ratios of its (one-cup) width — all match top-panel.
export const CANNON_BASE_RATIO = 0.5; // base semicircle radius → base width = one cup
export const CANNON_LENGTH_RATIO = 0.7; // barrel length from pivot (top edge) to muzzle
export const CANNON_WIDTH_RATIO = 0.34; // barrel width
export const MAX_AIM = Math.PI / 4; // ± aim from straight down (45°)
export const LAUNCH_SPEED = 720; // px/s the ball leaves the muzzle

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
