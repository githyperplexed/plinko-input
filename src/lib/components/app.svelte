<script lang="ts">
	import PegRail from "$lib/components/peg-rail.svelte";
	import PinDisplay from "$lib/components/pin-display.svelte";
	import Scene from "$lib/components/scene.svelte";
	import TooSmall from "$lib/components/too-small.svelte";
	import TopPanel from "$lib/components/top-panel.svelte";
	import { refreshViewport, view } from "$lib/stores/view.svelte";

	// keep the too-small flag in sync; the game stays mounted and just freezes
	$effect(() => {
		const check = (): void => refreshViewport();
		window.addEventListener("resize", check);
		return () => window.removeEventListener("resize", check);
	});
</script>

{#if view.tooSmall}
	<!-- the game unmounts here, but its state lives in stores/balls, so it
	     resumes untouched the moment the window is big enough again -->
	<TooSmall />
{:else}
	<Scene />
	<TopPanel />
	<PegRail />
	<PinDisplay />
{/if}
