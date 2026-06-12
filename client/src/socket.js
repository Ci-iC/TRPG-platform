import { io } from 'socket.io-client'

let socket = null

// 单例：首次调用时用当前 token 建立连接
export function getSocket() {
  if (socket && socket.connected) return socket
  if (!socket) {
    const token = localStorage.getItem('trpg_token')
    socket = io({
      auth: { token },
      autoConnect: true,
      transports: ['websocket', 'polling'],
    })
  }
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

// Promise 风格的 emit（带 ack）
export function emitAck(event, payload) {
  return new Promise((resolve) => {
    getSocket().emit(event, payload, (res) => resolve(res || {}))
  })
}
