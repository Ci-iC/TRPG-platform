import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api.js'
import { useGameRoom } from '../game/useGameRoom.js'
import PlayerView from '../game/PlayerView.jsx'
import KPConsole from '../game/KPConsole.jsx'

export default function GameRoom() {
  const { groupId } = useParams()
  const nav = useNavigate()
  const room = useGameRoom(groupId)
  const [templateFields, setTemplateFields] = useState([])

  // 取该团模板字段
  useEffect(() => {
    const tid = room.snapshot?.group?.templateId
    if (!tid) { setTemplateFields([]); return }
    api.get('/groups/templates').then(({ data }) => {
      const tpl = data.find((t) => t.id === tid)
      setTemplateFields(tpl?.fields || [])
    })
  }, [room.snapshot?.group?.templateId])

  if (room.error) {
    return (
      <div className="page"><div className="card">
        <p style={{ color: 'var(--danger)' }}>{room.error}</p>
        <button onClick={() => nav('/')}>返回大厅</button>
      </div></div>
    )
  }
  if (!room.snapshot) return <div className="center" style={{ height: '100vh' }}>加载中…</div>

  return room.snapshot.isKP
    ? <KPConsole room={room} groupId={groupId} templateFields={templateFields} />
    : <PlayerView room={room} groupId={groupId} templateFields={templateFields} />
}
