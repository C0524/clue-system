# Cleanup Archive 2026-09-06 Batch 2

本目录存放第二批清理归档文件，遵循“先归档、后评估是否删除”的原则。

## 本批归档内容
- tools/duplicate_active_last_import_19rows_20260713_155502.xlsx
- tools/duplicate_active_last_import_19rows_20260713_155519.xlsx
- tools/export_last_duplicate_active.js
- tools/fix_bookuser_1781311633816.js
- tools/tunnel_watchdog.log

## 归档原因
- duplicate_active_last_import_*.xlsx：一次性导出产物，非运行依赖。
- export_last_duplicate_active.js：针对历史导入排查的一次性导出脚本。
- fix_bookuser_1781311633816.js：绑定特定 clueId 的一次性修复脚本。
- tunnel_watchdog.log：运行日志产物，可按需重新生成。

## 恢复方式
将对应文件从本目录移回原路径即可。
