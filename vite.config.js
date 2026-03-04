import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gdeltKey = env.VITE_GDELT_API_KEY;

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/gdelt': {
          target: 'https://gdeltcloud.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/gdelt/, '/api/v1/media-events'),
          configure: (proxy) => {
            if (gdeltKey) {
              proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('Authorization', `Bearer ${gdeltKey}`));
            }
          },
        },
      },
    },
  };
})
