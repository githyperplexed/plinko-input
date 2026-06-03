// Whether this is a touch device — a coarse pointer with no real hover. Drives
// the mobile-only controls: the cannon never hover-pans (it's moved only via the
// top grab handle), aiming on the canvas no longer fires on release (the aim
// persists so the arc preview stays put), and a dedicated Fire button launches
// the shot instead. Reactive: the media query fires on change (a mouse gets
// plugged in, devtools device emulation toggles), so the UI flips live.

// Height of the bottom band reserved for the Fire button on touch devices. The
// scene shrinks the play area by this much so the button sits fully below the
// floor, isolated from the cups and falling balls.
export const FIRE_BAR_HEIGHT = 80;

export const touch = $state({ coarse: false });

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
	const mq = window.matchMedia("(pointer: coarse)");
	touch.coarse = mq.matches;
	mq.addEventListener("change", (e) => (touch.coarse = e.matches));
}
