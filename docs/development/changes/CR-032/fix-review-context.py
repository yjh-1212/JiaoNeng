from pathlib import Path
p=Path(__file__).with_name('browser-review.mjs');s=p.read_text(encoding='utf-8');assert 'p.context().newPage()' in s;p.write_text(s.replace('p.context().newPage()','browser.newPage()'),encoding='utf-8')
