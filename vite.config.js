import { defineConfig } from 'vite';

// GitHub Pages serves a project site at https://<user>.github.io/<repo>/,
// so the built asset URLs must be prefixed with the repo name. Overridable
// via the BASE_PATH env var (the deploy workflow sets it from the repo name).
const base = process.env.BASE_PATH ?? '/prograpple/';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
  },
});
