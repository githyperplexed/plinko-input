// The play area is capped to a max width and centered; beyond it the screen
// shows margins (with a light border). Capping keeps cups/cannon a sane size on
// ultra-wide setups, so the plain width/height checks are all the "too small"
// guard we need.

export const STAGE_MAX_WIDTH = 2560;
export const clampStageWidth = (windowWidth: number): number =>
	Math.min(windowWidth, STAGE_MAX_WIDTH);
export const stageOffset = (windowWidth: number): number =>
	(windowWidth - clampStageWidth(windowWidth)) / 2;
