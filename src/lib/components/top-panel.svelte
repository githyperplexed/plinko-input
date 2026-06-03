<script lang="ts">
	import {
		APPARATUS_BASE_HEIGHT_RATIO,
		APPARATUS_BASE_PEEK_RATIO,
		APPARATUS_BODY_RATIO
	} from "$lib/physics";
	import { apparatus } from "$lib/stores/apparatus.svelte";
	import { charset } from "$lib/stores/charset.svelte";

	let innerWidth = $state(0);

	// The body is exactly one cup wide; every other dimension is a ratio of that
	// width, so the cannon keeps its proportions at any window size.
	const bodyWidth = $derived(innerWidth / charset.values.length);
	const bodyHeight = $derived(bodyWidth * APPARATUS_BODY_RATIO);
	const baseWidth = $derived(bodyWidth * 0.75);
	const baseHeight = $derived(bodyWidth * APPARATUS_BASE_HEIGHT_RATIO);
	const peek = $derived(bodyWidth * APPARATUS_BASE_PEEK_RATIO);
	const radius = $derived(bodyWidth * 0.22);

	// Left offset derived from the persisted aim fraction (clamped on screen), so
	// the cannon keeps its position across an unmount and starts centered (0.5).
	const x = $derived(
		Math.min(
			Math.max(apparatus.aim * innerWidth - bodyWidth / 2, 0),
			Math.max(0, innerWidth - bodyWidth)
		)
	);

	function onMouseMove(e: MouseEvent) {
		if (innerWidth > 0) apparatus.aim = e.clientX / innerWidth;
	}

	// publish the mouth position (center x, bottom y) for the scene to read
	$effect(() => {
		apparatus.x = x + bodyWidth / 2;
		apparatus.y = bodyHeight;
	});
</script>

<svelte:window bind:innerWidth onmousemove={onMouseMove} />

<div class="fixed inset-x-0 top-0">
	<div class="absolute top-0" style="left: {x}px">
		<div class="relative flex justify-center">
			<!-- lower body, peeking out behind to the bottom -->
			<div
				class="absolute top-0 left-1/2 bg-neutral-300"
				style="width: {baseWidth}px; height: {baseHeight}px; transform: translate(-50%, {peek}px); border-radius: 0 0 {radius}px {radius}px"
			></div>
			<!-- big body -->
			<div
				class="relative z-10 bg-white"
				style="width: {bodyWidth}px; height: {bodyHeight}px; border-radius: 0 0 {radius}px {radius}px"
			></div>
		</div>
	</div>
</div>
