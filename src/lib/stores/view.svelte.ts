// Whether the viewport is below the playable minimum. While true the game is
// frozen — physics paused, input ignored, and resizes don't touch game state —
// and a message overlays it. Nothing is reset, so it resumes exactly as it was
// the moment the window is big enough again.

import { apparatusMeetsRail } from "$lib/physics";
import { charset } from "$lib/stores/charset.svelte";

export const MIN_WIDTH = 360;
export const MIN_HEIGHT = 500;

export const view = $state({ tooSmall: false });

export const refreshViewport = (): void => {
	if (typeof window === "undefined") return;
	const w = window.innerWidth;
	const h = window.innerHeight;
	// too small if below the flat minimums, OR if the geometry would let the
	// cannon tip drop to/below the peg rail (e.g. an ultra-wide, short window)
	view.tooSmall = w < MIN_WIDTH || h < MIN_HEIGHT || apparatusMeetsRail(w, h, charset.values);
};

refreshViewport();
