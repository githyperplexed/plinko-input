// The cannon's horizontal pivot position (`x`, viewport px) and current aim
// (`angle`, radians: 0 = straight down, + = right, clamped to ±MAX_AIM). While
// idle the scene pans `x` to follow the pointer with angle 0; on press it locks
// `x` and sets `angle` from the drag, firing on release. The top-panel reads
// both to place and rotate the barrel — and owns `panning`, set while the
// cannon is being grabbed and dragged to reposition it (which must not fire).
export const apparatus = $state({
	x: 0,
	angle: 0,
	panning: false
});
