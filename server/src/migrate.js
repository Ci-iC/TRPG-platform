// 迁移 + 种子：建表、创建超管、内置默认人物卡模板
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import { pool, one } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

async function run() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  console.log('[migrate] 建表中...')
  await pool.query(schema)

  // 超级管理员
  const adminUser = process.env.SUPER_ADMIN_USER || 'admin'
  const adminPass = process.env.SUPER_ADMIN_PASS || 'admin888'
  const existing = await one('SELECT id FROM accounts WHERE username=$1', [adminUser])
  if (!existing) {
    const hash = bcrypt.hashSync(adminPass, 10)
    await pool.query(
      'INSERT INTO accounts(username, password_hash, is_super_admin) VALUES($1,$2,TRUE)',
      [adminUser, hash]
    )
    console.log(`[migrate] 已创建超级管理员: ${adminUser} / ${adminPass}`)
  } else {
    console.log('[migrate] 超级管理员已存在，跳过')
  }

  // 内置默认模板
  const tplCount = await one('SELECT count(*)::int AS c FROM templates')
  if (tplCount.c === 0) {
    const coc = [
      { name: '力量', type: 'number', default: '50' },
      { name: '体质', type: 'number', default: '50' },
      { name: '体型', type: 'number', default: '50' },
      { name: '敏捷', type: 'number', default: '50' },
      { name: '外貌', type: 'number', default: '50' },
      { name: '智力', type: 'number', default: '50' },
      { name: '意志', type: 'number', default: '50' },
      { name: '教育', type: 'number', default: '50' },
      { name: '幸运', type: 'number', default: '50' },
      { name: '理智', type: 'percent', default: '50' },
      { name: '生命值', type: 'number', default: '10' },
      { name: '魔法值', type: 'number', default: '10' },
      { name: '职业', type: 'text', default: '' },
      { name: '背景故事', type: 'text', default: '' },
    ]
    const dnd = [
      { name: '力量', type: 'number', default: '10' },
      { name: '敏捷', type: 'number', default: '10' },
      { name: '体质', type: 'number', default: '10' },
      { name: '智力', type: 'number', default: '10' },
      { name: '感知', type: 'number', default: '10' },
      { name: '魅力', type: 'number', default: '10' },
      { name: '生命值', type: 'number', default: '8' },
      { name: '护甲等级', type: 'number', default: '10' },
      { name: '职业', type: 'text', default: '' },
      { name: '种族', type: 'text', default: '' },
      { name: '等级', type: 'number', default: '1' },
    ]
    await pool.query('INSERT INTO templates(name, fields) VALUES($1,$2),($3,$4)', [
      'COC 七版', JSON.stringify(coc),
      'DND 5E', JSON.stringify(dnd),
    ])
    console.log('[migrate] 已写入默认模板: COC 七版 / DND 5E')
  } else {
    console.log('[migrate] 模板已存在，跳过')
  }

  console.log('[migrate] 完成 ✓')
  await pool.end()
}

run().catch((e) => {
  console.error('[migrate] 失败:', e)
  process.exit(1)
})
