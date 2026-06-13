import { Router } from 'express'
import { one, many, query } from '../db.js'
import { requireAuth, requireMember, requireKP } from '../middleware.js'
import { emitToAccount, emitToGroup } from '../realtime.js'
import { normalizeRule } from '../dice.js'

const router = Router()
router.use(requireAuth)

// 可选模板列表（开团时选择）
router.get('/templates', async (req, res) => {
  res.json(await many('SELECT id, name, fields FROM templates ORDER BY id'))
})

// 大厅：所有团（进行中在前），含 KP 名 / 人数 / 我对该团的申请状态
router.get('/', async (req, res) => {
  const rows = await many(
    `
    SELECT g.id, g.name, g.intro, g.max_players, g.status, g.created_at, g.cover,
           a.username AS kp_name, g.kp_id,
           (SELECT count(*)::int FROM memberships m
              WHERE m.group_id=g.id AND m.status='approved') AS member_count,
           (SELECT m.status FROM memberships m
              WHERE m.group_id=g.id AND m.account_id=$1) AS my_status,
           (SELECT count(*)::int FROM memberships m
              WHERE m.group_id=g.id AND m.status='pending') AS pending_count
    FROM groups g JOIN accounts a ON a.id=g.kp_id
    ORDER BY (g.status='ongoing') DESC, g.created_at DESC
  `,
    [req.account.id]
  )
  res.json(rows)
})

// 我参与的团（KP 或已通过成员），用于快速进入
router.get('/mine', async (req, res) => {
  const rows = await many(
    `
    SELECT g.id, g.name, g.status, g.created_at, g.cover,
           (g.kp_id=$1) AS is_kp,
           a.username AS kp_name
    FROM groups g
    JOIN accounts a ON a.id=g.kp_id
    LEFT JOIN memberships m ON m.group_id=g.id AND m.account_id=$1
    WHERE g.kp_id=$1 OR (m.status='approved')
    GROUP BY g.id, a.username
    ORDER BY g.created_at DESC
  `,
    [req.account.id]
  )
  res.json(rows)
})

