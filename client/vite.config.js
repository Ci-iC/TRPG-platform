import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 前端 5173，API 与上传静态资源、socket.io 全部代理到后端 4000
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true, // 就绪后自动打开浏览器
    proxy: {
      '/api': { target: 'http://localhost:4100', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4100', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4100', ws: true, changeOrigin: true },
    },
  },
})
