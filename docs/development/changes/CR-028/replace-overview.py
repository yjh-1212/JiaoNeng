from pathlib import Path
root=Path(__file__).resolve().parents[4];p=root/'client/workspaces.jsx';s=p.read_text(encoding='utf-8');start=s.index('export function Overview() {');end=s.index('export function ResourcePage()',start);s=s[:start]+'export { default as Overview } from "./overview-workbench";\n'+s[end:];p.write_text(s,encoding='utf-8');print('Overview component replaced')
