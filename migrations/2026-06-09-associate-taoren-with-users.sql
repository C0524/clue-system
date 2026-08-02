-- Migration: 将历史的套电人员（taoRen）与 users.username 对应的账号关联
-- 说明：如果 clues.taoRen 与 users.username 完全匹配，则保持不变；
-- 如果存在一些历史记录中 taoRen 正好等于 users.username，则不变；
-- 该脚本还会将 book='已预约' 且 bookUser 为空的记录，使用 taoRen 对应的账号填充为 bookUser

-- 1) 确认能匹配的行数（仅用于查看）
SELECT COUNT(*) AS matched_taoren
FROM clues c
JOIN users u ON c.taoRen = u.username;

-- 2) 将与账号匹配的 taoRen 明确写成用户名（幂等操作）
UPDATE clues c
JOIN users u ON c.taoRen = u.username
SET c.taoRen = u.username
WHERE c.taoRen <> u.username;

-- 3) 对于已预约但缺少 bookUser 的记录，若 taoRen 能对应到 users.username，则把 bookUser 填充为该用户名
UPDATE clues c
JOIN users u ON c.taoRen = u.username
SET c.bookUser = u.username
WHERE c.book = '已预约' AND (c.bookUser IS NULL OR c.bookUser = '');

-- 4) 检查结果
SELECT role, COUNT(*) FROM users GROUP BY role;
SELECT COUNT(*) AS clues_with_bookUser FROM clues WHERE book = '已预约' AND bookUser IS NOT NULL AND bookUser <> '';