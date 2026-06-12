import { Router } from 'express'
import { one, query } from '../db.js'
import { comparePassword, hashPassword, signToken } from '../auth.js'
import { requireAuth } from '../middleware.js'

const router = Router()

// 登录
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' })
  const acc = await one('SELECT * FROM accounts WHERE username=$1', [username])
  if (!acc || !comparePassword(password, acc.password_hash))
    return res.status(401).json({ error: '用户名或密码错误' })
  if (!acc.is_active) return res.status(403).json({ error: '账号已被禁用' })
  res.json({
    token: signToken(acc),
    account: { id: acc.id, username: acc.username, isSuperAdmin: acc.is_super_admin },
  })
})

// 当前账号信息
router.get('/me', requireAuth, (req, res) => {
  res.json({
    id: req.account.id,
    username: req.account.username,
    isSuperAdmin: req.account.is_super_admin,
  })
})

// 修改自己的密码
router.post('/change-password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {}
  if (!newPassword || newPassword.length < 4)
    return res.status(400).json({ error: '新密码至少 4 位' })
  const acc = await one('SELECT * FROM accounts WHERE id=$1', [req.account.id])
  if (!comparePassword(oldPassword || '', acc.password_hash))
    return res.status(400).json({ error: '原密码错误' })
  await query('UPDATE accounts SET password_hash=$1 WHERE id=$2', [
    hashPassword(newPassword),
    req.account.id,
  ])
  res.json({ ok: true })
})

export default router
