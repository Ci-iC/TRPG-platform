import pg from 'pg'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// 显式从 server/.env 加载，避免随调用方 cwd 不同而找不到配置
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

// pg 默认把 BIGINT/numeric 当字符串，这里把 numeric(1700) 也按需处理；
// SERIAL(int4) 默认就是 number，无需特殊处理。
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
})

pool.on('error', (err) => {
  console.error('[pg] 空闲连接异常:', err.message)
})

export const query = (text, params) => pool.query(text, params)

// 取单行
export const one = async (text, params) => {
  const { rows } = await pool.query(text, params)
  return rows[0] || null
}

// 取多行
export const many = async (text, params) => {
  const { rows } = await pool.query(text, params)
  return rows
}
