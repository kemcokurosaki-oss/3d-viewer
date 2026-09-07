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

for name in ["jsContent$1", "jsContent"]:
    content = extract(name)
    lines = content.split('\n')
    print(f"=== {name}: {len(lines)} lines, has onMessage: {'onMessage' in content} ===")
    if 'onMessage' in content:
        for i, l in enumerate(lines):
            if 'onMessage' in l:
                print(i, repr(l))
    # print around line 961 (1-indexed)
    if len(lines) >= 961:
        print("line 955-967:")
        for i in range(954, min(967, len(lines))):
            print(i+1, repr(lines[i]))
    print()
