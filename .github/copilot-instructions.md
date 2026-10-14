# Pulso Cero

Browser arcade game built with Vite, TypeScript, and Phaser 3.

## Project guidance

- Keep gameplay and UI event wiring in `src/main.ts`; keep responsive presentation in `src/style.css`.
- Preserve keyboard and touch controls, escalating obstacle difficulty, run scoring, and localStorage progression.
- Avoid adding external media or services; the game uses Phaser primitives for its visuals.
- Run `npm run build` after code changes and `npm run dev` to play locally.

## Setup status

- [x] Requirements clarified and project scaffolded in the workspace root.
- [x] Playable arcade prototype and README created.
- [x] No VS Code extensions are required.
- [ ] Production build pending: Node.js/npm are not installed in the current environment.
- [ ] Launch pending user confirmation to start the development server.
