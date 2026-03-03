
import re
with open('src/js/lite-explorer.js','r',encoding='utf-8') as f:
 lines = f.readlines()
for i,l in enumerate(lines):
 if re.search(r'const\s+const', l) or re.search(r'if\s*\([^{]*\)\s*const', l) or re.search(r'else\s*const', l) or re.search(r'\)\s*const', l):
  print(i+1, l.strip())
