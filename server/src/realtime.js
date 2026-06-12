// 共享 socket.io 实例，供 REST 路由在写库后向团房间广播
let _io = null

export const setIO = (io) => { _io = io }
export const getIO = () => _io

export const roomOf = (groupId) => `group:${groupId}`

// 向某团所有在线成员广播事件
export const emitToGroup = (groupId, event, payload) => {
  if (_io) _io.to(roomOf(groupId)).emit(event, payload)
}

// 向某个账号的所有 socket 广播（按账号房间）
export const emitToAccount = (accountId, event, payload) => {
  if (_io) _io.to(`account:${accountId}`).emit(event, payload)
}
