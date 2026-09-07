import re
s = open('spark_tmp.js', encoding='utf-8').read()
for m in re.finditer(r'Unknown file type', s):
    print(m.start(), repr(s[max(0,m.start()-150):m.start()+150]))
    print('---')
print("count:", len(re.findall('Unknown file type', s)))
