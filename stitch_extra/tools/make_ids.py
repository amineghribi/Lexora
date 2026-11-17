"""
make_ids.py - gives every question an ID (identical questions share the same ID) and
finds questions that appear several times with DIFFERENT correct answers.

Identity = normalised title + normalised set of option texts (order of options ignored).
Correct answers are compared by option TEXT, so a re-ordered duplicate is still compared right.
"""
import csv, glob, json, os, re, sys, unicodedata, collections
from difflib import SequenceMatcher
import xlsxwriter

ROOT = os.path.expanduser('~/mnt/QCM/session_data/downloads')
OUT = os.path.expanduser('~/mnt/QCM/session_data/question_bank')
os.makedirs(OUT, exist_ok=True)
LET = 'ABCDE'


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or ''))
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace('’', "'").replace('œ', 'oe')
    s = re.sub(r'<[^>]+>', ' ', s)
    s = re.sub(r"[.,;:!?()\[\]«»\"'` ]+", ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def letters(idxs):
    return ''.join(LET[i] for i in sorted(idxs) if 0 <= i < 5)


# ---------- load ----------
files = sorted(glob.glob(os.path.join(ROOT, '**', '*.json'), recursive=True))
ids = {}            # key -> id
bank = {}           # id -> dict(canonical info)
occ = []            # every occurrence
for f in files:
    d = json.load(open(f, encoding='utf-8'))
    m = d['meta']
    for pos, q in enumerate(d['questions']['data'], 1):
        opts = {L: str(q.get(L) or '').strip() for L in LET}
        nopts = {L: norm(t) for L, t in opts.items() if t}
        key = norm(q.get('title')) + '||' + '|'.join(sorted(set(nopts.values())))
        right_idx = [int(x) for x in (q.get('rightAnswers') or [])]
        right_L = [LET[i] for i in right_idx if 0 <= i < 5 and LET[i] in nopts]
        right_txt = frozenset(nopts[L] for L in right_L)
        if key not in ids:
            qid = 'Q%05d' % (len(ids) + 1)
            ids[key] = qid
            bank[qid] = dict(id=qid, title=str(q.get('title') or '').strip(), opts=opts, nopts=nopts,
                             just=q.get('justifications'), ntitle=norm(q.get('title')))
        qid = ids[key]
        b = bank[qid]
        if not b['just'] and q.get('justifications'):
            b['just'] = q.get('justifications')
        occ.append(dict(id=qid, J=m['j'], spec=m['spec'], topic=m['topic'], year=m['year'], exam=m['exam'],
                        mode=m['mode'], pos=pos, right_txt=right_txt, own_letters=''.join(sorted(right_L)),
                        file=os.path.relpath(f, ROOT)))

# ---------- per-ID analysis ----------
by_id = collections.defaultdict(list)
for o in occ:
    by_id[o['id']].append(o)

text2letter = {}
for qid, b in bank.items():
    t2l = {}
    for L, t in b['nopts'].items():
        t2l.setdefault(t, L)
    text2letter[qid] = t2l


def canon_letters(qid, right_txt):
    t2l = text2letter[qid]
    return ''.join(sorted(t2l[t] for t in right_txt if t in t2l))


conflicts = []
for qid, lst in by_id.items():
    variants = collections.defaultdict(list)
    for o in lst:
        variants[o['right_txt']].append(o)
    bank[qid]['n'] = len(lst)
    bank[qid]['quizzes'] = len({o['file'] for o in lst})
    bank[qid]['variants'] = variants
    bank[qid]['conflict'] = len(variants) > 1
    best = max(len(v) for v in variants.values())
    bank[qid]['majority_txt'] = None
    tops = [k for k, v in variants.items() if len(v) == best]
    if len(tops) == 1:
        bank[qid]['majority_txt'] = tops[0]
    if bank[qid]['conflict']:
        conflicts.append(qid)
for o in occ:
    mj = bank[o['id']]['majority_txt']
    o['status'] = ('unique' if bank[o['id']]['n'] == 1 else
                   'OK' if not bank[o['id']]['conflict'] else
                   'CONFLICT-majority' if o['right_txt'] == mj else
                   'CONFLICT-minority' if mj is not None else 'CONFLICT-tie')

import time; T0 = time.time(); print('analysis done', len(bank), 'ids', flush=True)
# ---------- near duplicates (different ID, almost same question) ----------
def sim(a, b):
    return SequenceMatcher(None, a, b).ratio()


def align(qa, qb):
    """map letters of A -> letters of B by best option-text similarity"""
    A, B = bank[qa]['nopts'], bank[qb]['nopts']
    pairs = sorted(((sim(ta, tb), la, lb) for la, ta in A.items() for lb, tb in B.items()), reverse=True)
    ma, mb, used_a, used_b, score = {}, {}, set(), set(), []
    for s, la, lb in pairs:
        if la in used_a or lb in used_b or s < 0.85:
            continue
        ma[la] = lb; used_a.add(la); used_b.add(lb); score.append(s)
    return ma, len(score)


def majority_letters(qid):
    b = bank[qid]
    txt = b['majority_txt']
    if txt is None:
        txt = max(b['variants'].items(), key=lambda kv: len(kv[1]))[0]
    return set(canon_letters(qid, txt))


cand = set()
bt = collections.defaultdict(list)
bo = collections.defaultdict(list)
for qid, b in bank.items():
    bt[b['ntitle']].append(qid)
    bo['|'.join(sorted(set(b['nopts'].values())))].append(qid)
skipped_groups = 0
for grp in list(bt.values()) + list(bo.values()):
    if len(grp) < 2:
        continue
    if len(grp) > 60:
        skipped_groups += 1
        continue
    for i in range(len(grp)):
        for j in range(i + 1, len(grp)):
            cand.add((grp[i], grp[j]))
near = []
for qa, qb in sorted(cand):
    na, nb = len(bank[qa]['nopts']), len(bank[qb]['nopts'])
    if len(set(bank[qa]['nopts'].values()) & set(bank[qb]['nopts'].values())) < 2:
        continue
    if sim(bank[qa]['ntitle'], bank[qb]['ntitle']) < 0.85:
        continue
    ma, matched = align(qa, qb)
    tsim = sim(bank[qa]['ntitle'], bank[qb]['ntitle'])
    if matched < min(na, nb) or matched < 2 or tsim < 0.85:
        continue
    ra = {ma[L] for L in majority_letters(qa) if L in ma}
    rb = majority_letters(qb)
    same = ra == rb and len(majority_letters(qa)) == len(rb)
    near.append(dict(a=qa, b=qb, tsim=tsim, matched=matched, same=same,
                     ans_a=''.join(sorted(majority_letters(qa))), ans_b=''.join(sorted(rb)),
                     ans_a_as_b=''.join(sorted(ra))))


def where(lst, limit=10):
    s = ['%s %s | %s | %s (#%d)' % (o['year'], o['exam'] + '-' + o['mode'], o['spec'], o['topic'], o['pos'])
         for o in lst[:limit]]
    return ' ; '.join(s) + (' ; ... +%d' % (len(lst) - limit) if len(lst) > limit else '')


print('near-dup pairs:', len(near), 'in %.1fs' % (time.time() - T0), flush=True)
# ---------- write ----------
def wcsv(name, header, rows):
    with open(os.path.join(OUT, name), 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.writer(fh); w.writerow(header); w.writerows(rows)


qh = ['ID', 'Question', 'A', 'B', 'C', 'D', 'E', 'Correct (majority)', 'Appearances', 'Different quizzes',
      'Specialities', 'Topics', 'Years', 'Status', 'Justification']
qrows = []
for qid, b in bank.items():
    lst = by_id[qid]
    maj = canon_letters(qid, b['majority_txt']) if b['majority_txt'] is not None else \
        canon_letters(qid, max(b['variants'].items(), key=lambda kv: len(kv[1]))[0]) + ' (tie)'
    just = b['just']
    if just is not None and not isinstance(just, str):
        just = json.dumps(just, ensure_ascii=False)
    qrows.append([qid, b['title']] + [b['opts'][L] for L in LET] + [
        maj, b['n'], b['quizzes'], ', '.join(sorted({o['spec'] for o in lst})),
        ' ; '.join(sorted({o['topic'] for o in lst})), ', '.join(sorted({o['year'] for o in lst})),
        'CONFLICT' if b['conflict'] else ('OK' if b['n'] > 1 else 'unique'), just or ''])
oh = ['ID', 'J', 'Speciality', 'Topic', 'Year', 'Exam', 'Mode', 'Position in quiz',
      'Correct (letters in that quiz)', 'Status']
orows = [[o['id'], o['J'], o['spec'], o['topic'], o['year'], o['exam'], o['mode'], o['pos'],
          o['own_letters'], o['status']] for o in occ]
ch = ['ID', 'Question', 'A', 'B', 'C', 'D', 'E', 'Variant', 'Correct answer (letters)', 'Answer text',
      'Times given', 'Is majority', 'Where it says this']
crows = []
for qid in conflicts:
    b = bank[qid]
    vs = sorted(b['variants'].items(), key=lambda kv: -len(kv[1]))
    for k, (txt, lst) in enumerate(vs, 1):
        crows.append([qid, b['title']] + [b['opts'][L] for L in LET] + [
            'V%d' % k, canon_letters(qid, txt),
            ' / '.join(b['opts'][L] for L in canon_letters(qid, txt)) if txt else '(no answer)',
            len(lst), 'yes' if b['majority_txt'] == txt else ('tie' if b['majority_txt'] is None else 'no'),
            where(lst)])
nh = ['ID A', 'ID B', 'Title similarity', 'Options matched', 'Question A', 'Question B', 'Answer A',
      'Answer B', 'Answer A mapped onto B letters', 'Same answer?']
nrows = [[x['a'], x['b'], round(x['tsim'], 3), x['matched'], bank[x['a']]['title'], bank[x['b']]['title'],
          x['ans_a'], x['ans_b'], x['ans_a_as_b'], 'yes' if x['same'] else 'NO'] for x in near]
wcsv('questions.csv', qh, qrows)
wcsv('occurrences.csv', oh, orows)
wcsv('conflicts.csv', ch, crows)
wcsv('near_duplicates.csv', nh, nrows)

n_dup_ids = sum(1 for b in bank.values() if b['n'] > 1)
near_diff = sum(1 for x in near if not x['same'])
summary = [
    ('Quiz files read', len(files)),
    ('Question entries (total)', len(occ)),
    ('Unique questions (IDs)', len(bank)),
    ('IDs that appear more than once', n_dup_ids),
    ('IDs with CONFLICTING correct answers', len(conflicts)),
    ('Entries involved in conflicts', sum(bank[q]['n'] for q in conflicts)),
    ('Conflicts with a clear majority answer', sum(1 for q in conflicts if bank[q]['majority_txt'] is not None)),
    ('Conflicts that are a tie', sum(1 for q in conflicts if bank[q]['majority_txt'] is None)),
    ('Near-duplicate pairs (different ID)', len(near)),
    ('Near-duplicate pairs with different answers', near_diff),
    ('Entries with no correct answer recorded', sum(1 for o in occ if not o['right_txt'])),
]
with open(os.path.join(OUT, 'summary.txt'), 'w', encoding='utf-8') as fh:
    for k, v in summary:
        fh.write('%s: %s\n' % (k, v))
        print('%s: %s' % (k, v))

wb = xlsxwriter.Workbook(os.path.join(OUT, 'question_bank.xlsx'), {'strings_to_urls': False})
hdr = wb.add_format({'bold': True, 'bg_color': '#1F3A5F', 'font_color': 'white', 'text_wrap': True, 'valign': 'top'})
wrap = wb.add_format({'text_wrap': True, 'valign': 'top'})
red = wb.add_format({'text_wrap': True, 'valign': 'top', 'bg_color': '#FDE2E2'})
amber = wb.add_format({'text_wrap': True, 'valign': 'top', 'bg_color': '#FFF3CD'})
green = wb.add_format({'text_wrap': True, 'valign': 'top', 'bg_color': '#E3F4E3'})


def sheet(name, header, rows, widths, status_col=None):
    ws = wb.add_worksheet(name)
    ws.freeze_panes(1, 1)
    for c, h in enumerate(header):
        ws.write(0, c, h, hdr)
        ws.set_column(c, c, widths[c])
    for r, row in enumerate(rows, 1):
        fmt = wrap
        if status_col is not None:
            s = str(row[status_col])
            fmt = red if s.startswith('CONFLICT') or s == 'NO' else wrap
        for c, v in enumerate(row):
            ws.write(r, c, v, fmt)
    ws.autofilter(0, 0, max(len(rows), 1), len(header) - 1)
    return ws


ws = wb.add_worksheet('Summary')
ws.set_column(0, 0, 55); ws.set_column(1, 1, 14)
for r, (k, v) in enumerate(summary):
    ws.write(r, 0, k); ws.write(r, 1, v)
sheet('Conflicts', ch, crows, [8, 50, 28, 28, 28, 28, 28, 8, 12, 40, 8, 10, 70])
sheet('Questions', qh, qrows, [8, 55, 28, 28, 28, 28, 28, 12, 11, 11, 25, 30, 18, 10, 40], status_col=13)
sheet('Near duplicates', nh, nrows, [8, 8, 10, 10, 50, 50, 10, 10, 12, 10], status_col=9)
sheet('Occurrences', oh, orows, [8, 5, 22, 32, 7, 8, 12, 9, 14, 18], status_col=9)
wb.close()
json.dump([{k: v for k, v in r.items()} for r in
           [dict(id=q[0], question=q[1], options=dict(zip(LET, q[2:7])), correct=q[7], appearances=q[8], status=q[13])
            for q in qrows]], open(os.path.join(OUT, 'question_bank.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('done')
