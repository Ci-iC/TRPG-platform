import { Router } from 'express'
import { one, many, query } from '../db.js'
import { requireAuth, requireMember, requireKP } from '../middleware.js'
import { emitToGroup } from '../realtime.js'

// mergeParams 让子路由能拿到 :groupId
const router = Router({ mergeParams: true })
router.use(requireAuth)

// 工具：写一条系统/场景消息并广播
async function pushMessage(groupId, { type, speakerName, characterId, content, meta, senderId }) {
  const msg = await one(
    `INSERT INTO messages(group_id, sender_id, type, speaker_name, character_id, content, meta)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [groupId, senderId || null, type, speakerName || null, characterId || null, content, meta ? JSON.stringify(meta) : null]
  )
  emitToGroup(groupId, 'message:new', msg)
  return msg
}

// ============ 人物卡 / 图鉴 ============

// 我的人物卡（每人每团一张）
router.get('/:groupId/my-character', requireMember, async (req, res) => {
  const c = await one(
    'SELECT * FROM characters WHERE group_id=$1 AND owner_id=$2 AND is_npc=FALSE',
    [req.params.groupId, req.account.id]
  )
  res.json(c)
})

// 新建/更新我的人物卡（保存后自动进入图鉴）
router.put('/:groupId/my-character', requireMember, async (req, res) => {
  const { name, portrait, attributes, intro } = req.body || {}
  if (!name) return res.status(400).json({ error: '角色名必填' })
  const existing = await one(
    'SELECT id FROM characters WHERE group_id=$1 AND owner_id=$2 AND is_npc=FALSE',
    [req.params.groupId, req.account.id]
  )
  let c
  if (existing) {
    c = await one(
      `UPDATE characters SET name=$1, portrait=$2, attributes=$3, intro=$4 WHERE id=$5 RETURNING *`,
      [name, portrait || null, JSON.stringify(attributes || {}), intro || '', existing.id]
    )
  } else {
    c = await one(
      `INSERT INTO characters(group_id, owner_id, is_npc, name, portrait, attributes, intro)
       VALUES($1,$2,FALSE,$3,$4,$5,$6) RETURNING *`,
      [req.params.groupId, req.account.id, name, portrait || null, JSON.stringify(attributes || {}), intro || '']
    )
  }
  emitToGroup(req.params.groupId, 'figure:update', { groupId: Number(req.params.groupId) })
  res.json(c)
})

// 图鉴：所有已出现角色（玩家卡 + NPC）
router.get('/:groupId/figures', requireMember, async (req, res) => {
  const rows = await many(
    `SELECT c.id, c.name, c.portrait, c.intro, c.is_npc, c.owner_id, c.attributes,
            a.username AS owner_name
     FROM characters c LEFT JOIN accounts a ON a.id=c.owner_id
     WHERE c.group_id=$1 ORDER BY c.is_npc, c.id`,
    [req.params.groupId]
  )
  res.json(rows)
})

// 我对某角色的私有备注
router.get('/:groupId/figures/:characterId/note', requireMember, async (req, res) => {
  const n = await one(
    'SELECT note FROM figure_notes WHERE group_id=$1 AND account_id=$2 AND character_id=$3',
    [req.params.groupId, req.account.id, req.params.characterId]
  )
  res.json({ note: n?.note || '' })
})

router.put('/:groupId/figures/:characterId/note', requireMember, async (req, res) => {
  const { note } = req.body || {}
  await query(
    `INSERT INTO figure_notes(group_id, account_id, character_id, note)
     VALUES($1,$2,$3,$4)
     ON CONFLICT(group_id, account_id, character_id) DO UPDATE SET note=EXCLUDED.note`,
    [req.params.groupId, req.account.id, req.params.characterId, note || '']
  )
  res.json({ ok: true })
})

// 我对某条线索的私有笔记（玩家自由记录，仅自己可见）
router.get('/:groupId/clues/:clueId/note', requireMember, async (req, res) => {
  const n = await one(
    'SELECT note FROM clue_notes WHERE group_id=$1 AND account_id=$2 AND clue_id=$3',
    [req.params.groupId, req.account.id, req.params.clueId]
  )
  res.json({ note: n?.note || '' })
})

router.put('/:groupId/clues/:clueId/note', requireMember, async (req, res) => {
  const { note } = req.body || {}
  await query(
    `INSERT INTO clue_notes(group_id, account_id, clue_id, note)
     VALUES($1,$2,$3,$4)
     ON CONFLICT(group_id, account_id, clue_id) DO UPDATE SET note=EXCLUDED.note`,
    [req.params.groupId, req.account.id, req.params.clueId, note || '']
  )
  res.json({ ok: true })
})

// ============ 背包 ============
async function inventoryOf(groupId, accountId) {
  return many('SELECT * FROM items WHERE group_id=$1 AND owner_id=$2 ORDER BY slot', [
    groupId,
    accountId,
  ])
}

router.get('/:groupId/inventory', requireMember, async (req, res) => {
  res.json(await inventoryOf(req.params.groupId, req.account.id))
})

// 整理：更新格子位置
router.post('/:groupId/inventory/move', requireMember, async (req, res) => {
  const { itemId, slot } = req.body || {}
  const item = await one('SELECT * FROM items WHERE id=$1 AND owner_id=$2', [itemId, req.account.id])
  if (!item) return res.status(404).json({ error: '物品不存在' })
  // 若目标格被占，交换
  const occupier = await one(
    'SELECT * FROM items WHERE group_id=$1 AND owner_id=$2 AND slot=$3',
    [req.params.groupId, req.account.id, slot]
  )
  if (occupier && occupier.id !== item.id) {
    await query('UPDATE items SET slot=$1 WHERE id=$2', [item.slot, occupier.id])
  }
  await query('UPDATE items SET slot=$1 WHERE id=$2', [slot, item.id])
  res.json(await inventoryOf(req.params.groupId, req.account.id))
})

// 丢弃
router.post('/:groupId/inventory/discard', requireMember, async (req, res) => {
  const { itemId, quantity } = req.body || {}
  const item = await one('SELECT * FROM items WHERE id=$1 AND owner_id=$2', [itemId, req.account.id])
  if (!item) return res.status(404).json({ error: '物品不存在' })
  const q = Math.max(1, Number(quantity) || 1)
  if (q >= item.quantity) await query('DELETE FROM items WHERE id=$1', [item.id])
  else await query('UPDATE items SET quantity=quantity-$1 WHERE id=$2', [q, item.id])
  res.json(await inventoryOf(req.params.groupId, req.account.id))
})

// 移交给队友
router.post('/:groupId/inventory/transfer', requireMember, async (req, res) => {
  const { itemId, quantity, toAccountId } = req.body || {}
  const item = await one('SELECT * FROM items WHERE id=$1 AND owner_id=$2', [itemId, req.account.id])
  if (!item) return res.status(404).json({ error: '物品不存在' })
  const target = await one(
    "SELECT * FROM memberships WHERE group_id=$1 AND account_id=$2 AND status='approved'",
    [req.params.groupId, toAccountId]
  )
  const isKPTarget = Number(toAccountId) === req.group.kp_id
  if (!target && !isKPTarget) return res.status(400).json({ error: '目标不是团内成员' })
  const q = Math.max(1, Number(quantity) || 1)
  if (q > item.quantity) return res.status(400).json({ error: '数量超出持有' })

  // 扣减来源
  if (q >= item.quantity) await query('DELETE FROM items WHERE id=$1', [item.id])
  else await query('UPDATE items SET quantity=quantity-$1 WHERE id=$2', [q, item.id])

  // 目标已有同名物品则叠加，否则放入空格
  const existing = await one(
    'SELECT * FROM items WHERE group_id=$1 AND owner_id=$2 AND name=$3 ORDER BY slot LIMIT 1',
    [req.params.groupId, toAccountId, item.name]
  )
  if (existing) {
    await query('UPDATE items SET quantity=quantity+$1 WHERE id=$2', [q, existing.id])
  } else {
    const slot = await nextFreeSlot(req.params.groupId, toAccountId)
    await query(
      'INSERT INTO items(group_id, owner_id, slot, name, quantity, description, image) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [req.params.groupId, toAccountId, slot, item.name, q, item.description, item.image || null]
    )
  }
  emitToGroup(req.params.groupId, 'inventory:update', { ownerIds: [req.account.id, Number(toAccountId)] })
  res.json(await inventoryOf(req.params.groupId, req.account.id))
})

async function nextFreeSlot(groupId, ownerId) {
  const rows = await many('SELECT slot FROM items WHERE group_id=$1 AND owner_id=$2 ORDER BY slot', [
    groupId,
    ownerId,
  ])
  const used = new Set(rows.map((r) => r.slot))
  let s = 0
  while (used.has(s)) s++
  return s
}

// KP 为玩家新增物品
router.post('/:groupId/inventory/grant', requireKP, async (req, res) => {
  const { accountId, name, quantity, description, image } = req.body || {}
  if (!name) return res.status(400).json({ error: '物品名必填' })
  const slot = await nextFreeSlot(req.params.groupId, accountId)
  await query(
    'INSERT INTO items(group_id, owner_id, slot, name, quantity, description, image) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [req.params.groupId, accountId, slot, name, Math.max(1, Number(quantity) || 1), description || '', image || null]
  )
  emitToGroup(req.params.groupId, 'inventory:update', { ownerIds: [Number(accountId)] })
  res.json({ ok: true })
})

// KP 查看任意玩家背包
router.get('/:groupId/players/:accountId/inventory', requireKP, async (req, res) => {
  res.json(await inventoryOf(req.params.groupId, req.params.accountId))
})

// KP 查看/编辑任意玩家人物卡
router.get('/:groupId/players/:accountId/character', requireKP, async (req, res) => {
  const c = await one(
    'SELECT * FROM characters WHERE group_id=$1 AND owner_id=$2 AND is_npc=FALSE',
    [req.params.groupId, req.params.accountId]
  )
  res.json(c)
})

router.put('/:groupId/players/:accountId/character', requireKP, async (req, res) => {
  const { name, portrait, attributes, intro } = req.body || {}
  const existing = await one(
    'SELECT id FROM characters WHERE group_id=$1 AND owner_id=$2 AND is_npc=FALSE',
    [req.params.groupId, req.params.accountId]
  )
  let c
  if (existing) {
    c = await one(
      'UPDATE characters SET name=COALESCE($1,name), portrait=$2, attributes=$3, intro=$4 WHERE id=$5 RETURNING *',
      [name || null, portrait || null, JSON.stringify(attributes || {}), intro || '', existing.id]
    )
  } else {
    if (!name) return res.status(400).json({ error: '角色名必填' })
    c = await one(
      `INSERT INTO characters(group_id, owner_id, is_npc, name, portrait, attributes, intro)
       VALUES($1,$2,FALSE,$3,$4,$5,$6) RETURNING *`,
      [req.params.groupId, req.params.accountId, name, portrait || null, JSON.stringify(attributes || {}), intro || '']
    )
  }
  emitToGroup(req.params.groupId, 'figure:update', { groupId: Number(req.params.groupId) })
  res.json(c)
})

// ============ NPC ============
router.post('/:groupId/npcs', requireKP, async (req, res) => {
  const { name, portrait, intro, attributes } = req.body || {}
  if (!name) return res.status(400).json({ error: 'NPC 名必填' })
  const c = await one(
    `INSERT INTO characters(group_id, owner_id, is_npc, name, portrait, attributes, intro)
     VALUES($1,NULL,TRUE,$2,$3,$4,$5) RETURNING *`,
    [req.params.groupId, name, portrait || null, JSON.stringify(attributes || {}), intro || '']
  )
  emitToGroup(req.params.groupId, 'figure:update', { groupId: Number(req.params.groupId) })
  res.json(c)
})

router.put('/:groupId/npcs/:id', requireKP, async (req, res) => {
  const { name, portrait, intro, attributes } = req.body || {}
  const c = await one(
    `UPDATE characters SET name=COALESCE($1,name), portrait=$2, intro=$3, attributes=$4
     WHERE id=$5 AND group_id=$6 AND is_npc=TRUE RETURNING *`,
    [name || null, portrait || null, intro || '', JSON.stringify(attributes || {}), req.params.id, req.params.groupId]
  )
  if (!c) return res.status(404).json({ error: 'NPC 不存在' })
  emitToGroup(req.params.groupId, 'figure:update', { groupId: Number(req.params.groupId) })
  res.json(c)
})

router.delete('/:groupId/npcs/:id', requireKP, async (req, res) => {
  await query('DELETE FROM characters WHERE id=$1 AND group_id=$2 AND is_npc=TRUE', [
    req.params.id,
    req.params.groupId,
  ])
  emitToGroup(req.params.groupId, 'figure:update', { groupId: Number(req.params.groupId) })
  res.json({ ok: true })
})

// ============ 线索 ============
router.get('/:groupId/clues', requireMember, async (req, res) => {
  if (req.isKP) {
    const rows = await many(
      `SELECT c.*,
        COALESCE(json_agg(cr.account_id) FILTER (WHERE cr.id IS NOT NULL), '[]') AS recipients
       FROM clues c LEFT JOIN clue_recipients cr ON cr.clue_id=c.id
       WHERE c.group_id=$1 GROUP BY c.id ORDER BY c.id`,
      [req.params.groupId]
    )
    return res.json(rows)
  }
  // 玩家：分发给我或全体(null)的线索
  const rows = await many(
    `SELECT DISTINCT c.* FROM clues c JOIN clue_recipients cr ON cr.clue_id=c.id
     WHERE c.group_id=$1 AND (cr.account_id=$2 OR cr.account_id IS NULL)
     ORDER BY c.id`,
    [req.params.groupId, req.account.id]
  )
  res.json(rows)
})

router.post('/:groupId/clues', requireKP, async (req, res) => {
  const { title, image, description } = req.body || {}
  if (!title) return res.status(400).json({ error: '线索标题必填' })
  const c = await one(
    'INSERT INTO clues(group_id, title, image, description) VALUES($1,$2,$3,$4) RETURNING *',
    [req.params.groupId, title, image || null, description || '']
  )
  res.json(c)
})

router.post('/:groupId/clues/:clueId/distribute', requireKP, async (req, res) => {
  const { accountIds } = req.body || {} // 'all' 或 [id,...]
  await query('DELETE FROM clue_recipients WHERE clue_id=$1', [req.params.clueId])
  if (accountIds === 'all' || !accountIds) {
    await query('INSERT INTO clue_recipients(clue_id, account_id) VALUES($1,NULL)', [req.params.clueId])
    emitToGroup(req.params.groupId, 'clue:update', { groupId: Number(req.params.groupId) })
  } else {
    for (const aid of accountIds) {
      await query('INSERT INTO clue_recipients(clue_id, account_id) VALUES($1,$2)', [req.params.clueId, aid])
    }
    emitToGroup(req.params.groupId, 'clue:update', { groupId: Number(req.params.groupId), accountIds })
  }
  res.json({ ok: true })
})

// ============ 场景 ============
router.get('/:groupId/scenes', requireMember, async (req, res) => {
  res.json(await many('SELECT * FROM scenes WHERE group_id=$1 ORDER BY id', [req.params.groupId]))
})

router.post('/:groupId/scenes', requireKP, async (req, res) => {
  const { image, name } = req.body || {}
  if (!image) return res.status(400).json({ error: '场景图必填' })
  const s = await one(
    'INSERT INTO scenes(group_id, image, name) VALUES($1,$2,$3) RETURNING *',
    [req.params.groupId, image, name || '']
  )
  res.json(s)
})

router.delete('/:groupId/scenes/:sceneId', requireKP, async (req, res) => {
  await query('DELETE FROM scenes WHERE id=$1 AND group_id=$2', [req.params.sceneId, req.params.groupId])
  res.json({ ok: true })
})

// KP 切换当前场景：写场景切换标记 + 广播
router.post('/:groupId/scene/switch', requireKP, async (req, res) => {
  const { sceneId } = req.body || {}
  const scene = await one('SELECT * FROM scenes WHERE id=$1 AND group_id=$2', [sceneId, req.params.groupId])
  if (!scene) return res.status(404).json({ error: '场景不存在' })
  await query('UPDATE groups SET current_scene_id=$1 WHERE id=$2', [sceneId, req.params.groupId])
  await pushMessage(req.params.groupId, {
    type: 'scene_change',
    content: `场景切换：${scene.name || '未命名场景'}`,
    meta: { sceneId, image: scene.image },
  })
  emitToGroup(req.params.groupId, 'scene:switch', { scene })
  res.json({ ok: true })
})

// KP 撤下当前场景：舞台变黑 + 广播
router.post('/:groupId/scene/clear', requireKP, async (req, res) => {
  await query('UPDATE groups SET current_scene_id=NULL WHERE id=$1', [req.params.groupId])
  await pushMessage(req.params.groupId, { type: 'scene_change', content: '场景已撤下' })
  emitToGroup(req.params.groupId, 'scene:switch', { scene: null })
  res.json({ ok: true })
})

// ============ 焦点素材库 ============
router.get('/:groupId/focus-images', requireKP, async (req, res) => {
  res.json(await many('SELECT * FROM focus_images WHERE group_id=$1 ORDER BY id', [req.params.groupId]))
})

router.post('/:groupId/focus-images', requireKP, async (req, res) => {
  const { image, name } = req.body || {}
  if (!image) return res.status(400).json({ error: '焦点图必填' })
  const f = await one(
    'INSERT INTO focus_images(group_id, image, name) VALUES($1,$2,$3) RETURNING *',
    [req.params.groupId, image, name || '']
  )
  res.json(f)
})

router.delete('/:groupId/focus-images/:id', requireKP, async (req, res) => {
  await query('DELETE FROM focus_images WHERE id=$1 AND group_id=$2', [req.params.id, req.params.groupId])
  res.json({ ok: true })
})

// ============ 悬浮层 ============
router.post('/:groupId/overlay/character', requireKP, async (req, res) => {
  const { characterId } = req.body || {} // null = 撤下
  let payload = null
  if (characterId) {
    const c = await one('SELECT id, name, portrait FROM characters WHERE id=$1 AND group_id=$2', [
      characterId,
      req.params.groupId,
    ])
    if (!c) return res.status(404).json({ error: '角色不存在' })
    payload = { characterId: c.id, name: c.name, portrait: c.portrait }
  }
  await query('UPDATE groups SET active_character=$1 WHERE id=$2', [
    payload ? JSON.stringify(payload) : null,
    req.params.groupId,
  ])
  emitToGroup(req.params.groupId, 'overlay:character', payload)
  res.json({ ok: true })
})

router.post('/:groupId/overlay/focus', requireKP, async (req, res) => {
  const { image } = req.body || {} // null = 撤下
  const payload = image ? { image } : null
  await query('UPDATE groups SET active_focus=$1 WHERE id=$2', [
    payload ? JSON.stringify(payload) : null,
    req.params.groupId,
  ])
  emitToGroup(req.params.groupId, 'overlay:focus', payload)
  res.json({ ok: true })
})

// ============ KP 游戏控制 ============
router.post('/:groupId/control/state', requireKP, async (req, res) => {
  const { gameState } = req.body || {} // running | paused
  if (!['running', 'paused'].includes(gameState))
    return res.status(400).json({ error: '非法状态' })
  await query('UPDATE groups SET game_state=$1 WHERE id=$2', [gameState, req.params.groupId])
  emitToGroup(req.params.groupId, 'game:state', { gameState })
  await pushMessage(req.params.groupId, {
    type: 'broadcast',
    content: gameState === 'running' ? '游戏开始' : '游戏暂停',
  })
  res.json({ ok: true })
})

router.post('/:groupId/control/mute', requireKP, async (req, res) => {
  const { muted } = req.body || {}
  await query('UPDATE groups SET muted=$1 WHERE id=$2', [!!muted, req.params.groupId])
  emitToGroup(req.params.groupId, 'game:mute', { muted: !!muted })
  res.json({ ok: true })
})

router.post('/:groupId/control/end', requireKP, async (req, res) => {
  await query("UPDATE groups SET status='ended', game_state='paused' WHERE id=$1", [
    req.params.groupId,
  ])
  emitToGroup(req.params.groupId, 'game:ended', { groupId: Number(req.params.groupId) })
  await pushMessage(req.params.groupId, { type: 'broadcast', content: '本团游戏已结束' })
  res.json({ ok: true })
})

// ============ 对话记录 ============
router.get('/:groupId/messages', requireMember, async (req, res) => {
  const limit = Math.min(500, Number(req.query.limit) || 200)
  const rows = await many(
    'SELECT * FROM messages WHERE group_id=$1 ORDER BY id DESC LIMIT $2',
    [req.params.groupId, limit]
  )
  res.json(rows.reverse())
})

// 导出 TXT / HTML（保留时间戳与发言身份）
router.get('/:groupId/messages/export', requireMember, async (req, res) => {
  const format = req.query.format === 'html' ? 'html' : 'txt'
  const rows = await many('SELECT * FROM messages WHERE group_id=$1 ORDER BY id', [
    req.params.groupId,
  ])
  const g = req.group
  const fmtTime = (t) => new Date(t).toLocaleString('zh-CN')
  const label = (m) => {
    switch (m.type) {
      case 'character_speech': return `【${m.speaker_name || '角色'}】`
      case 'player_action': return `（${m.speaker_name || '玩家'} 行动）`
      case 'dice': return '[骰点]'
      case 'broadcast': return '[系统]'
      case 'scene_change': return '[场景]'
      default: return ''
    }
  }
  if (format === 'txt') {
    const lines = rows.map((m) => `[${fmtTime(m.created_at)}] ${label(m)} ${m.content}`)
    const body = `跑团记录 - ${g.name}\n导出时间: ${fmtTime(new Date())}\n\n` + lines.join('\n')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="trpg_${g.id}.txt"`)
    return res.send(body)
  }
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const rowsHtml = rows
    .map(
      (m) =>
        `<div class="msg ${m.type}"><span class="t">${fmtTime(m.created_at)}</span> <span class="l">${esc(label(m))}</span> <span class="c">${esc(m.content)}</span></div>`
    )
    .join('\n')
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>跑团记录 - ${esc(g.name)}</title>
<style>body{font-family:system-ui,'Microsoft YaHei';background:#1a1a22;color:#e8e8ef;max-width:820px;margin:0 auto;padding:24px}
h1{color:#c9a86a}.msg{padding:4px 0;border-bottom:1px solid #333;line-height:1.6}.t{color:#888;font-size:12px}
.character_speech .c{color:#9ecbff}.player_action .c{color:#aaa;font-style:italic}.dice .c{color:#f0b84a}
.broadcast .c{color:#ff6b6b;font-weight:bold}.scene_change{text-align:center;color:#777;font-size:13px}.l{color:#c9a86a}</style></head>
<body><h1>跑团记录 - ${esc(g.name)}</h1><p>导出时间：${fmtTime(new Date())}</p>${rowsHtml}</body></html>`
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="trpg_${g.id}.html"`)
  res.send(html)
})

export default router
