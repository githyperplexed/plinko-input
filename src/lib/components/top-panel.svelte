<script lang="ts">
	import { CANNON_BASE_RATIO, CANNON_LENGTH_RATIO, CANNON_WIDTH_RATIO } from "$lib/physics";
	import { apparatus } from "$lib/stores/apparatus.svelte";
	import { charset } from "$lib/stores/charset.svelte";

	let innerWidth = $state(0);

	// every dimension is a ratio of one cup width, so the cannon keeps its
	// proportions at any size; the pivot is the top-center of the screen
	const cupWidth = $derived(innerWidth / charset.values.length);
	const baseRadius = $derived(cupWidth * CANNON_BASE_RATIO);
	const length = $derived(cupWidth * CANNON_LENGTH_RATIO);
	const barrelWidth = $derived(cupWidth * CANNON_WIDTH_RATIO);
	const barrelRadius = $derived(barrelWidth * 0.4);
	// CSS rotates clockwise for +deg; our angle is + toward the right, so negate
	const deg = $derived((-apparatus.angle * 180) / Math.PI);
</script>

<svelte:window bind:innerWidth />

<!-- pivot point: pans across the top at apparatus.x; purely visual, so it never
	blocks the aim press (which is read off the canvas underneath) -->
<div class="pointer-events-none fixed top-0 z-10" style="left: {apparatus.x}px">
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
</div>
