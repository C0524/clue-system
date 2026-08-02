-- 2026-06-10: 添加分配字段用于线索分配功能
ALTER TABLE clues
  ADD COLUMN assignedTo VARCHAR(100) DEFAULT '' AFTER username,
  ADD COLUMN assignedBy VARCHAR(100) DEFAULT '' AFTER assignedTo,
  ADD COLUMN assignedAt DATETIME NULL AFTER assignedBy,
  ADD COLUMN assignNote TEXT NULL AFTER assignedAt;

-- 如果你的 MySQL 版本不支持在一次 ALTER 中添加多个列，
-- 请拆分为多条 ALTER TABLE 语句并在迁移工具中逐一执行。
