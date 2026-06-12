-- =====================================================================
-- 跑团平台 数据库 Schema (PostgreSQL)
-- 幂等：可重复执行（IF NOT EXISTS）
-- =====================================================================

-- 账号：本身无固定身份，KP/玩家是团级别概念
CREATE TABLE IF NOT EXISTS accounts (
  id             SERIAL PRIMARY KEY,
  username       TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 人物卡模板（超管维护）
CREATE TABLE IF NOT EXISTS templates (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  -- fields: [{ "name": "力量", "type": "number|text|percent", "default": "" }]
  fields     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 团
CREATE TABLE IF NOT EXISTS groups (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  intro         TEXT NOT NULL DEFAULT '',
  max_players   INT  NOT NULL DEFAULT 6,
  template_id   INT  REFERENCES templates(id),
  kp_id         INT  NOT NULL REFERENCES accounts(id),
  status        TEXT NOT NULL DEFAULT 'ongoing',  -- ongoing | ended
  game_state    TEXT NOT NULL DEFAULT 'paused',   -- running | paused
  muted         BOOLEAN NOT NULL DEFAULT FALSE,
  current_scene_id INT,                            -- -> scenes.id
  cover         TEXT,                              -- 房间封面图 url（大厅卡片展示）
  -- 当前激活的悬浮层： { "characterId": 1, "name":"", "portrait":"" } / null
  active_character JSONB,
  -- 焦点悬浮： { "image": "/uploads/x.png" } / null
  active_focus     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 成员关系（含加入申请）
CREATE TABLE IF NOT EXISTS memberships (
  id         SERIAL PRIMARY KEY,
  group_id   INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'player',   -- player | kp
  status     TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, account_id)
);

-- 人物卡 / NPC（NPC 的 owner_id 为空、is_npc=true）
CREATE TABLE IF NOT EXISTS characters (
  id         SERIAL PRIMARY KEY,
  group_id   INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  owner_id   INT REFERENCES accounts(id) ON DELETE CASCADE,
  is_npc     BOOLEAN NOT NULL DEFAULT FALSE,
  name       TEXT NOT NULL,
  portrait   TEXT,                              -- 立绘图片 url
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  intro      TEXT NOT NULL DEFAULT '',          -- 人物介绍（图鉴用）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 背包物品（格子制）
CREATE TABLE IF NOT EXISTS items (
  id          SERIAL PRIMARY KEY,
  group_id    INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  owner_id    INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  slot        INT NOT NULL,
  name        TEXT NOT NULL,
  quantity    INT NOT NULL DEFAULT 1,
  description TEXT NOT NULL DEFAULT '',
  image       TEXT                       -- 物品立绘 url（可选）
);

-- 线索卡
CREATE TABLE IF NOT EXISTS clues (
  id          SERIAL PRIMARY KEY,
  group_id    INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  image       TEXT,
  description TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 线索分发（account_id 为空 = 全体）
CREATE TABLE IF NOT EXISTS clue_recipients (
  id         SERIAL PRIMARY KEY,
  clue_id    INT NOT NULL REFERENCES clues(id) ON DELETE CASCADE,
  account_id INT REFERENCES accounts(id) ON DELETE CASCADE
);

-- 场景图库
CREATE TABLE IF NOT EXISTS scenes (
  id         SERIAL PRIMARY KEY,
  group_id   INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  image      TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 焦点素材库（KP 上传的焦点图片，可重复选用）
CREATE TABLE IF NOT EXISTS focus_images (
  id         SERIAL PRIMARY KEY,
  group_id   INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  image      TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 对话记录
CREATE TABLE IF NOT EXISTS messages (
  id           SERIAL PRIMARY KEY,
  group_id     INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id    INT REFERENCES accounts(id),
  -- character_speech | player_action | dice | broadcast | scene_change
  type         TEXT NOT NULL,
  speaker_name TEXT,                 -- 角色名 / 账号名 / NPC 名
  character_id INT,                  -- 用于立绘演出（可空）
  content      TEXT NOT NULL,
  meta         JSONB,                -- 骰点明细 / 场景信息等
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 人物图鉴个人备注（私有，每人对每个角色一条）
CREATE TABLE IF NOT EXISTS figure_notes (
  id           SERIAL PRIMARY KEY,
  group_id     INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  account_id   INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  note         TEXT NOT NULL DEFAULT '',
  UNIQUE(group_id, account_id, character_id)
);

-- 线索个人笔记（私有，每人对每条线索一条，玩家自由记录）
CREATE TABLE IF NOT EXISTS clue_notes (
  id         SERIAL PRIMARY KEY,
  group_id   INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  clue_id    INT NOT NULL REFERENCES clues(id) ON DELETE CASCADE,
  note       TEXT NOT NULL DEFAULT '',
  UNIQUE(group_id, account_id, clue_id)
);

-- 幂等迁移：为已存在的旧库补列（新库已含，ALTER 为空操作）
ALTER TABLE items  ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS cover TEXT;

-- 索引
CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id, id);
CREATE INDEX IF NOT EXISTS idx_memberships_group ON memberships(group_id);
CREATE INDEX IF NOT EXISTS idx_characters_group ON characters(group_id);
CREATE INDEX IF NOT EXISTS idx_items_owner ON items(group_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_scenes_group ON scenes(group_id);
