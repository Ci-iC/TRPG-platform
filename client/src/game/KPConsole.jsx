import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { errMsg } from '../api.js'
import { getSocket } from '../socket.js'
import { useToast, Modal, ImageUpload } from '../components/ui.jsx'
import Dialogue from './Dialogue.jsx'
import Stage from './Stage.jsx'
import { DicePanel, DiceRuleFields, DEFAULT_DICE_RULE } from './PlayerPanels.jsx'
import { PlayerPanelKP, SceneTab, OverlayTab, NpcTab, ClueTab } from './KPPanels.jsx'
import { JoinRequests } from '../pages/Lobby.jsx'

const TABS = [
  { key: 'scene', label: '场景' },
  { key: 'overlay', label: '悬浮' },
  { key: 'npc', label: 'NPC' },
  { key: 'clue', label: '线索' },
  { key: 'dice', label: '骰点' },
]

export default function KPConsole({ room, groupId, templateFields }) {
  const nav = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState('scene')
  const [showEnd, setShowEnd] = useState(false)
  const [showCover, setShowCover] = useState(false)
  const [coverDraft, setCoverDraft] = useState(room.snapshot?.group?.cover || null)
  const [showMore, setShowMore] = useState(false)
  const [showReqs, setShowReqs] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [showDice, setShowDice] = useState(false)
  const [diceDraft, setDiceDraft] = useState(room.snapshot?.group?.diceRule || DEFAULT_DICE_RULE)
  const {
    snapshot, members, messages, scene, gameState, muted, status, online, figures,
    cluesVer, sendChat, rollDice, npcSpeak, reloadMembers,
  } = room

  const control = async (path, body, okMsg) => {
    try { await api.post(`/groups/${groupId}/${path}`, body); if (okMsg) toast(okMsg) }
    catch (e) { toast(errMsg(e)) }
  }
  const ended = status === 'ended'

  // 待审批申请：拉一次 + 实时刷新
  const loadReqCount = useCallback(async () => {
    try { const { data } = await api.get(`/groups/${groupId}/requests`); setPendingCount(data.length) }
    catch { /* ignore */ }
  }, [groupId])
  useEffect(() => { loadReqCount() }, [loadReqCount])
  useEffect(() => {
    const socket = getSocket()
    const onReq = ({ applicant }) => { toast(`${applicant} 申请加入`); loadReqCount() }
    socket.on('join:request', onReq)
    return () => socket.off('join:request', onReq)
  }, [loadReqCount, toast])

  return (
    <div className="game-root">
      {/* 顶部操作栏 */}
      <div className="kp-topbar">
        <span className="brand">{snapshot.group.name}</span>
        <span className="tag kp">KP 控制台</span>
        <span className="spacer" />
        {!ended && (
          <>
            <button className={gameState === 'running' ? '' : 'primary'}
              onClick={() => control('control/state', { gameState: gameState === 'running' ? 'paused' : 'running' })}>
              <span className={`state-dot ${gameState === 'running' ? 'on' : 'off'}`} />
              {gameState === 'running' ? '暂停游戏' : '开始游戏'}
            </button>
            <button className={muted ? 'danger' : ''}
              onClick={() => control('control/mute', { muted: !muted })}>
              {muted ? '解除禁言' : '禁言'}
            </button>
          </>
        )}
        {!ended && (
          <button className={pendingCount ? 'primary' : ''} onClick={() => setShowReqs(true)}>
            申请审批{pendingCount ? ` (${pendingCount})` : ''}
          </button>
        )}
        <span className="muted">在线 {online.length}</span>
        {ended
          ? <span className="tag ended">已结束</span>
          : (
            <div className="more-wrap">
              <button className="ghost sm" title="更多设置" onClick={() => setShowMore((v) => !v)}>⋯</button>
              {showMore && (
                <>
                  <div className="more-mask" onClick={() => setShowMore(false)} />
                  <div className="more-menu">
                    <div className="more-title">更多设置</div>
                    <button style={{ width: '100%', marginBottom: 8 }}
                      onClick={() => { setShowMore(false); setCoverDraft(snapshot.group.cover || null); setShowCover(true) }}>
                      设置房间封面
                    </button>
                    <button style={{ width: '100%', marginBottom: 8 }}
                      onClick={() => { setShowMore(false); setDiceDraft(snapshot.group.diceRule || DEFAULT_DICE_RULE); setShowDice(true) }}>
                      骰点规则
                    </button>
                    <button className="danger" style={{ width: '100%' }}
                      onClick={() => { setShowMore(false); setShowEnd(true) }}>
                      结束跑团
                    </button>
                    <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>结束后不可逆</div>
                  </div>
                </>
              )}
            </div>
          )}
        <button className="sm ghost" onClick={() => nav('/')}>退出</button>
      </div>

      <div className="kp-body">
        {/* 左：玩家面板 */}
        <div className="kp-left">
          <header style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>玩家面板</header>
          <PlayerPanelKP groupId={groupId} members={members} online={online} templateFields={templateFields} />
        </div>

        {/* 中：场景预览 + 对话 */}
        <div className="kp-center">
          <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
            <div className="section-title" style={{ marginTop: 0 }}>当前场景预览（玩家视角）</div>
            <div className="preview-mini">
              <Stage scene={scene} overlayChar={room.overlayChar} overlayFocus={room.overlayFocus} />
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Dialogue
              groupId={groupId} messages={messages} isKP={true}
              gameState={gameState} muted={muted} status={status} sendChat={sendChat}
              figures={figures} npcSpeak={npcSpeak}
            />
          </div>
        </div>

        {/* 右：KP 工具面板 */}
        <div className="kp-right">
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>
          {tab === 'scene' && <SceneTab groupId={groupId} currentSceneId={scene?.id} />}
          {tab === 'overlay' && <OverlayTab groupId={groupId} figures={figures} overlayChar={room.overlayChar} overlayFocus={room.overlayFocus} />}
          {tab === 'npc' && <NpcTab groupId={groupId} figures={figures} />}
          {tab === 'clue' && <ClueTab groupId={groupId} members={members} cluesVer={cluesVer} />}
          {tab === 'dice' && <div className="panel-body"><DicePanel rollDice={rollDice} allowHidden={true} /></div>}
        </div>
      </div>

      {showReqs && (
        <JoinRequests
          group={{ id: Number(groupId), name: snapshot.group.name }}
          onClose={() => setShowReqs(false)}
          onChange={() => { loadReqCount(); reloadMembers() }}
        />
      )}

      {showCover && (
        <Modal title="房间封面" onClose={() => setShowCover(false)} width={420}>
          <ImageUpload value={coverDraft} onChange={setCoverDraft} label="上传封面" hint="建议横图（如 16:9），展示在大厅卡片顶部" />
          <div className="modal-actions">
            <button className="ghost" onClick={() => setShowCover(false)}>取消</button>
            <button className="primary" onClick={async () => {
              await control('cover', { cover: coverDraft }, '封面已更新')
              snapshot.group.cover = coverDraft
              setShowCover(false)
            }}>保存</button>
          </div>
        </Modal>
      )}

      {showDice && (
        <Modal title="骰点规则" onClose={() => setShowDice(false)} width={400}>
          <DiceRuleFields rule={diceDraft} onChange={setDiceDraft} />
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>对全团生效，玩家点击属性旁的骰子按此规则检定。</div>
          <div className="modal-actions">
            <button className="ghost" onClick={() => setShowDice(false)}>取消</button>
            <button className="primary" onClick={async () => {
              await control('dice-rule', { diceRule: diceDraft }, '骰点规则已更新')
              snapshot.group.diceRule = diceDraft
              setShowDice(false)
            }}>保存</button>
          </div>
        </Modal>
      )}

      {showEnd && (
        <Modal title="结束游戏" onClose={() => setShowEnd(false)} width={360}>
          <p style={{ color: 'var(--danger)' }}>确认结束本团？此操作<strong>不可逆</strong>，团状态将永久变为「已结束」，无法再开始或加入。</p>
          <div className="modal-actions">
            <button className="ghost" onClick={() => setShowEnd(false)}>取消</button>
            <button className="danger" onClick={async () => { await control('control/end'); setShowEnd(false) }}>确认结束</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
