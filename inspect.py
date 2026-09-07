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
for i in range(920, 935):
    print(i+1, repr(lines[i]))