// 开团：创建者自动成为 KP
router.post('/', async (req, res) => {
  const { name, intro, maxPlayers, templateId, cover, diceRule } = req.body || {}
  if (!name) return res.status(400).json({ error: '团名必填' })
  const g = await one(
    `INSERT INTO groups(name, intro, max_players, template_id, kp_id, cover, dice_rule)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [name, intro || '', maxPlayers || 6, templateId || null, req.account.id, cover || null,
     JSON.stringify(normalizeRule(diceRule))]
  )
  // KP 也写一条 membership 方便统一查询
  await query(
    `INSERT INTO memberships(group_id, account_id, role, status)
     VALUES($1,$2,'kp','approved') ON CONFLICT DO NOTHING`,
    [g.id, req.account.id]
  )
  res.json(g)
})

// 申请加入
router.post('/:groupId/join', async (req, res) => {
  const groupId = Number(req.params.groupId)
  const g = await one('SELECT * FROM groups WHERE id=$1', [groupId])
  if (!g) return res.status(404).json({ error: '团不存在' })
  if (g.status === 'ended') return res.status(400).json({ error: '该团已结束，无法加入' })
  if (g.kp_id === req.account.id) return res.status(400).json({ error: '你是该团 KP' })

  const exist = await one('SELECT * FROM memberships WHERE group_id=$1 AND account_id=$2', [
    groupId,
    req.account.id,
  ])
  if (exist) {
    if (exist.status === 'approved') return res.json({ status: 'approved' })
    if (exist.status === 'pending') return res.json({ status: 'pending' })
    // 被拒过，重新申请
    await query("UPDATE memberships SET status='pending' WHERE id=$1", [exist.id])
  } else {
    const approvedCount = await one(
      "SELECT count(*)::int AS c FROM memberships WHERE group_id=$1 AND status='approved'",
      [groupId]
    )
    if (approvedCount.c >= g.max_players)
      return res.status(400).json({ error: '该团人数已满' })
    await query(
      "INSERT INTO memberships(group_id, account_id, role, status) VALUES($1,$2,'player','pending')",
      [groupId, req.account.id]
    )
  }
  // 通知 KP
  emitToAccount(g.kp_id, 'join:request', {
    groupId,
    applicant: req.account.username,
  })
  res.json({ status: 'pending' })
})

// KP 查看待审批申请
router.get('/:groupId/requests', requireKP, async (req, res) => {
  const rows = await many(
    `SELECT m.id, m.account_id, a.username, m.created_at
     FROM memberships m JOIN accounts a ON a.id=m.account_id
     WHERE m.group_id=$1 AND m.status='pending' ORDER BY m.created_at`,
    [req.params.groupId]
  )
  res.json(rows)
})

// KP 审批
router.post('/:groupId/requests/:membershipId', requireKP, async (req, res) => {
  const { action } = req.body || {} // approve | reject
  const m = await one('SELECT * FROM memberships WHERE id=$1 AND group_id=$2', [
    req.params.membershipId,
    req.params.groupId,
  ])
  if (!m) return res.status(404).json({ error: '申请不存在' })
  if (action === 'approve') {
    const approvedCount = await one(
      "SELECT count(*)::int AS c FROM memberships WHERE group_id=$1 AND status='approved'",
      [req.params.groupId]
    )
    if (approvedCount.c >= req.group.max_players)
      return res.status(400).json({ error: '人数已满' })
    await query("UPDATE memberships SET status='approved' WHERE id=$1", [m.id])
  } else {
    await query("UPDATE memberships SET status='rejected' WHERE id=$1", [m.id])
  }
  emitToAccount(m.account_id, 'join:result', {
    groupId: Number(req.params.groupId),
    approved: action === 'approve',
  })
  // 通知团内（含 KP 自己其它端）刷新成员列表
  if (action === 'approve') emitToGroup(req.params.groupId, 'member:update', {})
  res.json({ ok: true })
})

// 进入团：完整状态快照（成员、当前场景、悬浮层、游戏状态）
router.get('/:groupId', requireMember, async (req, res) => {
  const g = req.group
  const members = await many(
    `SELECT a.id, a.username, m.role, m.status
     FROM memberships m JOIN accounts a ON a.id=m.account_id
     WHERE m.group_id=$1 AND m.status='approved'
     ORDER BY (m.role='kp') DESC, a.username`,
    [g.id]
  )
  const scenes = await many('SELECT * FROM scenes WHERE group_id=$1 ORDER BY id', [g.id])
  const currentScene = g.current_scene_id
    ? scenes.find((s) => s.id === g.current_scene_id) || null
    : null
  res.json({
    group: {
      id: g.id,
      name: g.name,
      intro: g.intro,
      maxPlayers: g.max_players,
      templateId: g.template_id,
      kpId: g.kp_id,
      status: g.status,
      gameState: g.game_state,
      muted: g.muted,
      cover: g.cover,
      currentScene,
      activeCharacter: g.active_character,
      activeFocus: g.active_focus,
      diceRule: normalizeRule(g.dice_rule),
    },
    members,
    isKP: req.isKP,
    me: { id: req.account.id, username: req.account.username },
  })
})

// KP 修改房间封面
router.post('/:groupId/cover', requireKP, async (req, res) => {
  const { cover } = req.body || {} // null = 清除
  await query('UPDATE groups SET cover=$1 WHERE id=$2', [cover || null, req.params.groupId])
  res.json({ ok: true })
})

// KP 修改骰点规则
router.post('/:groupId/dice-rule', requireKP, async (req, res) => {
  const rule = normalizeRule(req.body?.diceRule || req.body)
  await query('UPDATE groups SET dice_rule=$1 WHERE id=$2', [JSON.stringify(rule), req.params.groupId])
  res.json({ ok: true, diceRule: rule })
})

export default router
