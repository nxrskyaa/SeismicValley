import { defineConfig } from 'vite'

// Nothing to configure but the port and the chunk warning. There is one entry
// point, no framework plugin, and no asset pipeline — three.js is the whole
// bundle, and splitting it would only trade one request for two.
export default defineConfig({
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 900 },
})
