import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 850,
    rollupOptions: {
      output: {
        // Keep icon font filenames stable so we can preload them in index.html.
        assetFileNames(info) {
          const n = info.name || ''
          if (/\.(woff2?|eot|ttf)$/i.test(n)) return `assets/[name][extname]`
          return `assets/[name].[hash][extname]`
        },
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react'
          if (id.includes('node_modules/recharts')) return 'recharts'
          if (id.includes('node_modules/papaparse')) return 'papaparse'
          if (id.includes('node_modules/@google/generative-ai')) return 'gemini'
          if (id.includes('node_modules/xlsx')) return 'excel'
          if (id.includes('node_modules/pdfjs-dist')) return 'pdf'
          if (id.includes('node_modules/mammoth')) return 'docx'
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // En local, `pnpm dev` solo sirve el frontend: /api/* se reenvía al
      // backend (vercel dev en :3000). Sin backend corriendo, /api/chat
      // dará 404/ECONNREFUSED y la UI muestra el aviso accionable.
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
    fs: {
      deny: ['/api/**'],
    },
  },
  preview: {
    port: 4173,
  },
})
