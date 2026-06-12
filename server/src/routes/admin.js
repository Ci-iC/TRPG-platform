import { Router } from 'express'
import { one, many, query } from '../db.js'
import { hashPassword } from '../auth.js'
import { requireAuth, requireSuperAdmin } from '../middleware.js'

const router = Router()
router.use(requireAuth, requireSuperAdmin)

// ---------- 账号管理 ----------
router.get('/accounts', async (req, res) => {
  const rows = await many(
    `SELECT id, username, is_super_admin, is_active, created_at
     FROM accounts ORDER BY id`
  )
  res.json(rows)
})

router.post('/accounts', async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: '用户名和初始密码必填' })
  const exists = await one('SELECT id FROM accounts WHERE username=$1', [username])
  if (exists) return res.status(409).json({ error: '用户名已存在' })
  const acc = await one(
    'INSERT INTO accounts(username, password_hash) VALUES($1,$2) RETURNING id, username, is_active',
    [username, hashPassword(password)]
  )
  res.json(acc)
})

// 启用/禁用
router.patch('/accounts/:id/active', async (req, res) => {
  const { active } = req.body || {}
  const acc = await one('SELECT * FROM accounts WHERE id=$1', [req.params.id])
  if (!acc) return res.status(404).json({ error: '账号不存在' })
  if (acc.is_super_admin) return res.status(400).json({ error: '不能禁用超级管理员' })
  await query('UPDATE accounts SET is_active=$1 WHERE id=$2', [!!active, req.params.id])
  res.json({ ok: true })
})

// 重置密码
router.post('/accounts/:id/reset-password', async (req, res) => {
  const { newPassword } = req.body || {}
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: '新密码至少 4 位' })
  const acc = await one('SELECT id FROM accounts WHERE id=$1', [req.params.id])
  if (!acc) return res.status(404).json({ error: '账号不存在' })
  await query('UPDATE accounts SET password_hash=$1 WHERE id=$2', [
    hashPassword(newPassword),
    req.params.id,
  ])
  res.json({ ok: true })
})

// ---------- 人物卡模板管理 ----------
router.get('/templates', async (req, res) => {
  res.json(await many('SELECT * FROM templates ORDER BY id'))
})

router.post('/templates', async (req, res) => {
  const { name, fields } = req.body || {}
  if (!name) return res.status(400).json({ error: '模板名必填' })
  const tpl = await one('INSERT INTO templates(name, fields) VALUES($1,$2) RETURNING *', [
    name,
    JSON.stringify(fields || []),
  ])
  res.json(tpl)
})

router.put('/templates/:id', async (req, res) => {
  const { name, fields } = req.body || {}
  const tpl = await one(
    'UPDATE templates SET name=COALESCE($1,name), fields=COALESCE($2,fields) WHERE id=$3 RETURNING *',
    [name || null, fields ? JSON.stringify(fields) : null, req.params.id]
  )
  if (!tpl) return res.status(404).json({ error: '模板不存在' })
  res.json(tpl)
})

router.delete('/templates/:id', async (req, res) => {
  const used = await one('SELECT id FROM groups WHERE template_id=$1 LIMIT 1', [req.params.id])
  if (used) return res.status(400).json({ error: '已有团使用该模板，无法删除' })
  await query('DELETE FROM templates WHERE id=$1', [req.params.id])
  res.json({ ok: true })
})

export default router
