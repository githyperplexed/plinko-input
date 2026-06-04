import { createBall, launchVelocity, muzzle, type Ball } from "$lib/physics";
import { apparatus } from "$lib/stores/apparatus.svelte";

// The live simulation balls. Deliberately a plain module singleton (NOT $state):
// the physics loop mutates pos/vel thousands of times per frame, so we avoid
// reactive-proxy overhead — and because it lives outside any component, the
// balls survive the scene unmounting/remounting (e.g. while the too-small
// screen is shown). The reactive bridge to the UI is game.entered, which the
// scene derives from these each frame.
//
// Each ball owns a code INPUT slot for its whole life, tracked in `slotOf` and
// keyed by ball identity — decoupled from the ball's position in this array, so
// splicing one out can never re-bind another's input. Slots are handed out in
// order; a removed slot goes onto `freed` and is reused LIFO (last removed →
// next refilled). Removing the final ball resets the ordering to a clean 0.
export const balls: Ball[] = [];

const slotOf = new Map<Ball, number>(); // ball → the input index it fills
const freed: number[] = []; // freed input indices, reused last-in-first-out
let placed = 0; // high-water mark: the next fresh slot when none are freed

export const clearBalls = (): void => {
	balls.length = 0;
	slotOf.clear();
	freed.length = 0;
	placed = 0;
};

// The input index the next dropped ball will fill — a freed slot if any (LIFO),
// otherwise the next fresh one — or null when every slot is taken.
export const nextSlot = (capacity: number): number | null => {
	if (freed.length) return freed[freed.length - 1];
	return placed < capacity ? placed : null;
};

// Add a ball, assigning it the next slot. Returns the slot, or null if full.
export const addBall = (ball: Ball, capacity: number): number | null => {
	const slot = nextSlot(capacity);
	if (slot === null) return null;
	if (freed.length) freed.pop();
	else placed++;
	balls.push(ball);
	slotOf.set(ball, slot);
	return slot;
};

// Fire a ball from the cannon along its current aim — the single source for the
// muzzle → launch-velocity → ball recipe, shared by the desktop release-to-fire
// and the mobile Fire button. `cupWidth` sizes the muzzle offset; `capacity` caps
// the inputs. Returns the filled slot, or null when full.
export const launchBall = (cupWidth: number, capacity: number): number | null => {
	const m = muzzle(apparatus.x, cupWidth, apparatus.angle);
	const vel = launchVelocity(apparatus.angle);
	return addBall(createBall(m.x, m.y, vel.x, vel.y), capacity);
};

// Remove a ball — but only if it's at rest. Frees its slot for reuse and wakes
// the rest of the pile so anything that was resting on it re-settles. If it was
// the last ball, the whole ordering resets. Returns true if it removed one.
export const removeBall = (ball: Ball): boolean => {
	if (!ball.resting) return false;
	const slot = slotOf.get(ball);
	if (slot === undefined) return false;
	balls.splice(balls.indexOf(ball), 1);
	slotOf.delete(ball);
	if (balls.length === 0) {
		freed.length = 0;
		placed = 0;
	} else {
		freed.push(slot);
		for (const b of balls) b.resting = false; // re-settle the pile fairly
	}
	return true;
};

// The input index a ball currently fills (undefined if it isn't tracked).
export const slotFor = (ball: Ball): number | undefined => slotOf.get(ball);

// Project the balls onto the code inputs: each resting ball writes its current
// letter into the slot it owns; everything else stays "". `letterAt` maps an
// x-position to its slot letter.
export const projectEntered = (capacity: number, letterAt: (x: number) => string): string[] => {
	const out: string[] = Array(capacity).fill("");
	for (const ball of balls) {
		if (ball.resting) out[slotOf.get(ball)!] = letterAt(ball.pos.x);
	}
	return out;
};
