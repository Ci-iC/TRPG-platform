import { verifyToken } from '../auth.js'
import { one } from '../db.js'
import { roomOf } from '../realtime.js'
import { createMessage } from '../messages.js'
import { rollExpression } from '../dice.js'

// 在线状态：groupId -> Map(accountId -> socket 数)
const presence = new Map()

function addPresence(groupId, accountId) {
  if (!presence.has(groupId)) presence.set(groupId, new Map())
  const m = presence.get(groupId)
  m.set(accountId, (m.get(accountId) || 0) + 1)
}
function removePresence(groupId, accountId) {
  const m = presence.get(groupId)
  if (!m) return
  const n = (m.get(accountId) || 0) - 1
  if (n <= 0) m.delete(accountId)
  else m.set(accountId, n)
}
function onlineList(groupId) {
  return Array.from(presence.get(groupId)?.keys() || [])
}

async function memberContext(groupId, accountId) {
  const group = await one('SELECT * FROM groups WHERE id=$1', [groupId])
  if (!group) return null
  const isKP = group.kp_id === accountId
  const m = await one(
    "SELECT * FROM memberships WHERE group_id=$1 AND account_id=$2 AND status='approved'",
    [groupId, accountId]
  )
  if (!isKP && !m) return null
  return { group, isKP }
}

export function setupSocket(io) {
  // 鉴权中间件
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
    const payload = token && verifyToken(token)
    if (!payload) return next(new Error('unauthorized'))
    socket.accountId = payload.id
    socket.username = payload.username
    next()
  })

  io.on('connection', (socket) => {
    // 账号私有房间（用于定向通知：加入审批结果等）
    socket.join(`account:${socket.accountId}`)
    socket.joinedGroups = new Set()

    // 进入某团房间
    socket.on('group:join', async ({ groupId }, ack) => {
      const ctx = await memberContext(groupId, socket.accountId)
      if (!ctx) return ack?.({ error: '无权进入该团' })
      socket.join(roomOf(groupId))
      socket.joinedGroups.add(groupId)
      addPresence(groupId, socket.accountId)
      io.to(roomOf(groupId)).emit('presence:update', { online: onlineList(groupId) })
      ack?.({ ok: true, online: onlineList(groupId) })
    })

    socket.on('group:leave', ({ groupId }) => {
      socket.leave(roomOf(groupId))
      socket.joinedGroups.delete(groupId)
      removePresence(groupId, socket.accountId)
      io.to(roomOf(groupId)).emit('presence:update', { online: onlineList(groupId) })
    })

    // 玩家/KP 发言：mode = 'character'(角色发言) | 'action'(玩家行动)
    socket.on('chat:send', async ({ groupId, mode, content }, ack) => {
      try {
        const ctx = await memberContext(groupId, socket.accountId)
        if (!ctx) return ack?.({ error: '无权发言' })
        const { group, isKP } = ctx
        if (group.status === 'ended') return ack?.({ error: '游戏已结束' })
        if (!isKP) {
          if (group.game_state !== 'running') return ack?.({ error: '游戏未开始或已暂停' })
          if (group.muted) return ack?.({ error: '正在剧情演出，请稍等' })
        }
        const text = String(content || '').trim()
        if (!text) return ack?.({ error: '内容为空' })

        if (mode === 'character') {
          // 取发言者自己的人物卡（KP 不通过此入口扮演 NPC，用 npc:speak）
          const ch = await one(
            'SELECT id, name, portrait FROM characters WHERE group_id=$1 AND owner_id=$2 AND is_npc=FALSE',
            [groupId, socket.accountId]
          )
          await createMessage(groupId, {
            type: 'character_speech',
            speakerName: ch?.name || socket.username,
            characterId: ch?.id || null,
            content: text,
            senderId: socket.accountId,
            meta: { portrait: ch?.portrait || null, performance: !!ch?.portrait },
          })
        } else {
          await createMessage(groupId, {
            type: 'player_action',
            speakerName: socket.username,
            content: text,
            senderId: socket.accountId,
          })
        }
        ack?.({ ok: true })
      } catch (e) {
        ack?.({ error: e.message })
      }
    })

    // KP 以 NPC 身份发言 -> 触发玩家端立绘演出
    socket.on('npc:speak', async ({ groupId, npcId, content }, ack) => {
      const ctx = await memberContext(groupId, socket.accountId)
      if (!ctx?.isKP) return ack?.({ error: '仅 KP 可操作' })
      const npc = await one(
        'SELECT id, name, portrait FROM characters WHERE id=$1 AND group_id=$2',
        [npcId, groupId]
      )
      if (!npc) return ack?.({ error: 'NPC 不存在' })
      const text = String(content || '').trim()
      if (!text) return ack?.({ error: '内容为空' })
      await createMessage(groupId, {
        type: 'character_speech',
        speakerName: npc.name,
        characterId: npc.id,
        content: text,
        senderId: socket.accountId,
        meta: { portrait: npc.portrait || null, performance: !!npc.portrait, npc: true },
      })
      ack?.({ ok: true })
    })

    // 骰点：hidden=true 为暗骰（仅 KP 可见，不广播）
    socket.on('dice:roll', async ({ groupId, expr, hidden }, ack) => {
      const ctx = await memberContext(groupId, socket.accountId)
      if (!ctx) return ack?.({ error: '无权骰点' })
      const { group, isKP } = ctx
      if (!isKP && group.game_state !== 'running')
        return ack?.({ error: '游戏未开始或已暂停' })
      const result = rollExpression(expr)
      if (!result.ok) return ack?.({ error: result.error })

      const text = `${socket.username} 投掷 ${result.expr} = ${result.detail} = ${result.total}`
      if (hidden && isKP) {
        // 暗骰：只回给发起的 KP，不入库不广播
        ack?.({ ok: true, hidden: true, text: `[暗骰] ${text}`, total: result.total })
        return
      }
      await createMessage(groupId, {
        type: 'dice',
        speakerName: socket.username,
        content: `[骰点] ${text}`,
        senderId: socket.accountId,
        meta: { expr: result.expr, detail: result.detail, total: result.total },
      })
      ack?.({ ok: true, total: result.total })
    })

    socket.on('disconnect', () => {
      for (const groupId of socket.joinedGroups) {
        removePresence(groupId, socket.accountId)
        io.to(roomOf(groupId)).emit('presence:update', { online: onlineList(groupId) })
      }
    })
  })
}
