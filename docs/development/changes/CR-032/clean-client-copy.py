from pathlib import Path
root=Path(__file__).resolve().parents[4]
changed=[]
for p in (root/'client').glob('*.jsx'):
 s=p.read_text(encoding='utf-8');v=s
 for a,b in [('业务仿真','测算资料'),('仿真数据','测算资料'),('模拟数据','测算资料'),('仿真','测算'),('模拟','推演'),('演示','参考'),('示例','参考'),('DeepSeek','AI')]:v=v.replace(a,b)
 if v!=s:p.write_text(v,encoding='utf-8');changed.append(str(p.relative_to(root)))
print('\n'.join(changed))
