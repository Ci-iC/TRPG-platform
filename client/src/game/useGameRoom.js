import { useEffect, useState, useCallback, useRef } from 'react'
import api, { errMsg } from '../api.js'
import { getSocket, emitAck } from '../socket.js'

// 共享游戏房状态：加载快照 + 订阅实时事件 + 暴露动作
export function useGameRoom(groupId) {
  const [snapshot, setSnapshot] = useState(null) // { group, members, isKP, me }
  const [members, setMembers] = useState([])
  const [messages, setMessages] = useState([])
  const [scene, setScene] = useState(null)
  const [overlayChar, setOverlayChar] = useState(null)
  const [overlayFocus, setOverlayFocus] = useState(null)
  const [gameState, setGameState] = useState('paused')
  const [muted, setMuted] = useState(false)
  const [status, setStatus] = useState('ongoing')
  const [online, setOnline] = useState([])
  const [figures, setFigures] = useState([])
  const [error, setError] = useState('')
  const figuresVer = useRef(0)
  const [cluesVer, setCluesVer] = useState(0)
  const [invVer, setInvVer] = useState(0)

  const reloadFigures = useCallback(async () => {
    try {
      const { data } = await api.get(`/groups/${groupId}/figures`)
      setFigures(data)
    } catch { /* ignore */ }
  }, [groupId])

  const reloadMembers = useCallback(async () => {
    try {
      const { data } = await api.get(`/groups/${groupId}`)
      setMembers(data.members)
    } catch { /* ignore */ }
  }, [groupId])

  // 初始化：拉快照 + 历史 + 图鉴
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data } = await api.get(`/groups/${groupId}`)
        if (!alive) return
        setSnapshot(data)
        setMembers(data.members)
        setScene(data.group.currentScene)
        setOverlayChar(data.group.activeCharacter)
        setOverlayFocus(data.group.activeFocus)
        setGameState(data.group.gameState)
        setMuted(data.group.muted)
        setStatus(data.group.status)
        const [msgs] = await Promise.all([api.get(`/groups/${groupId}/messages`), reloadFigures()])
        if (!alive) return
        setMessages(msgs.data)
      } catch (e) {
        if (alive) setError(errMsg(e))
      }
    })()
    return () => { alive = false }
  }, [groupId, reloadFigures])

  // socket 订阅
  useEffect(() => {
    const socket = getSocket()
    const onConnect = () => emitAck('group:join', { groupId }).then((r) => {
      if (r.online) setOnline(r.online)
    })
    if (socket.connected) onConnect()
    socket.on('connect', onConnect)

    const onMsg = (m) => setMessages((prev) => [...prev, m])
    const onScene = ({ scene }) => setScene(scene)
    const onOverlayChar = (p) => setOverlayChar(p)
    const onOverlayFocus = (p) => setOverlayFocus(p)
    const onState = ({ gameState }) => setGameState(gameState)
    const onMute = ({ muted }) => setMuted(muted)
    const onEnded = () => { setStatus('ended'); setGameState('paused') }
    const onPresence = ({ online }) => setOnline(online)
    const onFigure = () => { figuresVer.current++; reloadFigures() }
    const onClue = () => setCluesVer((v) => v + 1)
    const onInv = () => setInvVer((v) => v + 1)
    const onMember = () => reloadMembers()

    socket.on('message:new', onMsg)
    socket.on('member:update', onMember)
    socket.on('scene:switch', onScene)
    socket.on('overlay:character', onOverlayChar)
    socket.on('overlay:focus', onOverlayFocus)
    socket.on('game:state', onState)
    socket.on('game:mute', onMute)
    socket.on('game:ended', onEnded)
    socket.on('presence:update', onPresence)
    socket.on('figure:update', onFigure)
    socket.on('clue:update', onClue)
    socket.on('inventory:update', onInv)

    return () => {
      emitAck('group:leave', { groupId })
      socket.off('connect', onConnect)
      socket.off('message:new', onMsg)
      socket.off('scene:switch', onScene)
      socket.off('overlay:character', onOverlayChar)
      socket.off('overlay:focus', onOverlayFocus)
      socket.off('game:state', onState)
      socket.off('game:mute', onMute)
      socket.off('game:ended', onEnded)
      socket.off('presence:update', onPresence)
      socket.off('figure:update', onFigure)
      socket.off('clue:update', onClue)
      socket.off('inventory:update', onInv)
      socket.off('member:update', onMember)
    }
  }, [groupId, reloadFigures, reloadMembers])

  // ---- 动作 ----
  const sendChat = useCallback((mode, content) => emitAck('chat:send', { groupId, mode, content }), [groupId])
  const rollDice = useCallback((expr, hidden) => emitAck('dice:roll', { groupId, expr, hidden }), [groupId])
  const rollCheck = useCallback((attrName, value) => emitAck('check:roll', { groupId, attrName, value }), [groupId])
  const npcSpeak = useCallback((npcId, content) => emitAck('npc:speak', { groupId, npcId, content }), [groupId])

  return {
    snapshot, members, messages, scene, overlayChar, overlayFocus,
    gameState, muted, status, online, figures,
    error, cluesVer, invVer,
    setMessages, reloadFigures, reloadMembers,
    sendChat, rollDice, rollCheck, npcSpeak,
  }
}
