#!/usr/bin/env python3
# -*- coding: utf-8 -*-

with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find line numbers
for i, line in enumerate(lines):
    if '</template>' in line and i > 1000:
        print(f"Line {i}: {line.strip()[:60]}")
    if '导入冲突确认模态' in line:
        print(f"Line {i} (conflict): {line.strip()[:60]}")
    if '<script>' in line and i > 1000:
        print(f"Line {i} (script): {line.strip()[:60]}")
