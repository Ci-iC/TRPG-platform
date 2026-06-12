import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import { ToastProvider } from './components/ui.jsx'
import Login from './pages/Login.jsx'
import Lobby from './pages/Lobby.jsx'
import AdminConsole from './pages/AdminConsole.jsx'
import GameRoom from './pages/GameRoom.jsx'

function RequireAuth({ children }) {
  const { account } = useAuth()
  if (!account) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const { account } = useAuth()
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={account ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={<RequireAuth><Lobby /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><AdminConsole /></RequireAuth>} />
        <Route path="/game/:groupId" element={<RequireAuth><GameRoom /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  )
}
