import re
s = open('spark_tmp.js', encoding='utf-8').read()

# find jsContent$1 string literal fully
idx = s.find("jsContent$1 = '")
start = idx + len("jsContent$1 = '")
# find the matching end quote (not escaped)
i = start
while True:
    i = s.find("'", i)
    if s[i-1] != '\\':
        break
    i += 1
content = s[start:i]
# unescape
content = content.encode().decode('unicode_escape')
print(len(content))
print(repr(content[900:1100]))
