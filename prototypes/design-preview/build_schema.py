import csv,json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
def read(rel):
    with (root/rel).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
pages=read('docs/design/04-ux-ui/page-inventory.csv')
fields={r['field_id']:r for r in read('docs/design/03-prd/field-dictionary.csv')}
placements=read('docs/design/04-ux-ui/page-field-placement.csv')
for p in pages:
    p['fields']=[{**fields[r['field_id']],**r} for r in placements if r['page_id']==p['page_id']]
    text=(root/p['spec_path']).read_text(encoding='utf-8')
    p['purpose']=next(l[5:] for l in text.splitlines() if l.startswith('- 任务：'))
(Path(__file__).resolve().parent/'source/schema.js').write_text('export const pages='+json.dumps(pages,ensure_ascii=False)+';\n',encoding='utf-8')
print('26 page definitions and D4 field placements prepared')
