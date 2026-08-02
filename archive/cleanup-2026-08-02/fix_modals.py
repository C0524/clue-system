#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys

# Read the HTML file
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find key positions
template_end_pos = content.rfind('  </template>')
closing_div_pos = content.find('</div>', template_end_pos)

# Find the modals section (导入冲突确认模态 to 附件查看模态已移除)
conflict_modal_marker = '<!-- 导入冲突确认模态 -->'
conflict_start = content.find(conflict_modal_marker)

script_marker = '<script>'
script_start = content.find(script_marker, template_end_pos)

if conflict_start > -1 and template_end_pos > -1 and conflict_start > template_end_pos:
    print(f"Found issue: conflict modal at {conflict_start}, template ends at {template_end_pos}")
    
    # Extract the modals section (from conflict modal to just before <script>)
    # Find the exact end: look for '<!-- 附件查看模态已移除' comment and after that
    attachment_comment = '<!-- 附件查看模态已移除'
    attachment_pos = content.find(attachment_comment)
    if attachment_pos == -1:
        # If not found, look for the line before <script>
        modals_end = content.rfind('\n', 0, script_start)
    else:
        modals_end = content.find('\n', attachment_pos + len(attachment_comment))
    
    # Extract: 
    #  1. Before template_end
    #  2. The modals section (from </template></div> comment to before <script>)
    #  3. After template_end but insert modals before </template>
    
    before_template = content[:template_end_pos]
    modals_section = content[conflict_start:modals_end]
    after_modals = content[modals_end:script_start]
    script_section = content[script_start:]
    
    # Reconstruct: modals should be INSIDE template, before </template>
    new_content = before_template + '\n' + modals_section + '\n' + '  </template>\n</div>\n' + script_section
    
    # Write back
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("File updated successfully!")
else:
    print("No issue found or markers not located correctly")
    print(f"template_end_pos: {template_end_pos}")
    print(f"conflict_start: {conflict_start}")
