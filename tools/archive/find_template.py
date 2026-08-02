import re
text = open('index.html', 'r', encoding='utf8').read()
pattern = re.compile(r'<template(?:\s[^>]*)?>|</template>', re.IGNORECASE)
stack = []
for m in pattern.finditer(text):
    tag = m.group(0)
    if tag.lower().startswith('</template'):
        if stack:
            stack.pop()
        else:
            print('extra close at', m.start())
    else:
        stack.append((m.start(), text[m.start():m.start()+120].replace('\n',' ')))
print('remaining:', len(stack))
for pos, snippet in stack[-5:]:
    print(pos, snippet)
