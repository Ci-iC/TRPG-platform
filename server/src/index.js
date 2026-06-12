import 'express-async-errors' // 让 async 路由里的错误自动转交错误中间件，而非崩溃进程
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { Server } from 'socket.io'

import { setIO } from './realtime.js'
import { setupSocket } from './socket/index.js'
import authRoutes from './routes/auth.js'
import adminRoutes from './routes/admin.js'
import groupRoutes from './routes/groups.js'
import gameRoutes from './routes/game.js'
import uploadRoutes from './routes/upload.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const app = express()
const PORT = process.env.PORT || 4000
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173'

app.use(cors({ origin: ORIGIN, credentials: true }))
app.use(express.json({ limit: '2mb' }))

// 静态：上传的图片
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }))

app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/groups', groupRoutes)
app.use('/api/groups', gameRoutes) // 游戏内容子路由（mergeParams）
app.use('/api/upload', uploadRoutes)

// 统一错误处理（multer 等）
app.use((err, req, res, next) => {
  console.error('[api error]', err.message)
  res.status(err.status || 500).json({ error: err.message || '服务器内部错误' })
})

const server = http.createServer(app)
const io = new Server(server, { cors: { origin: ORIGIN, credentials: true } })
setIO(io)
setupSocket(io)

server.listen(PORT, () => {
  console.log(`[server] HTTP + WebSocket 监听于 http://localhost:${PORT}`)
  console.log(`[server] 允许前端来源: ${ORIGIN}`)
})

// 兜底：任何漏网的异常/拒绝都只记录日志，绝不让进程崩溃退出
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err))
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err))
