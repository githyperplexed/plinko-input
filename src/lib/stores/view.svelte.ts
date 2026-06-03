// Whether the viewport is below the playable minimum. While true the game is
// frozen — physics paused, input ignored, and resizes don't touch game state —
// and a message overlays it. Nothing is reset, so it resumes exactly as it was
// the moment the window is big enough again. (The play area is width-capped and
// centered, so plain width/height minimums are all we need here.)

export const MIN_WIDTH = 360;
export const MIN_HEIGHT = 500;

export const view = $state({ tooSmall: false });

export const refreshViewport = (): void => {
	if (typeof window === "undefined") return;
	view.tooSmall = window.innerWidth < MIN_WIDTH || window.innerHeight < MIN_HEIGHT;
};

refreshViewport();
