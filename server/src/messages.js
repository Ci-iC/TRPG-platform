import { one } from './db.js'
import { emitToGroup } from './realtime.js'

// 统一写入一条消息并向团广播
export async function createMessage(groupId, { type, speakerName, characterId, content, meta, senderId }) {
  const msg = await one(
    `INSERT INTO messages(group_id, sender_id, type, speaker_name, character_id, content, meta)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      groupId,
      senderId || null,
      type,
      speakerName || null,
      characterId || null,
      content,
      meta ? JSON.stringify(meta) : null,
    ]
  )
  emitToGroup(groupId, 'message:new', msg)
  return msg
}
