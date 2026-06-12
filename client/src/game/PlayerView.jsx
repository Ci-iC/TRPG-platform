import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Stage from './Stage.jsx'
import Dialogue from './Dialogue.jsx'
import PerformanceLayer from './PerformanceLayer.jsx'
import {
  CharacterCardPanel, InventoryPanel, CluesPanel, FiguresPanel, DicePanel,
} from './PlayerPanels.jsx'

const TOOLS = [
  { key: 'card', icon: '📇', label: '角色卡' },
  { key: 'bag', icon: '🎒', label: '背包' },
  { key: 'clue', icon: '🔍', label: '线索' },
  { key: 'figure', icon: '🎭', label: '人物' },
  { key: 'dice', icon: '🎲', label: '骰点' },
]

export default function PlayerView({ room, groupId, templateFields }) {
  const nav = useNavigate()
  const [tool, setTool] = useState(null)
  const {
    snapshot, members, messages, scene, overlayChar, overlayFocus,
    gameState, muted, status, online, figures, cluesVer, invVer,
    sendChat, rollDice,
  } = room

  const me = snapshot.me

  const renderPanel = () => {
    switch (tool) {
      case 'card': return <CharacterCardPanel groupId={groupId} templateFields={templateFields} />
      case 'bag': return <InventoryPanel groupId={groupId} members={members} me={me} invVer={invVer} />
      case 'clue': return <CluesPanel groupId={groupId} cluesVer={cluesVer} />
      case 'figure': return <FiguresPanel groupId={groupId} figures={figures} />
      case 'dice': return <DicePanel rollDice={rollDice} />
      default: return null
    }
  }

  return (
    <div className="game-root">
      <div className="topbar">
        <span className="brand">{snapshot.group.name}</span>
        <span className={`tag ${status === 'ended' ? 'ended' : gameState === 'running' ? 'ongoing' : ''}`}>
          {status === 'ended' ? '已结束' : gameState === 'running' ? '进行中' : '已暂停'}
        </span>
        {muted && <span className="tag" style={{ color: 'var(--purple)' }}>禁言中</span>}
        <span className="spacer" />
        <span className="muted">在线 {online.length}</span>
        <button className="sm ghost" onClick={() => nav('/')}>退出</button>
      </div>

      <div className="game-body">
        {/* 左侧工具栏 */}
        <div className="toolbar">
          {TOOLS.map((t) => (
            <div
              key={t.key}
              className={`tool-icon ${tool === t.key ? 'active' : ''}`}
              title={t.label}
              onClick={() => setTool(tool === t.key ? null : t.key)}
            >
              {t.icon}
            </div>
          ))}
        </div>
        {tool && (
          <div className="tool-panel">
            <header>{TOOLS.find((t) => t.key === tool).label}</header>
            <div className="body">{renderPanel()}</div>
          </div>
        )}

        {/* 中央：舞台 + 对话 */}
        <div className="stage-col">
          <Stage scene={scene} overlayChar={overlayChar} overlayFocus={overlayFocus} />
          <Dialogue
            groupId={groupId} messages={messages} isKP={false}
            gameState={gameState} muted={muted} status={status} sendChat={sendChat}
          />
        </div>
      </div>

      {/* 立绘演出：全屏浮层，覆盖整个界面 */}
      <PerformanceLayer />
    </div>
  )
}
