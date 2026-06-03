// The draggable plinko row. `y` is the vertical position of the peg centers (and
// the connecting line). The scene owns the bounds — it recomputes min/max from
// the live geometry every frame (so resizes are handled) and clamps `y` into
// them; the handle just writes `y` while dragging.
export const pegs = $state({
	y: 0, // current row center, in viewport px
	min: 0, // lowest allowed (largest y) — the resting/default spot
	max: 0, // highest allowed (smallest y) — one mound below the apparatus
	dragging: false
});
