import path from 'path';
import { defineConfig } from 'vite';
import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;
if (!rawPort) throw new Error('PORT environment variable is required');
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

const basePath = process.env.BASE_PATH;
if (!basePath) throw new Error('BASE_PATH environment variable is required');

export default defineConfig({
  base: basePath,
  plugins: [
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' && process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({ root: path.resolve(import.meta.dirname, '..') })
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) => m.devBanner()),
        ]
      : []),
  ],
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index:      path.resolve(import.meta.dirname, 'index.html'),
        login:      path.resolve(import.meta.dirname, 'login.html'),
        dashboard:  path.resolve(import.meta.dirname, 'dashboard.html'),
        warehouses: path.resolve(import.meta.dirname, 'warehouses.html'),
        products:   path.resolve(import.meta.dirname, 'products.html'),
        merchants:  path.resolve(import.meta.dirname, 'merchants.html'),
        employees:  path.resolve(import.meta.dirname, 'employees.html'),
        finances:   path.resolve(import.meta.dirname, 'finances.html'),
        salaries:   path.resolve(import.meta.dirname, 'salaries.html'),
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
