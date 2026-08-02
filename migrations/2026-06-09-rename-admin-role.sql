-- Migration: 将 users 表中 role 从 '管理员' 更新为 '主管'
-- 运行前请先备份数据库！

UPDATE users
SET role = '主管'
WHERE role = '管理员';

-- 可扩展：如果其它表也存储 role 文本（不常见），可在此追加类似更新语句。