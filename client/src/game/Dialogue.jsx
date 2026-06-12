import { useEffect, useRef, useState } from 'react'
import api, { errMsg } from '../api.js'
import { useToast, Modal } from '../components/ui.jsx'
import MessageLine from './MessageLine.jsx'

// 下方对话区：日志 + 输入栏（发言模式切换）+ 历史/导出
export default function Dialogue({ groupId, messages, isKP, gameState, muted, status, sendChat, figures = [], npcSpeak }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [mode, setMode] = useState('character') // 玩家：character(角色发言) | action(玩家行动)
  const [speaker, setSpeaker] = useState('narration') // KP：narration(旁白) | <npcId>(以该 NPC 发言)
  const [showHistory, setShowHistory] = useState(false)
  const logRef = useRef(null)
  const npcs = figures.filter((f) => f.is_npc)

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const ended = status === 'ended'
  const paused = gameState !== 'running'
  const lockedForPlayer = !isKP && (ended || paused)
  const mutedForPlayer = !isKP && muted

  const send = async () => {
    const t = text.trim()
    if (!t) return
    let res
    if (isKP) {
      // KP：旁白讲述 走 action；选了 NPC 则以该角色发言并触发立绘演出
      res = speaker === 'narration' ? await sendChat('action', t) : await npcSpeak(Number(speaker), t)
    } else {
      res = await sendChat(mode, t)
    }
    if (res?.error) return toast(res.error)
    setText('')
  }

  const exportLog = async (format) => {
    try {
      const res = await api.get(`/groups/${groupId}/messages/export`, {
        params: { format }, responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `trpg_${groupId}.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { toast(errMsg(e)) }
  }

  return (
    <div className="dialogue">
      <div className="log" ref={logRef}>
        {messages.slice(-60).map((m) => <MessageLine key={m.id || `${m.type}-${m.created_at}-${Math.random()}`} m={m} />)}
      </div>
      <div className="input-bar">
        <button className="sm ghost" title="完整历史 / 导出" onClick={() => setShowHistory(true)}>＋</button>
        {lockedForPlayer ? (
          <span className="input-locked">{ended ? '游戏已结束' : '游戏未开始 / 已暂停，操作不可用'}</span>
        ) : mutedForPlayer ? (
          <span className="input-locked">正在剧情演出，请稍等</span>
        ) : isKP ? (
          <>
            <select className="speaker-select" value={speaker} title="选择发言身份"
              onChange={(e) => setSpeaker(e.target.value)}>
              <option value="narration">🎙 旁白 / 讲述</option>
              {npcs.map((n) => <option key={n.id} value={String(n.id)}>🎭 {n.name}</option>)}
            </select>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send() }}
              placeholder={speaker === 'narration'
                ? '以旁白讲述…'
                : `以「${npcs.find((n) => String(n.id) === speaker)?.name || ''}」身份发言…`}
            />
            <button className="primary sm" onClick={send}>发送</button>
          </>
        ) : (
          <>
            <span
              className={`mode-toggle ${mode}`}
              onClick={() => setMode(mode === 'character' ? 'action' : 'character')}
              title="点击切换发言模式"
            >
              {mode === 'character' ? '🎭 角色发言' : '👤 玩家行动'}
            </span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send() }}
              placeholder={mode === 'character' ? '以角色身份发言…' : '描述你的行动…'}
            />
            <button className="primary sm" onClick={send}>发送</button>
          </>
        )}
      </div>

      {showHistory && (
        <Modal title="完整对话记录" onClose={() => setShowHistory(false)} width={620}>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="spacer" />
            <button className="sm" onClick={() => exportLog('txt')}>导出 TXT</button>
            <button className="sm" onClick={() => exportLog('html')}>导出 HTML</button>
          </div>
          <div className="scroll" style={{ maxHeight: '60vh' }}>
            {messages.map((m) => (
              <div key={m.id} style={{ marginBottom: 4 }}>
                <span className="muted" style={{ fontSize: 11, marginRight: 6 }}>
                  {new Date(m.created_at).toLocaleTimeString('zh-CN')}
                </span>
                <MessageLine m={m} />
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
