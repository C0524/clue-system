#!/usr/bin/env python3
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

pattern1 = '    </div>\n  </template>\n</div>\n\n<!-- 导入冲突确认模态 -->'
pattern2 = '  </template>\n</div>\n\n<!-- 导入冲突确认模态 -->'

print(f"Pattern 1 found: {pattern1 in content}")
print(f"Pattern 2 found: {pattern2 in content}")

# 查找实际的模式
export_div_end = content.find('确认导出')
if export_div_end > 0:
    snippet = content[export_div_end-50:export_div_end+300]
    print(f"\nActual content around export button:\n{repr(snippet)}")
