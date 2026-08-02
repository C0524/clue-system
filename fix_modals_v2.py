#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# 读取文件
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 第一步：提取导出对话框之后、</template>之前的内容
# 找到导出对话框末尾
export_end = content.find('    </div>\n  </template>\n</div>\n\n<!-- 导入冲突确认模态 -->')

if export_end == -1:
    print("Could not find pattern")
    exit(1)

# 找到所有导出对话框末尾的</div>
export_end_div = content.find('    </div>', export_end - 100)

# 从</template>开始找，往后找到<script>之前的所有内容
template_end_line = '  </template>\n</div>'
template_end_pos = content.find(template_end_line)

script_start = content.find('<script>')

# 找到导入冲突模态开始
conflict_modal_start = content.find('<!-- 导入冲突确认模态 -->')

if template_end_pos > 0 and conflict_modal_start > template_end_pos:
    print(f"Pattern found:")
    print(f"  template_end_pos: {template_end_pos}")
    print(f"  conflict_modal_start: {conflict_modal_start}")
    
    # 提取所有需要移动的模态框内容（从导入冲突注释开始到附件查看注释结束）
    attachment_comment_start = content.find('  <!-- 附件查看模态已移除')
    if attachment_comment_start == -1:
        # If not found, extract until the line before <script>
        modals_end_pos = content.rfind('\n</div>', template_end_pos, script_start)
    else:
        modals_end_pos = content.find('\n', attachment_comment_start + len('  <!-- 附件查看模态已移除'))
    
    print(f"  modals_end_pos: {modals_end_pos}")
    
    # 获取要移动的所有模态框内容
    modals_content = content[conflict_modal_start:modals_end_pos]
    
    # 重构文件：
    # 1. template_end_pos之前的所有内容
    # 2. 模态框内容
    # 3. </template></div>
    # 4. <script>之后的所有内容
    
    before_template = content[:template_end_pos]
    after_modals = content[modals_end_pos:script_start]
    after_script = content[script_start:]
    
    # 删除after_modals中多余的</template></div>
    after_modals_cleaned = after_modals.replace('\n  </template>\n</div>\n\n', '\n')
    
    new_content = before_template + '\n    ' + modals_content + '\n  </template>\n</div>' + after_modals_cleaned + after_script
    
    # 写回文件
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print("✓ Successfully moved modals inside template!")
else:
    print(f"✗ Pattern not found or condition not met")
    print(f"  template_end_pos: {template_end_pos}")
    print(f"  conflict_modal_start: {conflict_modal_start}")
