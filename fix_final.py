#!/usr/bin/env python3
# -*- coding: utf-8 -*-

with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 找出关键行号（从0开始）
template_end_idx = -1
import_conflict_idx = -1
script_idx = -1
attachment_comment_idx = -1

for i, line in enumerate(lines):
    # 查找</template>（主模板的结束，应该在1000行以后）
    if line.strip() == '</template>' and i > 1000:
        template_end_idx = i
    # 查找导入冲突评论
    if '导入冲突确认模态' in line:
        import_conflict_idx = i
    # 查找<script>标签
    if line.strip().startswith('<script>') and i > 1000:
        script_idx = i
    # 查找附件查看注释
    if '附件查看模态已移除' in line:
        attachment_comment_idx = i

# 确认问题：导入冲突在template之后
if import_conflict_idx > template_end_idx > 0:
    print(f"Problem found!")
    print(f"  template ends at line {template_end_idx}: {lines[template_end_idx].strip()[:50]}")
    print(f"  conflict modal starts at line {import_conflict_idx}: {lines[import_conflict_idx].strip()[:50]}")
    print(f"  script starts at line {script_idx}: {lines[script_idx].strip()[:50]}")
    
    # 提取所有需要移动的行（从导入冲突开始到附件查看注释结束）
    # 找到附件查看注释所在行的末尾
    if attachment_comment_idx > -1:
        modals_end_idx = attachment_comment_idx
        # 找到该行末尾的下一行
        for i in range(attachment_comment_idx, len(lines)):
            if lines[i].strip() == '':
                modals_end_idx = i
                break
    else:
        # 没找到注释，就找到script之前的最后一行
        modals_end_idx = script_idx - 2
    
    print(f"  modals end at line {modals_end_idx}: {lines[modals_end_idx].strip()[:50]}")
    
    # 提取需要移动的模态框内容
    modals_lines = lines[import_conflict_idx:modals_end_idx+1]
    
    # 重建文件：
    # 1. 从开始到template_end_idx（不含）
    # 2. template_end_idx（</template>那一行）
    # 3. 在template_end_idx之前插入所有模态框
    # 4. 从template_end_idx+1（</div>）到script_idx
    # 5. script_idx之后的所有内容
    
    new_lines = (
        lines[:template_end_idx] +  # 所有内容直到</template>
        modals_lines +  # 插入模态框
        lines[template_end_idx:import_conflict_idx] +  # </template></div>等
        lines[modals_end_idx+1:script_idx] +  # 模态框之后、script之前的空行
        lines[script_idx:]  # script及之后的所有内容
    )
    
    # 写回文件
    with open('index.html', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    
    print("✓ Successfully moved modals inside template!")
else:
    print(f"✗ Problem not found or already fixed")
    print(f"  template_end_idx: {template_end_idx}")
    print(f"  import_conflict_idx: {import_conflict_idx}")
