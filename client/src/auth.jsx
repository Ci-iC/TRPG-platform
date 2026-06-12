import { createContext, useContext, useState, useCallback } from 'react'
import api from './api.js'
import { disconnectSocket } from './socket.js'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('trpg_account') || 'null')
    } catch {
      return null
    }
  })

  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password })
    localStorage.setItem('trpg_token', data.token)
    localStorage.setItem('trpg_account', JSON.stringify(data.account))
    setAccount(data.account)
    return data.account
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('trpg_token')
    localStorage.removeItem('trpg_account')
    disconnectSocket()
    setAccount(null)
  }, [])

  return <AuthCtx.Provider value={{ account, login, logout }}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
