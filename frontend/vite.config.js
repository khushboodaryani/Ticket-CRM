import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 4455,
        proxy: {
            '/api': {
                target: 'http://localhost:8450',
                changeOrigin: true,
            },
            '/attachments': {
                target: 'http://localhost:8450',
                changeOrigin: true,
            }
        }
    }
})
