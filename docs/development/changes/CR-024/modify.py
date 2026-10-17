from pathlib import Path
import re
root=Path(__file__).resolve().parents[4]
p=root/'client/agent-center.jsx'
s=p.read_text(encoding='utf-8')
start=s.index('        <div className="ac-contextbar">')
end=s.index('        {error && (',start)
s=s[:start]+s[end:]
start=s.index('            <div className="ac-hero">')
end=s.index('            {!square && composer}',start)
s=s[:start]+s[end:]
start=s.index('  async function loadOptions(')
end=s.index('  async function openHistory(',start)
s=s[:start]+s[end:]
start=s.index('  function contextChange(')
end=s.index('  async function updateConversation(',start)
s=s[:start]+s[end:]
for name in ['options','optionTotal','optionBusy','optionError']:
    s=re.sub(r'^    \['+name+r',.*\n','',s,flags=re.M)
s=re.sub(r'^    optionTicket = useRef\(0\),\n','',s,flags=re.M)
assert not any(k in s for k in ['ac-contextbar','ac-hero','optionTicket','loadOptions','contextChange'])
p.write_text(s,encoding='utf-8')
p=root/'client/agent-center.css';s=p.read_text(encoding='utf-8')
s=re.sub(r'(?m)^[ \t]*\.ac-(?:hero|contextbar)[^{\n]*\{[^{}]*\}\n?','',s)
assert 'ac-hero' not in s and 'ac-contextbar' not in s
p.write_text(s,encoding='utf-8')
print('Removed context selectors, welcome hero and unused picker requests/styles')
