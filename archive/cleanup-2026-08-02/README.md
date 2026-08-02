# Cleanup Archive 2026-08-02

本目录用于存放仓库清理时归档的临时文件、调试脚本与一次性导出产物。

## 归档原则
- 不影响当前服务启动与业务接口。
- 优先归档，不直接永久删除。
- 仅归档未被代码引用、明显属于临时用途的文件。

## 已归档内容
- 根目录临时调试文件：`__check_booktime.js`、`check_pattern.py`、`debug.py`、`fix_final.py`、`fix_modals.py`、`fix_modals_v2.py`、`fix_output.txt`。
- 根目录历史日志/结果文件：`access_debug.log.1`、`server.log.bak`、`unmatched_taoren_2026-06-09.txt`、`PID`。
- tools 一次性临时脚本：`tmp_check_booktime.js`、`tmp_check_pan_stats.js`、`tmp_check_single_clue_and_logs.js`、`tmp_diff_june_book_arrive.js`、`tmp_preview_book_logs.js`。
- tools 一次性输出与备份：`backup_clue_1781311633816.json`、`duplicate_active_last_import_19rows_20260713_155502.csv`、`duplicate_active_last_import_19rows_20260713_155519.csv`、`find_empty_bookuser_output.csv`、`find_empty_bookuser_output.json`、`fix_result_1781311633816.json`、`suggest_bookuser_preview.csv`、`suggest_bookuser_preview.json`。

## 恢复方式
直接将对应文件从本目录移回原路径即可。
