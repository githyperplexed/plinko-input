import type { Ball } from "$lib/physics";

// The live simulation balls. Deliberately a plain module singleton (NOT $state):
// the physics loop mutates pos/vel thousands of times per frame, so we avoid
// reactive-proxy overhead — and because it lives outside any component, the
// balls survive the scene unmounting/remounting (e.g. while the too-small
// screen is shown). The reactive bridge to the UI is game.entered, which the
// scene derives from these each frame.
export const balls: Ball[] = [];

export const clearBalls = (): void => {
	balls.length = 0;
};
