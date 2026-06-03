// The game: the player must reproduce a randomly generated "pin" by dropping
// balls into the matching value slots. Each input is bound to a ball by drop
// order (input i ← the i-th ball dropped) and shows that ball's *current*
// resting slot — so settle order doesn't matter and a ball that gets bumped to
// a new slot (even by a resize) just updates its own input. The pin is only
// evaluated on submit (Enter or the button), never auto-completed. The pool of
// possible values comes from the active charset (a–z or 0–9).

import { clearBalls } from "$lib/stores/balls";
import { charset } from "$lib/stores/charset.svelte";

export const PIN_LENGTH = 6;

type Status = "playing" | "success" | "failure";

const randomPin = (): string => {
	const values = charset.values;
	let pin = "";
	for (let i = 0; i < PIN_LENGTH; i++) {
		pin += values[Math.floor(Math.random() * values.length)];
	}
	return pin;
};

const empty = (): string[] => Array(PIN_LENGTH).fill("");

export const game = $state({
	target: randomPin(),
	entered: empty(), // entered[i] = ball i's current letter, or "" while it's in flight
	dropped: 0, // how many balls have been released this round (next drop fills this slot)
	status: "playing" as Status
});

// every slot has a settled value
export const isReady = (): boolean => game.entered.every((c) => c !== "");

export const submit = (): void => {
	if (game.status !== "playing" || !isReady()) return;
	game.status = game.entered.join("") === game.target ? "success" : "failure";
};

// Regenerate just the target — used when the value set changes at a breakpoint.
// Leaves the balls, entries, and progress in place (they re-project onto the new
// board), so the game stays playable across a resize.
export const newTarget = (): void => {
	game.target = randomPin();
};

// Full reset — clears the balls, entries, and status. Only the "new pin" /
// result buttons do this (a resize or breakpoint never does).
export const reset = (): void => {
	clearBalls();
	game.entered = empty();
	game.dropped = 0;
	game.status = "playing";
	game.target = randomPin();
};
