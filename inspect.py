import re
s = open('spark_tmp.js', encoding='utf-8').read()

idx = s.find("jsContent = '")
start = idx + len("jsContent = '")
i = start
while True:
    i = s.find("'", i)
    if s[i-1] != '\\':
        break
    i += 1
content = s[start:i]
content = content.encode().decode('unicode_escape')
print(len(content))
print(repr(content[850:1100]))
print('----has unknown file type:', 'Unknown file type' in content)
