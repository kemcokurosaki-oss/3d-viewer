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
print("has 'Unknown':", 'Unknown' in content)
for i, l in enumerate(lines):
    if 'Unknown' in l or 'nknown file' in l:
        print(i+1, repr(l))

# also print the handler dispatch area / definitions of handlers object
for i, l in enumerate(lines):
    if 'handler' in l.lower() and ('=' in l or 'const' in l or 'function' in l):
        print('H', i+1, repr(l))
