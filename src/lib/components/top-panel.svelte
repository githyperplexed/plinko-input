<script lang="ts">
	import {
		CANNON_BASE_RATIO,
		CANNON_LENGTH_RATIO,
		CANNON_WIDTH_RATIO,
		clampStageWidth,
		stageOffset
	} from "$lib/physics";
	import { apparatus } from "$lib/stores/apparatus.svelte";
	import { charset } from "$lib/stores/charset.svelte";

	let innerWidth = $state(0);

	// sizing keys off the capped, centered play area; apparatus.x is stage-local,
	// so the on-screen pivot is the stage offset + apparatus.x
	const stageW = $derived(clampStageWidth(innerWidth));
	const stageX = $derived(stageOffset(innerWidth));
	const cupWidth = $derived(stageW / charset.values.length);
	const baseRadius = $derived(cupWidth * CANNON_BASE_RATIO);
	const length = $derived(cupWidth * CANNON_LENGTH_RATIO);
	const barrelWidth = $derived(cupWidth * CANNON_WIDTH_RATIO);
	const barrelRadius = $derived(barrelWidth * 0.4);
	// CSS rotates clockwise for +deg; our angle is + toward the right, so negate
	const deg = $derived((-apparatus.angle * 180) / Math.PI);

	// Grab + drag to reposition the cannon. Works on desktop and touch alike, and
	// deliberately never fires: the scene's fire-on-release only triggers for an
	// aim press (which lands on the canvas underneath, not on this handle), and it
	// bails on `apparatus.panning` so its hover-pan doesn't fight the drag.
	const margin = $derived(cupWidth * CANNON_BASE_RATIO); // keep the base on-stage

	const onDown = (e: PointerEvent) => {
		e.preventDefault(); // no text selection / native drag
		apparatus.panning = true;
		apparatus.angle = 0; // sits straight down while being moved
		document.body.style.cursor = "grabbing";
	};

	const onMove = (e: PointerEvent) => {
		if (!apparatus.panning) return;
		const x = e.clientX - stageX; // window → stage-local
		apparatus.x = Math.min(Math.max(x, margin), stageW - margin);
	};

	const onUp = () => {
		if (!apparatus.panning) return;
		apparatus.panning = false;
		document.body.style.cursor = "";
	};
</script>

<svelte:window bind:innerWidth onpointermove={onMove} onpointerup={onUp} onpointercancel={onUp} />

<!-- pivot: pans across the top at the stage offset + apparatus.x; purely visual,
	so it never blocks the aim press (which is read off the canvas underneath) -->
<div class="pointer-events-none fixed top-0 z-10" style="left: {stageX + apparatus.x}px">
	<!-- barrel: hangs from the pivot and swings toward the aim -->
	<div
		class="absolute top-0 left-0 bg-white"
		style="width: {barrelWidth}px; height: {length}px; margin-left: {-barrelWidth /
			2}px; transform-origin: 50% 0; transform: rotate({deg}deg); border-radius: 0 0 {barrelRadius}px {barrelRadius}px"
	></div>
	<!-- base: fixed semicircle the barrel pivots on, drawn over the joint -->
	<div
		class="absolute top-0 left-0 bg-neutral-400"
		style="width: {baseRadius *
			2}px; height: {baseRadius}px; margin-left: {-baseRadius}px; border-radius: 0 0 {baseRadius}px {baseRadius}px"
	></div>
	<!-- transparent grab handle over the cannon: press + drag here to reposition it
		 (touch-none so the browser doesn't claim the drag as a scroll gesture) -->
	<button
		aria-label="Drag the cannon"
		class="pointer-events-auto absolute top-0 left-0 touch-none bg-transparent"
		class:cursor-grab={!apparatus.panning}
		class:cursor-grabbing={apparatus.panning}
		style="width: {baseRadius * 2}px; height: {length}px; margin-left: {-baseRadius}px"
		onpointerdown={onDown}
	></button>
</div>
