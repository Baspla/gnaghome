import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');

    return {
        plugins: [tailwindcss(), sveltekit()],
        server: {
            port: 5173,
            strictPort: true,
            proxy: {
                '/api': {
                    target: env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
                    changeOrigin: true,
                    secure: false,
                    /*rewrite: (path) => path.replace(/^\/api/, ''),*/
                },
            },
        },
        ssr: {
            noExternal: ['bits-ui'],
        },
    };
});
