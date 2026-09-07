import re
s = open('spark_tmp.js', encoding='utf-8').read()
for m in re.finditer(r'jsContent\$?1?\s*=', s):
    print(m.start(), repr(s[m.start():m.start()+200]))
    print('---')
