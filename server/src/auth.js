import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const SECRET = process.env.JWT_SECRET || 'trpg_dev_secret_change_me'

export const hashPassword = (pw) => bcrypt.hashSync(pw, 10)
export const comparePassword = (pw, hash) => bcrypt.compareSync(pw, hash)

export const signToken = (account) =>
  jwt.sign(
    { id: account.id, username: account.username, isSuperAdmin: account.is_super_admin },
    SECRET,
    { expiresIn: '30d' }
  )

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, SECRET)
  } catch {
    return null
  }
}
