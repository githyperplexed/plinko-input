// Where the dispenser up top currently sits. `x`/`y` are the live mouth
// position the scene reads to release a ball; `aim` is the persisted horizontal
// position as a fraction of the viewport (0–1), so the cannon re-enters where it
// was after the top-panel unmounts/remounts (e.g. the too-small screen).
export const apparatus = $state({
	x: 0, // center of the mouth (viewport px)
	y: 0, // bottom of the mouth (release height, viewport px)
	aim: 0.5 // cursor position as a fraction of width; 0.5 = centered
});
