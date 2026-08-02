-- 2026-07-02: 补充 clues 表的过期标记字段
ALTER TABLE clues
  ADD COLUMN expired TINYINT(1) DEFAULT 0,
  ADD COLUMN expiredReason TEXT NULL;

-- 如果你的 MySQL 版本不支持一次性添加多个列，
-- 可以拆成两条 ALTER TABLE 语句分别执行。