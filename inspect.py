import re
s = open('spark_tmp.js', encoding='utf-8').read()

def extract(varname):
    idx = s.find(varname + " = '")
    start = idx + len(varname + " = '")
    i = start
    while True:
        i = s.find("'", i)
        if s[i-1] != '\\':
            break
        i += 1
    content = s[start:i]
    content = content.encode().decode('unicode_escape')
    return content

content = extract("jsContent")
lines = content.split('\n')
for i, l in enumerate(lines):
    if re.search(r'\basync function loadPackedSplats\b|\basync function loadExtSplats\b|function loadPackedSplats|function loadExtSplats', l):
        print('FOUND', i+1, repr(l))

# print loadExtSplats function body (search fileType-ish keywords)
for i, l in enumerate(lines):
    if 'fileType' in l or 'filetype' in l.lower() or 'extension' in l.lower():
        print(i+1, repr(l))
