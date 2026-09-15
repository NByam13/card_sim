import inertia from '@inertiajs/vite';
import { wayfinder } from '@laravel/vite-plugin-wayfinder';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { bunny } from 'laravel-vite-plugin/fonts';
import { defineConfig } from 'vite';

// The React Compiler is deliberately off. The board ported from PonyRec assigns
// refs during render (a handler ref kept current each render), which breaks the
// compiler's rules silently rather than loudly. Revisit once the board is
// generalised and those patterns are gone.
export default defineConfig({
  plugins: [
    laravel({
      input: ['resources/css/app.css', 'resources/js/app.tsx'],
      refresh: true,
      fonts: [
        bunny('Instrument Sans', {
          weights: [400, 500, 600],
        }),
      ],
    }),
    inertia(),
    react(),
    tailwindcss(),
    wayfinder({
      formVariants: true,
    }),
  ],
  server: {
    watch: {
      ignored: ['**/.agents/**', '**/.claude/**', '**/.cursor/**', '**/.junie/**', '**/vendor/**'],
    },
  },
});
