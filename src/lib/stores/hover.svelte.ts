// Which code input is currently highlighted by hovering its ball on the canvas
// (-1 = none). The balls live on the canvas while the inputs are DOM, so this is
// the bridge that lets a canvas hover drive a DOM border highlight.
export const hover = $state({ slot: -1 });
