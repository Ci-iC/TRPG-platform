import { verifyToken } from './auth.js'
import { one } from './db.js'

// 解析 Bearer token -> req.account
export async function requireAuth(req, res, next) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  const payload = token && verifyToken(token)
  if (!payload) return res.status(401).json({ error: '未登录或登录已过期' })
  const acc = await one(
    'SELECT id, username, is_super_admin, is_active FROM accounts WHERE id=$1',
    [payload.id]
  )
  if (!acc) return res.status(401).json({ error: '账号不存在' })
  if (!acc.is_active) return res.status(403).json({ error: '账号已被禁用' })
  req.account = acc
  next()
}

export function requireSuperAdmin(req, res, next) {
  if (!req.account?.is_super_admin) return res.status(403).json({ error: '需要超级管理员权限' })
  next()
}

// 校验当前账号是团内已通过成员，挂载 req.membership / req.group
export async function requireMember(req, res, next) {
  const groupId = Number(req.params.groupId || req.body.groupId)
  if (!groupId) return res.status(400).json({ error: '缺少 groupId' })
  const group = await one('SELECT * FROM groups WHERE id=$1', [groupId])
  if (!group) return res.status(404).json({ error: '团不存在' })
  const m = await one(
    "SELECT * FROM memberships WHERE group_id=$1 AND account_id=$2 AND status='approved'",
    [groupId, req.account.id]
  )
  // KP 即创建者，也视为成员
  const isKP = group.kp_id === req.account.id
  if (!m && !isKP) return res.status(403).json({ error: '你不是该团成员' })
  req.group = group
  req.membership = m
  req.isKP = isKP
  next()
}

export async function requireKP(req, res, next) {
  await requireMember(req, res, () => {
    if (!req.isKP) return res.status(403).json({ error: '仅 KP 可操作' })
    next()
  })
}
