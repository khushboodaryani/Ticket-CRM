import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 8994,
        host: '0.0.0.0',
        allowedHosts: [
            'support.voicemeetme.net'
        ],
        proxy: {
            '/api': {
                target: 'http://localhost:8995',
                changeOrigin: true,
            },
            '/attachments': {
                target: 'http://localhost:8995',
                changeOrigin: true,
            },
            '/socket.io': {
                target: 'http://localhost:8995',
                ws: true,
                changeOrigin: true,
            }
        }
    }
})
