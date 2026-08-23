import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
    plugins: [react()],

    build: {
        target: 'es2020',
        outDir: 'dist',
        emptyOutDir: true
    },

    server: {
        port: 5173,

        proxy: {
            '/graphql': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                secure: false
            },

            '/health': {
                target: 'http://localhost:3000',
                changeOrigin: true
            }
        }
    }
})
