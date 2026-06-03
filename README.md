# pinko

A plinko-style "enter the pin" game. Aim the cannon, drop balls through the
draggable peg rail, and land the target pin in the slots — then submit.

Built with Svelte 5 (runes) + Vite + Tailwind v4. Hand-written deterministic 2D
physics (gravity, swept collisions, ball-to-ball, a trajectory preview).

## Develop

```sh
bun install
bun run dev      # start the dev server
bun run build    # production build to dist/
bun run preview  # serve the build
bun run check    # svelte-check (types)
bun run format   # prettier
```
