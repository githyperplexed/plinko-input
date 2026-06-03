<script lang="ts">
	import { clampStageWidth, createBall, launchVelocity, muzzle, stageOffset } from "$lib/physics";
	import { apparatus } from "$lib/stores/apparatus.svelte";
	import { addBall } from "$lib/stores/balls";
	import { charset } from "$lib/stores/charset.svelte";
	import { game, PIN_LENGTH } from "$lib/stores/game.svelte";
	import { FIRE_BAR_HEIGHT, touch } from "$lib/stores/touch.svelte";

	let innerWidth = $state(0);
	// the bar spans the (capped, centered) play area, matching the canvas above it
	const stageX = $derived(stageOffset(innerWidth));
	const stageW = $derived(clampStageWidth(innerWidth));
	const cupWidth = $derived(stageW / charset.values.length);
	// every slot filled → nothing left to fire
	const ready = $derived(game.dropped < PIN_LENGTH);

	// Launch a ball along the cannon's current aim. Mirrors the scene's internal
	// fire(), but driven by the button so it never touches apparatus.x / angle —
	// the shot fires without disturbing the arc you've lined up.
	const onFire = () => {
		if (game.status !== "playing") return;
		const m = muzzle(apparatus.x, cupWidth, apparatus.angle);
		const vel = launchVelocity(apparatus.angle);
		addBall(createBall(m.x, m.y, vel.x, vel.y), PIN_LENGTH); // no-op when full
	};
</script>

<svelte:window bind:innerWidth />

{#if touch.coarse && game.status === "playing"}
	<!-- mobile-only: sits in the band below the raised floor, fully isolated -->
	<div
		class="fixed bottom-0 z-20 flex items-center px-4"
		style="left: {stageX}px; width: {stageW}px; height: {FIRE_BAR_HEIGHT}px"
	>
		<button
			disabled={!ready}
			onclick={onFire}
			class="w-full rounded-lg py-3 font-medium transition-colors
				{ready ? 'cursor-pointer bg-white text-black' : 'cursor-default bg-white/20 text-white/40'}"
		>
			Fire
		</button>
	</div>
{/if}
