/* Claude 스킬 교과서 · assets/app.js
   외부 라이브러리 없이 동작합니다. 데이터는 skills/index.json, skills/<id>/SKILL.md, skills/<id>/study.json 에서 읽습니다. */
(() => {
'use strict';

/* ================= 상수·유틸 ================= */
const LEVEL = { 1: '기본', 2: '보통', 3: '심화' };
const RULE_LABEL = { must: '반드시', never: '금지', env: '환경 의존', note: '참고' };
const QUIZ_PASS = 0.8;
const KEY_SRC = '(반드시|필수|절대로?|금지|주의|원칙|★)';
const KEY_TEST = new RegExp(KEY_SRC);
const KEY_G = new RegExp(KEY_SRC, 'g');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const hlKeys = html => html.replace(KEY_G, '<mark class="hl">$1</mark>');
const norm = t => String(t).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

async function getText(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) { const e = new Error(url + ' → ' + r.status); e.status = r.status; throw e; }
  return norm(await r.text());
}
const getJSON = async url => JSON.parse(await getText(url));

/* ================= 저장소(localStorage) ================= */
const store = {
  get(k, d) { try { const v = localStorage.getItem('skillstudy:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('skillstudy:' + k, JSON.stringify(v)); } catch { /* 저장 불가 환경은 무시 */ } },
};
const doneMap = () => store.get('done', {});
const isDone = (id, tab) => !!(doneMap()[id] || {})[tab];
function setDone(id, tab, v) {
  const m = doneMap(); m[id] = m[id] || {};
  if (v) m[id][tab] = true; else delete m[id][tab];
  store.set('done', m);
}
const trackable = s => s.tabs.filter(t => t.key !== 'source');
function progress(s) {
  const t = trackable(s); const d = t.filter(x => isDone(s.id, x.key)).length;
  return { done: d, total: t.length, pct: t.length ? Math.round(d / t.length * 100) : 0 };
}
const favs = () => store.get('favs', []);
const favId = (s, t, k) => `${s}|${t}|${k}`;
function toggleFav(item) {
  const a = favs(); const i = a.findIndex(x => x.id === item.id);
  if (i >= 0) a.splice(i, 1); else a.push(item);
  store.set('favs', a); return i < 0;
}

/* ================= 파싱 ================= */
const BLOCK_RE = /^[>|](?:[+-][1-9]?|[1-9][+-]?)?$/;   // >, >-, >+, >2, >2-, >+2 ... (YAML 블록 스칼라 머리글)
const unquote = v => (v.length > 1 && v[0] === v.slice(-1) && (v[0] === '"' || v[0] === "'")) ? v.slice(1, -1) : v;

function parseFrontmatter(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const fm = {}; let key = null; let subIndent = null;
  for (const line of m[1].split('\n')) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) {
      key = kv[1]; subIndent = null; const v = kv[2].trim();
      if (key === 'metadata' && (v === '' || BLOCK_RE.test(v))) fm[key] = {};      // 1단계 key-value 매핑
      else fm[key] = (BLOCK_RE.test(v) || v === '') ? '' : unquote(v);
    } else if (key) {
      if (typeof fm[key] === 'object') {
        const sub = line.match(/^(\s+)([\w.-]+):\s*(.*)$/);
        if (sub) {
          if (subIndent === null) subIndent = sub[1].length;
          if (sub[1].length === subIndent) fm[key][sub[2]] = unquote(sub[3].trim());   // 더 깊은 들여쓰기(중첩·목록)는 읽지 않음
        }
      } else if (typeof fm[key] === 'string') {
        fm[key] = (fm[key] ? fm[key] + ' ' : '') + line.trim();
      }
    }
  }
  return { fm, body: m[2] };
}

const FENCE = /^\s*```\s*([\w+-]*)/;

function splitSections(body) {
  const secs = []; let cur = { level: 0, title: '', lines: [], hid: null }; let inFence = false; let hc = 0;
  for (const ln of body.split('\n')) {
    if (FENCE.test(ln)) { inFence = !inFence; cur.lines.push(ln); continue; }
    const m = !inFence && ln.match(/^(#{1,6})\s+(.*)$/);
    if (m) { secs.push(cur); hc++; cur = { level: m[1].length, title: m[2].trim(), lines: [], hid: 'h' + hc }; }
    else cur.lines.push(ln);
  }
  secs.push(cur);
  return secs.filter(x => x.hid || x.lines.join('').trim());
}

function extractBlocks(body) {
  const out = []; let inFence = false; let cur = null; let ctx = '';
  for (const ln of body.split('\n')) {
    const f = ln.match(FENCE);
    if (f) {
      if (!inFence) { inFence = true; cur = { lang: f[1] || '', lines: [], ctx, indent: ln.match(/^\s*/)[0].length }; }
      else { inFence = false; out.push({ lang: cur.lang, ctx: cur.ctx, code: cur.lines.map(l => l.startsWith(' '.repeat(cur.indent)) ? l.slice(cur.indent) : l).join('\n') }); cur = null; }
      continue;
    }
    if (inFence) { cur.lines.push(ln); continue; }
    const h = ln.match(/^#{1,6}\s+(.*)$/);
    if (h) ctx = h[1].trim();
  }
  return out;
}

function extractPhrases(desc) {
  const out = []; const re = /["“]([^"”\n]{2,40})["”]/g; let m;
  while ((m = re.exec(desc))) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}
function firstSentence(t) {
  const m = String(t || '').match(/^.*?\.(\s|$)/);
  return (m ? m[0] : String(t || '').slice(0, 90)).trim();
}

function autoRules(s) {
  const out = []; let inFence = false; let ctx = '';
  for (const ln of s.body.split('\n')) {
    if (FENCE.test(ln)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const h = ln.match(/^#{1,6}\s+(.*)$/);
    if (h) ctx = h[1].trim();
    if (!KEY_TEST.test(ln) || /^\s*\|?\s*:?-{2,}/.test(ln)) continue;
    const text = ln.replace(/^[\s>*+-]+/, '').replace(/\*\*/g, '').trim();
    if (text.length < 4 || out.some(o => o.text === text)) continue;
    out.push({ text, ctx, level: /(금지|절대|않는다|하지 않)/.test(text) ? 'never' : 'must' });
  }
  return out;
}

/* ================= 마크다운 렌더러 ================= */
function inline(s) {
  return s.split(/(`[^`]+`)/).map((p, i) => {
    if (i % 2 === 1) return `<code>${esc(p.slice(1, -1))}</code>`;
    let t = esc(p);
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
    t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return t;
  }).join('');
}
const codeBlock = (code, lang) =>
  `<div class="code">${lang ? `<span class="lang">${esc(lang)}</span>` : ''}<button class="copy" type="button" data-copy>복사</button><pre><code>${esc(code)}</code></pre></div>`;

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells = ln => ln.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

function renderList(items) {
  let html = ''; const st = [];
  for (const it of items) {
    while (st.length && it.indent < st[st.length - 1].indent) html += '</li></' + (st.pop().ord ? 'ol' : 'ul') + '>';
    const top = st[st.length - 1];
    if (!top || it.indent > top.indent) { html += '<' + (it.ord ? 'ol' : 'ul') + '><li>' + inline(it.text); st.push({ indent: it.indent, ord: it.ord }); }
    else html += '</li><li>' + inline(it.text);
  }
  while (st.length) html += '</li></' + (st.pop().ord ? 'ol' : 'ul') + '>';
  return html;
}

function md(src, opt = {}) {
  const lines = norm(src).split('\n'); const out = []; let i = 0;
  const hc = opt.hc || { n: 0 };
  const blockStart = ln => FENCE.test(ln) || /^#{1,6}\s/.test(ln) || /^\s*(-{3,}|\*{3,})\s*$/.test(ln) || /^>/.test(ln) || LIST_RE.test(ln) || /^\s*\|/.test(ln);
  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) { i++; continue; }
    let m = ln.match(FENCE);
    if (m) {
      const indent = ln.match(/^\s*/)[0].length; const code = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i].startsWith(' '.repeat(indent)) ? lines[i].slice(indent) : lines[i]); i++; }
      i++; out.push(codeBlock(code.join('\n'), m[1])); continue;
    }
    m = ln.match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      const n = m[1].length; const text = m[2].trim();
      if (opt.noIds) { out.push(`<h${n}>${inline(text)}</h${n}>`); }
      else {
        hc.n++; const id = 'h' + hc.n;
        const fav = opt.skill && n <= 3 ? favBtn(opt.skill, 'source', id, text) : '';
        out.push(`<h${n} data-key="${id}">${inline(text)} ${fav}</h${n}>`);
      }
      i++; continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(ln)) { out.push('<hr>'); i++; continue; }
    if (/^\s*\|/.test(ln) && i + 1 < lines.length && SEP_RE.test(lines[i + 1])) {
      const head = cells(ln); i += 2; const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push(`<div class="tbl"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^>/.test(ln)) {
      const q = []; while (i < lines.length && /^>/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote>${md(q.join('\n'), { noIds: true })}</blockquote>`); continue;
    }
    if (LIST_RE.test(ln)) {
      const items = [];
      while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i])) {
        const lm = lines[i].match(LIST_RE);
        if (lm) items.push({ indent: lm[1].length, ord: /\d/.test(lm[2]), text: lm[3] });
        else if (/^\s+\S/.test(lines[i]) && items.length) items[items.length - 1].text += ' ' + lines[i].trim();
        else break;
        i++;
      }
      out.push(renderList(items)); continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !(para.length && blockStart(lines[i]))) { para.push(lines[i]); i++; }
    out.push(`<p>${para.map(inline).join('<br>')}</p>`);
  }
  return out.join('\n');
}

/* ================= 데이터 ================= */
const DB = { site: {}, categories: [], skills: [], byId: {}, ids: [], problems: [] };

/* 공개 Agent Skills 규격(agentskills.io) 기준의 간단한 형식 점검 */
const LINT_IDS = ['name-format', 'name-dir', 'desc-length', 'compat-length'];
function lintSkill(id, fm, desc) {
  const out = []; const name = fm.name || '';
  out.push({ id: 'name-format', ok: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) && name.length <= 64, text: 'name은 소문자·숫자·하이픈만 쓰고, 하이픈으로 시작하거나 끝나거나 연속되지 않으며 64자 이하', detail: name ? `현재 값: ${name}` : 'name이 없습니다' });
  out.push({ id: 'name-dir', ok: name === id, text: 'name이 폴더 이름과 같음', detail: `name: ${name || '(없음)'} / 폴더: ${id}` });
  out.push({ id: 'desc-length', ok: desc.length >= 1 && desc.length <= 1024, text: 'description은 1~1024자', detail: `현재 ${desc.length}자` });
  if (typeof fm.compatibility === 'string' && fm.compatibility) out.push({ id: 'compat-length', ok: fm.compatibility.length <= 500, text: 'compatibility는 500자 이하', detail: `현재 ${fm.compatibility.length}자` });
  return out;
}

/* study.json 내용이 화면에서 어긋날 수 있는 부분을 미리 알려 줍니다 */
function validateStudy(s) {
  const st = s.study; const w = [];
  (st.quiz || []).forEach((q, i) => {
    if (!Array.isArray(q.choices) || q.choices.length < 2) w.push(`quiz[${i}]: choices는 2개 이상의 배열이어야 합니다`);
    else if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length) w.push(`quiz[${i}]: answer(${q.answer})가 choices 범위를 벗어났습니다`);
  });
  (st.rules || []).forEach((r, i) => { if (r.level && !RULE_LABEL[r.level]) w.push(`rules[${i}]: level "${r.level}"은(는) must, never, env, note 중 하나여야 합니다`); });
  ((st.env || {}).items || []).forEach((it, i) => { if (it.kind !== 'portable' && it.kind !== 'env') w.push(`env.items[${i}]: kind는 portable 또는 env여야 합니다`); });
  (st.explain || []).forEach((e, i) => { if (!s.blocks.some(b => b.code.includes(e.match))) w.push(`explain[${i}]: match 문자열이 SKILL.md 코드 블록에서 발견되지 않습니다`); });
  (st.workflow || []).forEach((x, i) => { if (!x.title) w.push(`workflow[${i}]: title이 없습니다`); });
  (st.knownIssues || []).forEach((k, i) => { if (!LINT_IDS.includes(k.id)) w.push(`knownIssues[${i}]: id "${k.id}"은(는) ${LINT_IDS.join(', ')} 중 하나여야 합니다`); else if (!k.reason) w.push(`knownIssues[${i}]: reason(이유)을 적어 주세요`); });
  if (st.meta && st.meta.level && ![1, 2, 3].includes(st.meta.level)) w.push('meta.level은 1, 2, 3 중 하나여야 합니다');
  return w;
}

function buildSkill(id, raw, study) {
  const { fm, body } = parseFrontmatter(raw);
  const meta = study.meta || {};
  const desc = (fm.description || '').trim();
  const s = {
    id, raw, fm, body, study, desc,
    sections: splitSections(body), blocks: extractBlocks(body),
    title: meta.title || fm.name || id,
    category: meta.category || '미분류',
    level: [1, 2, 3].includes(meta.level) ? meta.level : 2,
    minutes: meta.minutes || Math.max(5, Math.round(body.length / 700)),
    summary: meta.summary || firstSentence(desc),
    files: {}, _filesLoaded: false, studyErr: '',
  };
  s.lint = lintSkill(id, fm, desc);
  const trig = study.triggers || {};
  s.phrases = (trig.phrases && trig.phrases.length) ? trig.phrases : extractPhrases(desc);
  const t = [{ key: 'core', label: '핵심' }, { key: 'trigger', label: '언제 쓰나' }, { key: 'workflow', label: '작동 흐름' }, { key: 'rules', label: '규칙' }, { key: 'examples', label: '예시' }];
  if (study.layouts && study.layouts.length) t.push({ key: 'layouts', label: '레이아웃' });
  if (study.design) t.push({ key: 'design', label: '디자인' });
  if (study.explain && study.explain.length) t.push({ key: 'explain', label: '코드 해설' });
  if (study.files && study.files.length) t.push({ key: 'files', label: '참고 파일' });
  if (study.quiz && study.quiz.length) t.push({ key: 'quiz', label: '퀴즈' });
  t.push({ key: 'source', label: '원문' });
  s.tabs = t;
  return s;
}

async function loadData() {
  const idx = await getJSON('skills/index.json');
  DB.site = idx.site || {};
  const ids = idx.skills || [];
  DB.ids = ids; DB.problems = []; DB.skills = [];
  const res = await Promise.allSettled(ids.map(async id => {
    const raw = await getText(`skills/${id}/SKILL.md`);
    let study = {}; let studyErr = '';
    try { study = await getJSON(`skills/${id}/study.json`); }
    catch (e) { if (e.status !== 404) studyErr = (e && e.message) || String(e); }   // 404는 정상(선택 파일), 문법 오류 등은 알림
    const s = buildSkill(id, raw, study); s.studyErr = studyErr; return s;
  }));
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      DB.skills.push(r.value);
      if (r.value.studyErr) DB.problems.push({ id: ids[i], file: 'study.json', msg: r.value.studyErr, note: '학습 정리 없이 원문 자동 추출로 표시합니다' });
      validateStudy(r.value).forEach(msg => DB.problems.push({ id: ids[i], file: 'study.json', msg, note: '화면은 표시되지만 이 항목이 어긋날 수 있습니다' }));
    } else {
      const why = r.reason || {};
      DB.problems.push({ id: ids[i], file: 'SKILL.md', msg: why.status ? `파일을 찾지 못했거나 읽지 못했습니다 (HTTP ${why.status})` : (why.message || String(why)) });
      console.warn('스킬을 불러오지 못했습니다:', r.reason);
    }
  });
  DB.byId = Object.fromEntries(DB.skills.map(s => [s.id, s]));
  const cats = (idx.categories || []).slice();
  DB.skills.forEach(s => { if (!cats.includes(s.category)) cats.push(s.category); });
  DB.categories = cats.filter(c => DB.skills.some(s => s.category === c));
}

function refreshProblems() {
  $$('.probbox').forEach(b => { b.innerHTML = problemsHtml(b.dataset.only || undefined); });
}

/* study.json의 files[].path 를 화면이 뜬 뒤 백그라운드로 확인: 404는 '없음', 그 밖의 HTTP 오류와 네트워크 오류는 '불러오기 실패'로 구분해 알림 */
async function probe(url) {
  let r = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
  if (r.status === 405 || r.status === 501) r = await fetch(url, { cache: 'no-cache' });   // HEAD를 막는 서버는 GET으로 재확인
  return r.status;
}
async function checkFilePaths() {
  const jobs = [];
  DB.skills.forEach(s => (s.study.files || []).forEach((f, i) => {
    const add = (msg, note) => DB.problems.push({ id: s.id, file: 'study.json', msg: `files[${i}]: ${f.path} ${msg}`, note });
    jobs.push(probe(`skills/${s.id}/${f.path}`).then(st => {
      if (st === 404) add('파일을 찾지 못했습니다', '참고 파일 탭에서 이 파일은 표시되지 않습니다');
      else if (st >= 400) add(`파일을 불러오지 못했습니다 (HTTP ${st})`, '서버 오류이거나 접근 권한 문제일 수 있습니다');
    }).catch(() => add('파일을 확인하지 못했습니다 (네트워크 오류)', '연결 상태를 확인하고 새로고침해 보세요')));
  }));
  await Promise.all(jobs);
  refreshProblems();
}

function problemsHtml(only) {
  const list = only ? DB.problems.filter(p => p.id === only) : DB.problems;
  if (!list.length) return '';
  const failed = DB.problems.filter(p => p.file === 'SKILL.md').length;
  const head = !only && failed ? `<p>skills/index.json에 등록된 스킬 ${DB.ids.length}개 중 ${DB.skills.length}개만 불러왔습니다.</p>` : '';
  return `<div class="note bad" role="alert"><h3>확인이 필요한 파일이 있습니다</h3>${head}<ul class="plist">${list.map(p => `<li><code>skills/${esc(p.id)}/${esc(p.file)}</code> ${esc(p.msg)}${p.note ? ` (${esc(p.note)})` : ''}</li>`).join('')}</ul></div>`;
}

async function ensureFiles(s) {
  if (s._filesLoaded) return;
  await Promise.all((s.study.files || []).map(async f => {
    try { s.files[f.path] = await getText(`skills/${s.id}/${f.path}`); } catch { s.files[f.path] = null; }
  }));
  s._filesLoaded = true;
}

/* ================= 공통 조각 ================= */
function favBtn(s, tab, key, label) {
  const id = favId(s.id, tab, key); const on = favs().some(f => f.id === id);
  return `<button type="button" class="fav${on ? ' on' : ''}" data-fav data-skill="${esc(s.id)}" data-tab="${esc(tab)}" data-key="${esc(key)}" data-label="${esc(label)}" aria-pressed="${on}" aria-label="즐겨찾기: ${esc(String(label).slice(0, 40))}">${on ? '★' : '☆'}</button>`;
}
const tag = (t, cls = '') => `<span class="tag ${cls}">${esc(t)}</span>`;
const bar = (pct, label = '학습 진도') => `<div class="bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>`;
const paras = v => (Array.isArray(v) ? v : [v]).filter(Boolean).map(t => `<p>${inline(t)}</p>`).join('');
const list = arr => `<ul class="plist">${arr.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`;
const empty = t => `<p class="empty">${esc(t)}</p>`;
const routeOf = (id, tab, key) => `#/skill/${id}/${tab}${key ? '~' + encodeURIComponent(key) : ''}`;

function doneRow(s, tab) {
  if (tab.key === 'source') return '';
  const on = isDone(s.id, tab.key);
  return `<div class="done-row"><button type="button" class="btn${on ? ' on' : ''}" data-done data-skill="${esc(s.id)}" data-tab="${esc(tab.key)}" aria-pressed="${on}">${on ? '학습 완료 ✓' : '이 단계 학습 완료로 표시'}</button></div>`;
}

/* ================= 탭 렌더러 ================= */
/* 어느 AI 환경용 스킬인지: study.json meta.platform > index.json site.platform */
function platformOf(s) {
  const own = (s.study.meta || {}).platform;
  return own !== undefined ? own : (DB.site.platform || '');
}
function platformTag(s) { const pf = platformOf(s); return pf ? tag(pf + ' 스킬', 'pf') : ''; }

function envItems(s) {
  const items = ((s.study.env || {}).items || []).slice();
  if (typeof s.fm.compatibility === 'string' && s.fm.compatibility) items.unshift({ name: 'SKILL.md의 compatibility 필드', kind: 'env', note: s.fm.compatibility });
  return items;
}

function portabilityTag(s) {
  const items = envItems(s);
  if (items.some(i => i.kind === 'env')) return tag('환경 의존 있음', 'env');
  if (items.length) return tag('지침 위주');
  return '';
}

function envBlock(s) {
  const items = envItems(s); if (!items.length) return '';
  return `<div class="block"><h2>어디서나 통하는 부분과 환경에 기대는 부분</h2><p class="fdesc">${platformOf(s) ? `이 스킬은 ${esc(platformOf(s))}에서 쓰도록 만들어졌습니다. 아래는 다른 곳으로 옮겨도 통하는 설계와, ${esc(platformOf(s))}의 스킬 실행 환경(도구, 경로, 스크립트)에 기대는 부분을 나눈 것입니다.` : '스킬이 부르는 도구, 경로, 스크립트는 실행 환경마다 다를 수 있습니다.'}</p><ul class="envlist">${items.map(it => `<li class="env-${esc(it.kind)}"><span class="tg">${it.kind === 'env' ? '환경 의존' : '범용'}</span><div><b>${esc(it.name)}</b>${it.note ? `<p>${inline(it.note)}</p>` : ''}</div></li>`).join('')}</ul></div>`;
}

function lintBlock(s) {
  const known = Object.fromEntries((s.study.knownIssues || []).filter(k => k && k.id).map(k => [k.id, k.reason || '']));
  const fails = s.lint.filter(l => !l.ok); const kept = fails.filter(l => l.id in known).length;
  const summary = fails.length ? ` 확인 필요 ${fails.length - kept}건${kept ? `, 알려진 사항 ${kept}건` : ''}.` : ' 모두 통과했습니다.';
  return `<div class="block"><h2>형식 점검</h2><p class="fdesc">공개 Agent Skills 규격(agentskills.io)의 name·description 조건 기준입니다. 지금 쓰는 앱에서 동작하는지와는 별개로, 규격에 맞는지 보는 점검입니다.${summary}</p><ul class="envlist">${s.lint.map(l => {
    const isKnown = !l.ok && l.id in known;
    const cls = l.ok ? 'env-portable' : (isKnown ? 'env-known' : 'env-env');
    const label = l.ok ? '통과' : (isKnown ? '알려진 사항' : '확인');
    return `<li class="${cls}"><span class="tg">${label}</span><div><b>${esc(l.text)}</b><p>${esc(l.detail)}</p>${isKnown ? `<p class="reason">유지하는 이유: ${esc(known[l.id])}</p>` : ''}</div></li>`;
  }).join('')}</ul></div>`;
}

function tCore(s) {
  const c = s.study.core || {}; const les = s.study.lesson || {};
  let h = `<div class="block"><h2>한 줄 정의</h2><p class="lead">${esc(c.oneLiner || s.summary)}</p></div>`;
  const when = (c.whenToUse && c.whenToUse.length) ? c.whenToUse : s.phrases.map(p => `“${p}”`);
  if (when.length) h += `<div class="block"><h2>언제 쓰나</h2>${list(when)}</div>`;
  if (c.goal) h += `<div class="block"><h2>목표</h2><p>${inline(c.goal)}</p></div>`;
  if (les.text) h += `<div class="note lesson"><h3>여기서 배울 점${les.title ? ': ' + esc(les.title) : ''}</h3>${paras(les.text)}</div>`;
  if (c.caution) h += `<div class="note warn"><h3>내 환경에 맞추려면</h3>${paras(c.caution)}</div>`;
  h += envBlock(s) + lintBlock(s);
  const memo = store.get('memo', {})[s.id] || '';
  h += `<div class="block"><h2>내 메모</h2><label class="sr" for="memo">이 스킬에 대한 메모</label><textarea id="memo" class="memo" data-memo="${esc(s.id)}" placeholder="이 스킬에서 내 업무에 바꿔 쓸 부분을 적어 두세요. 이 브라우저에만 저장됩니다.">${esc(memo)}</textarea></div>`;
  return h;
}

function tTrigger(s) {
  const t = s.study.triggers || {}; let h = '';
  if (s.phrases.length) h += `<div class="block"><h2>description에 적힌 사용자 표현 예시</h2><ul class="phrases">${s.phrases.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
  else h += `<div class="note"><h3>description에 사용자 표현 예시가 없습니다</h3><p>필수는 아니지만, 사용자가 실제로 할 법한 표현을 몇 개 적어 두면 어떤 요청에 쓰는 스킬인지 더 분명해질 수 있습니다.</p></div>`;
  if (t.note) h += `<div class="note"><h3>이 스킬의 description 읽기</h3>${paras(t.note)}</div>`;
  if (t.review) h += `<div class="note warn"><h3>학습 메모</h3>${paras(t.review)}</div>`;
  h += `<div class="block"><h2>왜 중요한가</h2><p>Claude는 요청마다 모든 스킬의 본문을 읽지 않습니다. 먼저 각 스킬의 name과 description을 보고 이번 요청에 쓸지 판단하고, 쓰기로 정한 뒤에 SKILL.md 본문을 읽습니다. 그래서 무엇을 하는 스킬인지, 언제 쓰는지, 어떤 상황에 알맞은지를 description에 분명히 적는 것이 중요합니다. 사용자가 실제로 할 법한 표현을 몇 개 함께 적으면 의도를 전달하는 데 도움이 될 수 있습니다.</p></div>`;
  h += `<div class="block"><h2>description 원문</h2><blockquote>${esc(s.desc) || '(없음)'}</blockquote><p>name: <code>${esc(s.fm.name || '')}</code></p></div>`;
  return h;
}

function tWorkflow(s) {
  const wf = s.study.workflow || []; let items = [];
  if (wf.length) {
    items = wf.map((w, i) => ({
      title: w.title,
      html: paras(w.detail) + (w.branches && w.branches.length ? `<ul class="branches">${w.branches.map(b => `<li><b>${esc(b.label)}</b><span>${inline(b.text)}</span></li>`).join('')}</ul>` : ''),
    }));
  } else {
    items = s.sections.filter(x => x.hid && x.level >= 2 && /(step|단계)/i.test(x.title)).map(x => ({ title: x.title, html: md(x.lines.join('\n'), { noIds: true }) }));
  }
  if (!items.length) return empty('단계로 나눌 수 있는 제목(Step, 단계)을 SKILL.md에서 찾지 못했습니다. 원문 탭을 확인하세요.');
  let h = `<div class="toolrow"><button type="button" class="btn" data-expand="open">모두 펼치기</button><button type="button" class="btn" data-expand="close">모두 접기</button></div><ol class="steps">`;
  h += items.map((it, i) => `<li class="step" data-key="wf${i}"><span class="num">${i + 1}</span><details${i === 0 ? ' open' : ''}><summary><span class="st">${esc(it.title)}</span></summary><div class="body">${it.html}</div></details>${favBtn(s, 'workflow', 'wf' + i, it.title)}</li>`).join('');
  return h + '</ol>';
}

function tRules(s) {
  const rules = s.study.rules || []; const auto = autoRules(s); let h = '';
  if (rules.length) {
    h += `<div class="legend"><span class="tag cat">반드시: 지켜야 하는 것</span><span class="tag">금지: 하면 안 되는 것</span><span class="tag env">환경 의존: 실행 환경에 따라 달라지는 것</span><span class="tag">참고: 알아 두면 좋은 것</span></div><ul class="rules">`;
    h += rules.map((r, i) => `<li class="rule ${esc(r.level || 'note')}" data-key="r${i}"><span class="tg">${RULE_LABEL[r.level] || '참고'}</span><div><p>${hlKeys(inline(r.text))}</p>${r.why ? `<p class="why">${inline(r.why)}</p>` : ''}</div>${favBtn(s, 'rules', 'r' + i, r.text)}</li>`).join('');
    h += '</ul>';
  }
  if (auto.length) {
    const inner = `<ul class="autolist">${auto.map(a => `<li>${hlKeys(inline(a.text))}<small>${esc(a.ctx)}</small></li>`).join('')}</ul>`;
    h += `<details class="auto"${rules.length ? '' : ' open'}><summary>원문에서 강조 표현(반드시, 필수, 절대, 금지, 주의, 원칙)이 들어간 줄 ${auto.length}개</summary>${inner}</details>`;
  }
  return h || empty('강조 표현이 있는 규칙을 찾지 못했습니다.');
}

function tExamples(s) {
  if (!s.blocks.length) return empty('SKILL.md에 코드 블록(예시)이 없습니다.');
  const isCode = b => /^(python|py|js|javascript|bash|sh|json|ts|xml|html|css)$/i.test(b.lang);
  const group = (title, arr) => arr.length ? `<div class="block"><h2>${title}</h2><div class="exs">${arr.map(({ b, i }) => `<div class="ex" data-key="ex${i}"><h3>${esc(b.ctx || '(제목 없음)')}${favBtn(s, 'examples', 'ex' + i, b.ctx || '예시')}</h3>${codeBlock(b.code, b.lang)}</div>`).join('')}</div></div>` : '';
  const all = s.blocks.map((b, i) => ({ b, i }));
  return group('서식·입출력 예시', all.filter(x => !isCode(x.b))) + group('코드', all.filter(x => isCode(x.b)));
}

function tExplain(s) {
  return (s.study.explain || []).map((e, i) => {
    const blk = s.blocks.find(b => b.code.includes(e.match));
    const plain = paras(e.why) + (e.points && e.points.length ? list(e.points) : '');
    return `<article class="xp" data-key="x${i}"><h3>${esc(e.title)}${favBtn(s, 'explain', 'x' + i, e.title)}</h3>
      <div class="seg" role="group" aria-label="보기 방식"><button type="button" data-xp="plain" aria-pressed="true">쉬운 설명</button><button type="button" data-xp="code" aria-pressed="false">코드 보기</button></div>
      <div class="xp-plain">${plain}</div><div class="xp-code" hidden>${blk ? codeBlock(blk.code, blk.lang) : empty('원문에서 해당 코드를 찾지 못했습니다.')}</div></article>`;
  }).join('');
}

/* 레이아웃 와이어프레임 (SVG) */
function wire(type) {
  const r = (c, x, y, w, h, rx = 2) => `<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
  const frame = '<rect class="f" x=".5" y=".5" width="159" height="89" rx="5"/>';
  let b = '';
  switch (type) {
    case 'cover': b = r('bs', 10, 12, 36, 7, 3.5) + r('t', 10, 28, 74, 7) + r('t', 10, 40, 52, 7) + r('l', 10, 56, 64, 3.5) + r('d', 98, 14, 52, 62, 4); break;
    case 'bullets': b = r('t', 10, 10, 56, 5) + r('l', 10, 19, 40, 3) + [34, 48, 62].map((y, k) => `<circle class="b" cx="14" cy="${y + 2}" r="2.5"/>` + r('l', 22, y, [58, 48, 54][k], 4)).join('') + r('d', 96, 28, 54, 52, 4); break;
    case 'compare': b = r('t', 10, 10, 60, 5) + r('s', 10, 26, 66, 54, 5) + r('s', 84, 26, 66, 54, 5) + r('b', 18, 34, 30, 4) + r('b', 92, 34, 30, 4) + [46, 56, 66].map(y => r('l', 18, y, 50, 3.5) + r('l', 92, y, 50, 3.5)).join(''); break;
    case 'process': b = r('t', 10, 10, 64, 5) + '<line class="ln" x1="30" y1="44" x2="130" y2="44"/>' + [24, 60, 96, 132].map(cx => `<circle class="b" cx="${cx}" cy="44" r="9"/>` + r('l', cx - 13, 62, 26, 3.5) + r('l', cx - 9, 69, 18, 3)).join(''); break;
    case 'table': b = r('t', 10, 10, 60, 5) + r('bs', 10, 26, 140, 12, 2) + '<path class="ln" d="M10 50H150M10 62H150M10 74H150M56 26V80M103 26V80"/>' + [30, 43, 55, 67].map((y, k) => [14, 60, 107].map(x => r(k ? 'l' : 'b', x, y, 30, 3.5)).join('')).join('') + '<rect class="f" x="10" y="26" width="140" height="54" rx="2"/>'; break;
    case 'image': b = r('t', 10, 10, 60, 5) + r('d', 22, 24, 116, 46, 4) + r('l', 58, 78, 44, 3.5); break;
    case 'quote': b = '<text class="bq" x="12" y="36" font-size="34">“</text>' + r('t', 26, 40, 108, 6) + r('t', 26, 52, 78, 6) + r('l', 26, 70, 36, 3.5); break;
    case 'closing': b = r('t', 10, 12, 72, 6) + r('l', 10, 28, 112, 3.5) + r('l', 10, 36, 92, 3.5) + r('b', 10, 56, 140, 22, 5) + r('w', 20, 64, 84, 5); break;
    default: b = r('d', 20, 20, 120, 50, 4);
  }
  return `<svg viewBox="0 0 160 90" role="img" aria-label="${esc(type)} 레이아웃 모양">${frame}${b}</svg>`;
}

function tLayouts(s) {
  const lf = Object.keys(s.files).find(p => /layout_types\.md$/.test(p));
  const blocks = lf && s.files[lf] ? extractBlocks(s.files[lf]) : [];
  return `<p class="empty">슬라이드 한 장의 뼈대를 그린 것입니다. 파란 점선 박스는 이미지 자리입니다.</p><div class="lgrid">` +
    s.study.layouts.map((l, i) => {
      const sample = blocks.find(b => b.code.includes(`"type": "${l.type}"`));
      return `<article class="lay" data-key="lay${i}">${wire(l.type)}<h3>${esc(l.name)} <span class="type">${esc(l.type)}</span> ${favBtn(s, 'layouts', 'lay' + i, l.name + ' 레이아웃')}</h3><p><b>쓰는 때</b> ${esc(l.use)}</p>${l.note ? `<p>${esc(l.note)}</p>` : ''}<p><b>필드</b> <code>${esc(l.fields)}</code></p>${sample ? `<details><summary>content.json 예시 보기</summary>${codeBlock(sample.code, 'json')}</details>` : ''}</article>`;
    }).join('') + '</div>';
}

function tDesign(s) {
  const d = s.study.design; let h = d.intro ? `<p>${esc(d.intro)}</p>` : '';
  if (d.colors) h += `<div class="block"><h2>색상 토큰</h2><div class="swatches">${d.colors.map(c => `<div class="sw"><i style="background:#${esc(c.hex)}"></i><div><b>${esc(c.name)} <code>${esc(c.hex)}</code></b><small>${esc(c.role)}</small></div></div>`).join('')}</div></div>`;
  if (d.sizes) h += `<div class="block"><h2>글자 크기</h2><div class="tbl"><table><thead><tr><th>요소</th><th>크기</th></tr></thead><tbody>${d.sizes.map(z => `<tr><td>${esc(z.el)}</td><td>${esc(z.size)}</td></tr>`).join('')}</tbody></table></div></div>`;
  if (d.rules) h += `<div class="block"><h2>디자인 원칙</h2>${list(d.rules)}</div>`;
  return h;
}

function tFiles(s, key) {
  const files = s.study.files; const cur = files.find(f => f.path === key) || files[0]; const text = s.files[cur.path];
  let h = `<div class="fpills">${files.map(f => `<a href="${routeOf(s.id, 'files', f.path)}"${f.path === cur.path ? ' aria-current="true"' : ''}>${esc(f.title || f.path)}</a>`).join('')}</div>`;
  h += `<p class="fdesc"><code>${esc(cur.path)}</code> ${cur.desc ? esc(cur.desc) : ''} ${favBtn(s, 'files', cur.path, cur.title || cur.path)}</p>`;
  if (cur.notes && cur.notes.length) h += `<div class="note"><h3>읽는 법</h3>${list(cur.notes)}</div>`;
  if (text == null) return h + empty('이 파일을 불러오지 못했습니다.');
  if (/\.md$/i.test(cur.path)) {
    h += `<div class="seg" role="group" aria-label="보기 방식"><button type="button" data-view="rendered" aria-pressed="${!viewRaw}">보기 좋게</button><button type="button" data-view="raw" aria-pressed="${viewRaw}">원문 Markdown</button></div>`;
    h += viewRaw ? `<div class="rawbox">${codeBlock(text, 'md')}</div>` : `<div class="md">${md(text, { noIds: true })}</div>`;
  } else {
    h += codeBlock(text, (cur.path.split('.').pop() || '').toLowerCase());
  }
  return h;
}

function tQuiz(s) {
  const qs = s.study.quiz; const saved = (store.get('quiz', {})[s.id]) || {};
  const answered = Object.keys(saved).length;
  const correct = qs.filter((q, i) => saved[i] === q.answer).length;
  let h = `<div class="score"><span>${answered} / ${qs.length}문제 풀이, 정답 ${correct}개</span>${answered ? '<button type="button" class="btn" data-quizreset>다시 풀기</button>' : ''}</div>`;
  if (answered >= qs.length) h += `<p class="${correct / qs.length >= QUIZ_PASS ? 'passmsg' : 'note'}">${correct / qs.length >= QUIZ_PASS ? `정답률 ${Math.round(QUIZ_PASS * 100)}% 이상이라 이 단계를 완료로 표시했습니다.` : `정답률 ${Math.round(QUIZ_PASS * 100)}% 미만입니다. 해설을 읽고 다시 풀어 보세요. 아래 버튼으로 직접 완료 표시도 할 수 있습니다.`}</p>`;
  h += qs.map((q, i) => {
    const ans = saved[i]; const has = ans !== undefined;
    return `<section class="qz" data-key="q${i}"><h3>문제 ${i + 1}. ${esc(q.q)}</h3><ul>${q.choices.map((c, j) => {
      let cls = 'ch'; if (has) { if (j === q.answer) cls += ' ok'; else if (j === ans) cls += ' no'; }
      return `<li><button type="button" class="${cls}" data-ch data-q="${i}" data-c="${j}"${has ? ' disabled' : ''}>${esc(c)}</button></li>`;
    }).join('')}</ul>${has ? `<div class="exp"><b>${ans === q.answer ? '정답입니다.' : '오답입니다. 정답은 “' + esc(q.choices[q.answer]) + '”입니다.'}</b> ${inline(q.why || '')}</div>` : ''}</section>`;
  }).join('');
  return h;
}

let viewRaw = false; let viewCtx = '';
function tSource(s) {
  const rows = Object.keys(s.fm).map(k => { const v = s.fm[k]; const val = (v && typeof v === 'object') ? Object.keys(v).map(x => `${x}: ${v[x]}`).join(', ') : v; return `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`; }).join('');
  let h = `<dl class="fm">${rows}</dl>`;
  h += `<div class="toolrow"><div class="seg" role="group" aria-label="보기 방식"><button type="button" data-view="rendered" aria-pressed="${!viewRaw}">보기 좋게</button><button type="button" data-view="raw" aria-pressed="${viewRaw}">원문 Markdown</button></div></div>`;
  if (viewRaw) return h + `<div class="rawbox">${codeBlock(s.raw, 'md')}</div>`;
  const toc = s.sections.filter(x => x.hid && x.level <= 3);
  if (toc.length) h += `<details class="auto"><summary>목차 (${toc.length})</summary><ul class="plist">${toc.map(x => `<li style="margin-left:${(x.level - 1) * .9}rem"><a href="${routeOf(s.id, 'source', x.hid)}">${esc(x.title)}</a></li>`).join('')}</ul></details>`;
  return h + `<div class="md">${md(s.body, { skill: s })}</div>`;
}

const RENDER = { core: tCore, trigger: tTrigger, workflow: tWorkflow, rules: tRules, examples: tExamples, explain: tExplain, layouts: tLayouts, design: tDesign, files: tFiles, quiz: tQuiz, source: tSource };

/* ================= 화면 ================= */
const app = () => $('#app');
let catFilter = '전체';

function overall() {
  let d = 0, t = 0; DB.skills.forEach(s => { const p = progress(s); d += p.done; t += p.total; });
  return { done: d, total: t, pct: t ? Math.round(d / t * 100) : 0 };
}

function renderHome() {
  document.title = DB.site.title || 'Claude 스킬 교과서';
  const o = overall();
  const shown = DB.skills.filter(s => catFilter === '전체' || s.category === catFilter);
  app().innerHTML = `<section class="hero"><h1>${esc(DB.site.title || 'Claude 스킬 교과서')}</h1>${DB.site.tagline ? `<p class="fmt">${esc(DB.site.tagline)}</p>` : ''}
    <p>${esc(DB.site.subtitle || '스킬 원문을 읽기 전에 언제 쓰이고, 어떤 순서로 움직이고, 무엇을 지키는지부터 잡습니다.')}</p>
    <div class="overall">${bar(o.pct, '전체 학습 진도')}<span>학습 ${o.done} / ${o.total}단계</span></div></section>
    <div class="probbox" data-only="">${problemsHtml()}</div>
    <div class="filters" role="group" aria-label="카테고리">${['전체'].concat(DB.categories).map(c => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${c === catFilter}">${esc(c)}</button>`).join('')}</div>
    <div class="grid">${shown.map(s => { const p = progress(s); return `<a class="card" href="#/skill/${esc(s.id)}"><div class="meta">${platformTag(s)}${tag(s.category, 'cat')}${tag('난이도 ' + LEVEL[s.level])}${tag('약 ' + s.minutes + '분')}${portabilityTag(s)}</div><h2>${esc(s.title)}</h2><p>${esc(s.summary)}</p><div class="pg">${bar(p.pct, s.title + ' 학습 진도')}<span>${p.done}/${p.total}</span></div></a>`; }).join('') || empty('표시할 스킬이 없습니다.')}</div>`;
}

function sideNav(cur) {
  return DB.categories.map(c => `<h3>${esc(c)}</h3>` + DB.skills.filter(s => s.category === c).map(s => `<a href="#/skill/${esc(s.id)}"${s.id === cur ? ' aria-current="page"' : ''}><span>${esc(s.title)}</span><span class="pc">${progress(s).pct}%</span></a>`).join('')).join('');
}

async function renderSkill(id, spec, seq) {
  const s = DB.byId[id]; if (!s) return renderNotFound();
  const at = (spec || 'core').indexOf('~');
  const tabKey = at < 0 ? (spec || 'core') : spec.slice(0, at);
  const key = at < 0 ? '' : decodeURIComponent(spec.slice(at + 1));
  const tab = s.tabs.find(t => t.key === tabKey) || s.tabs[0];
  if (tab.key === 'layouts' || tab.key === 'files') await ensureFiles(s);
  if (seq !== undefined && seq !== routeSeq) return;   // 그 사이 다른 화면으로 이동했으면 그리지 않음
  const ctx = s.id + '/' + tab.key; if (ctx !== viewCtx) { viewRaw = false; viewCtx = ctx; }
  document.title = `${s.title} · ${tab.label} · ${DB.site.title || 'Claude 스킬 교과서'}`;
  const p = progress(s);
  const body = RENDER[tab.key](s, key);
  app().innerHTML = `<div class="layout"><aside class="side" aria-label="스킬 목록">${sideNav(s.id)}</aside><article>
    <div class="topline"><a class="back" href="#/">← 전체 스킬</a><label class="sr" for="skillpick">스킬 바로 이동</label><select id="skillpick" class="skillpick">${DB.skills.map(x => `<option value="${esc(x.id)}"${x.id === s.id ? ' selected' : ''}>${esc(x.title)}</option>`).join('')}</select></div>
    <div class="probbox" data-only="${esc(s.id)}">${problemsHtml(s.id)}</div>
    <header class="shead"><h1>${esc(s.title)}</h1><p class="sum">${esc(s.summary)}</p>
      <div class="meta">${platformTag(s)}${tag(s.category, 'cat')}${tag('난이도 ' + LEVEL[s.level])}${tag('약 ' + s.minutes + '분')}${portabilityTag(s)}</div>
      <div class="sprog">${bar(p.pct, '이 스킬의 학습 진도')}<span id="sprogtxt">학습 ${p.done} / ${p.total}단계</span></div>${tab.key === 'source' ? '' : '<p class="disc">학습 정리는 이해를 돕기 위한 재구성입니다. 실행 규칙의 기준은 원문(SKILL.md)입니다.</p>'}</header>
    <nav class="tabs" aria-label="학습 단계">${s.tabs.map(t => `<a id="tab-${t.key}" href="${routeOf(s.id, t.key)}"${t.key === tab.key ? ' aria-current="page"' : ''}>${esc(t.label)}${t.key !== 'source' && isDone(s.id, t.key) ? '<span class="ck" aria-label="완료">✓</span>' : ''}</a>`).join('')}</nav>
    <section id="pane" class="pane${['layouts', 'source', 'files'].includes(tab.key) ? ' wide' : ''}">${body}${doneRow(s, tab)}</section></article></div>`;
  const pane = $('#pane');
  if (key && !['files'].includes(tab.key)) focusKey(pane, key);
}

function focusKey(root, key) {
  const el = Array.from(root.querySelectorAll('[data-key]')).find(e => e.dataset.key === key); if (!el) return;
  const d = el.closest('details') || el.querySelector('details'); if (d) d.open = true;
  el.scrollIntoView({ block: 'center' }); el.classList.add('flash');
}

function renderFavs() {
  document.title = '즐겨찾기 · ' + (DB.site.title || 'Claude 스킬 교과서');
  const a = favs();
  if (!a.length) { app().innerHTML = `<h1 class="pgh">즐겨찾기</h1><p class="empty">아직 즐겨찾기가 없습니다. 규칙, 흐름 단계, 원문 제목 옆의 ☆를 눌러 보세요.</p>`; return; }
  const bySkill = {}; a.forEach(f => (bySkill[f.skill] = bySkill[f.skill] || []).push(f));
  app().innerHTML = `<h1 class="pgh">즐겨찾기</h1>` + Object.keys(bySkill).map(id => {
    const s = DB.byId[id];
    return `<h2>${esc(s ? s.title : id)}</h2><ul class="favs">${bySkill[id].map(f => `<li><a href="${routeOf(f.skill, f.tab, f.key)}">${esc(f.label)}</a>${tag((s && (s.tabs.find(t => t.key === f.tab) || {}).label) || f.tab)}<button type="button" class="fav on" data-fav data-skill="${esc(f.skill)}" data-tab="${esc(f.tab)}" data-key="${esc(f.key)}" data-label="${esc(f.label)}" aria-label="즐겨찾기 해제">★</button></li>`).join('')}</ul>`;
  }).join('');
}

/* ---------- 검색 ---------- */
let SEARCH = null;
async function buildSearch() {
  if (SEARCH) return SEARCH;
  await Promise.all(DB.skills.map(ensureFiles));
  const ix = [];
  DB.skills.forEach(s => {
    const st = s.study; const c = st.core || {};
    ix.push({ s, tab: 'core', key: '', title: '핵심', text: [s.title, s.summary, c.oneLiner, (c.whenToUse || []).join(' '), c.goal, (st.lesson || {}).text, c.caution, envItems(s).map(x => x.name + ' ' + (x.note || '')).join(' ')].join(' ') });
    s.sections.forEach(x => ix.push({ s, tab: 'source', key: x.hid || '', title: x.title || 'SKILL.md 머리말', text: x.lines.join('\n') }));
    (st.rules || []).forEach((r, i) => ix.push({ s, tab: 'rules', key: 'r' + i, title: '규칙', text: r.text + ' ' + (r.why || '') }));
    (st.workflow || []).forEach((w, i) => ix.push({ s, tab: 'workflow', key: 'wf' + i, title: w.title, text: [].concat(w.detail || []).join(' ') + ' ' + (w.branches || []).map(b => b.label + ' ' + b.text).join(' ') }));
    (st.explain || []).forEach((e, i) => ix.push({ s, tab: 'explain', key: 'x' + i, title: e.title, text: e.why + ' ' + (e.points || []).join(' ') }));
    (st.quiz || []).forEach((q, i) => ix.push({ s, tab: 'quiz', key: 'q' + i, title: `퀴즈 문제 ${i + 1}`, text: [q.q, (q.choices || []).join(' '), q.why].join(' ') }));
    Object.keys(s.files).forEach(pth => {
      const t = s.files[pth]; if (!t) return;
      const ls = t.split('\n');
      for (let k = 0; k < ls.length; k += 18) ix.push({ s, tab: 'files', key: pth, title: pth + (k ? ` (${k + 1}줄~)` : ''), text: ls.slice(k, k + 18).join('\n') });
    });
  });
  SEARCH = ix; return ix;
}

function snippet(text, toks) {
  const low = text.toLowerCase(); let pos = -1;
  toks.forEach(t => { const p = low.indexOf(t); if (p >= 0 && (pos < 0 || p < pos)) pos = p; });
  const st = Math.max(0, pos - 40);
  let h = esc(text.slice(st, st + 160).replace(/\s+/g, ' '));
  toks.forEach(t => { h = h.replace(new RegExp(escRe(esc(t)), 'gi'), m => `<mark>${m}</mark>`); });
  return (st > 0 ? '…' : '') + h + '…';
}

async function renderSearch(q, seq) {
  document.title = `검색: ${q} · ` + (DB.site.title || 'Claude 스킬 교과서');
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
  app().innerHTML = `<h1 class="pgh">“${esc(q)}” 검색</h1><p class="loading">찾는 중입니다.</p>`;
  const ix = await buildSearch();
  if (seq !== undefined && seq !== routeSeq) return;
  const res = [];
  ix.forEach(e => {
    const low = (e.title + ' ' + e.text).toLowerCase();
    if (!toks.every(t => low.includes(t))) return;
    let sc = 0; toks.forEach(t => { sc += low.split(t).length - 1; if (e.title.toLowerCase().includes(t)) sc += 5; });
    res.push({ e, sc });
  });
  res.sort((a, b) => b.sc - a.sc);
  const top = []; const perFile = {}; let capped = 0;
  for (const r of res) {
    if (r.e.tab === 'files') {
      const k = r.e.s.id + '|' + r.e.key; perFile[k] = (perFile[k] || 0) + 1;
      if (perFile[k] > 3) { capped++; continue; }      // 한 참고 파일이 결과를 독차지하지 않게 파일당 3건까지
    }
    if (top.length < 40) top.push(r);
  }
  const tl = (s, k) => (s.tabs.find(t => t.key === k) || {}).label || k;
  app().innerHTML = `<h1 class="pgh">“${esc(q)}” 검색 결과 ${res.length}건</h1>` + (capped ? `<p class="disc">참고 파일은 파일마다 3건까지만 보여 줍니다 (${capped}건 생략).</p>` : '') +
    (top.length ? `<ul class="results">${top.map(({ e }) => `<li><a href="${routeOf(e.s.id, e.tab, e.key)}"><div class="meta">${tag(e.s.title, 'cat')}${tag(tl(e.s, e.tab))}</div><span class="rt">${esc(e.title)}</span><span class="rs">${snippet(e.text, toks)}</span></a></li>`).join('')}</ul>` : empty('일치하는 내용이 없습니다. 다른 낱말로 검색해 보세요.'));
}

function renderNotFound() {
  app().innerHTML = `<h1 class="pgh">페이지를 찾을 수 없습니다</h1><p><a href="#/">전체 스킬로 돌아가기</a></p>`;
}

function renderError(e) {
  const local = location.protocol === 'file:';
  app().innerHTML = `<div class="note bad"><h3>데이터를 불러오지 못했습니다</h3>
    <p>${local ? '파일을 더블클릭해 열면(file://) 브라우저가 JSON·Markdown 읽기를 막습니다. GitHub Pages로 열거나, 이 폴더에서 <code>python -m http.server</code>를 실행한 뒤 <code>http://localhost:8000</code>으로 접속하세요.' : '<code>skills/index.json</code>과 각 스킬 폴더의 <code>SKILL.md</code> 경로를 확인하세요.'}</p>
    <p><small>${esc(e && e.message)}</small></p></div>`;
}

/* ---------- 라우터 ---------- */
let routeSeq = 0;
async function route() {
  const seq = ++routeSeq;
  const parts = (location.hash.slice(1) || '/').split('/').filter(Boolean);
  const qin = $('#q');
  try {
    if (!parts.length) renderHome();
    else if (parts[0] === 'skill') await renderSkill(decodeURIComponent(parts[1] || ''), parts[2], seq);
    else if (parts[0] === 'favs') renderFavs();
    else if (parts[0] === 'search') {
      const q = decodeURIComponent(parts.slice(1).join('/'));
      if (qin && document.activeElement !== qin) qin.value = q;
      await renderSearch(q, seq);
    } else renderNotFound();
  } catch (e) { if (seq === routeSeq) { console.error(e); renderError(e); } }
  if (seq !== routeSeq) return;
  if (parts[0] !== 'search' && qin && document.activeElement !== qin) qin.value = '';
  updateFavCount();
  const hasKey = parts[0] === 'skill' && (parts[2] || '').includes('~');
  if (!hasKey) window.scrollTo(0, 0);
}

function updateFavCount() { const el = $('#favCount'); if (el) el.textContent = favs().length; }

/* ================= 이벤트 ================= */
document.addEventListener('click', e => {
  const t = e.target.closest('button, a'); if (!t) return;

  if (t.hasAttribute('data-copy')) {
    const code = t.parentElement.querySelector('code'); const txt = code ? code.textContent : '';
    const ok = () => { t.textContent = '복사됨'; setTimeout(() => { t.textContent = '복사'; }, 1300); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, () => { fallbackCopy(txt); ok(); });
    else { fallbackCopy(txt); ok(); }
    return;
  }
  if (t.hasAttribute('data-fav')) {
    e.preventDefault(); e.stopPropagation();
    const d = t.dataset; const item = { id: favId(d.skill, d.tab, d.key), skill: d.skill, tab: d.tab, key: d.key, label: d.label };
    const on = toggleFav(item);
    $$('button[data-fav]').filter(b => b.dataset.skill === d.skill && b.dataset.tab === d.tab && b.dataset.key === d.key).forEach(b => {
      b.classList.toggle('on', on); b.textContent = on ? '★' : '☆'; b.setAttribute('aria-pressed', on);
    });
    updateFavCount();
    if (location.hash.startsWith('#/favs')) renderFavs();
    return;
  }
  if (t.hasAttribute('data-done')) {
    const s = DB.byId[t.dataset.skill]; const on = !isDone(s.id, t.dataset.tab);
    setDone(s.id, t.dataset.tab, on);
    t.classList.toggle('on', on); t.setAttribute('aria-pressed', on);
    t.textContent = on ? '학습 완료 ✓' : '이 단계 학습 완료로 표시';
    refreshProgress(s); return;
  }
  if (t.hasAttribute('data-ch')) {
    const s = currentSkill(); if (!s) return;
    const qz = store.get('quiz', {}); qz[s.id] = qz[s.id] || {};
    const qi = +t.dataset.q; if (qz[s.id][qi] === undefined) qz[s.id][qi] = +t.dataset.c;
    store.set('quiz', qz);
    const tot = s.study.quiz.length;
    if (Object.keys(qz[s.id]).length >= tot) {
      const okc = s.study.quiz.filter((q, i) => qz[s.id][i] === q.answer).length;
      if (okc / tot >= QUIZ_PASS && !isDone(s.id, 'quiz')) setDone(s.id, 'quiz', true);
    }
    $('#pane').innerHTML = tQuiz(s) + doneRow(s, { key: 'quiz' }); refreshProgress(s); return;
  }
  if (t.hasAttribute('data-quizreset')) {
    const s = currentSkill(); if (!s) return;
    const qz = store.get('quiz', {}); delete qz[s.id]; store.set('quiz', qz);
    setDone(s.id, 'quiz', false);
    $('#pane').innerHTML = tQuiz(s) + doneRow(s, { key: 'quiz' }); refreshProgress(s); return;
  }
  if (t.hasAttribute('data-view')) {
    viewRaw = t.dataset.view === 'raw'; const y = window.scrollY; route().then(() => window.scrollTo(0, y)); return;
  }
  if (t.hasAttribute('data-xp')) {
    const art = t.closest('.xp'); const code = t.dataset.xp === 'code';
    $$('.seg button', art).forEach(b => b.setAttribute('aria-pressed', String(b === t)));
    $('.xp-plain', art).hidden = code; $('.xp-code', art).hidden = !code; return;
  }
  if (t.hasAttribute('data-expand')) {
    const open = t.dataset.expand === 'open'; $$('#pane details').forEach(d => { d.open = open; }); return;
  }
  if (t.hasAttribute('data-cat')) { catFilter = t.dataset.cat; renderHome(); return; }
});

function fallbackCopy(txt) {
  const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch { /* 무시 */ } ta.remove();
}

function currentSkill() {
  const p = location.hash.slice(1).split('/').filter(Boolean); return p[0] === 'skill' ? DB.byId[decodeURIComponent(p[1] || '')] : null;
}

function refreshProgress(s) {
  const p = progress(s);
  const b = $('.sprog .bar'); if (b) { $('i', b).style.width = p.pct + '%'; b.setAttribute('aria-valuenow', p.pct); }
  const tx = $('#sprogtxt'); if (tx) tx.textContent = `학습 ${p.done} / ${p.total}단계`;
  s.tabs.forEach(t => {
    const a = $('#tab-' + t.key); if (!a || t.key === 'source') return;
    const ck = $('.ck', a);
    if (isDone(s.id, t.key) && !ck) a.insertAdjacentHTML('beforeend', '<span class="ck" aria-label="완료">✓</span>');
    if (!isDone(s.id, t.key) && ck) ck.remove();
  });
  $$('.side a').forEach(a => { const id = (a.getAttribute('href') || '').split('/')[2]; const sk = DB.byId[id]; if (sk) { const pc = $('.pc', a); if (pc) pc.textContent = progress(sk).pct + '%'; } });
}

document.addEventListener('change', e => {
  if (e.target && e.target.id === 'skillpick') location.hash = '#/skill/' + encodeURIComponent(e.target.value);
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.matches && t.matches('textarea[data-memo]')) { const m = store.get('memo', {}); m[t.dataset.memo] = t.value; store.set('memo', m); }
});

/* 검색 입력 */
let timer = null;
function goSearch(q) {
  q = q.trim();
  if (q) location.hash = '#/search/' + encodeURIComponent(q);
  else if (location.hash.startsWith('#/search')) location.hash = '#/';
}
document.addEventListener('DOMContentLoaded', () => {
  const form = $('#searchForm'); const q = $('#q');
  form.addEventListener('submit', e => { e.preventDefault(); clearTimeout(timer); goSearch(q.value); });
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => goSearch(q.value), 350); });
  $('#themeBtn').addEventListener('click', () => {
    const root = document.documentElement; const cur = root.getAttribute('data-theme');
    const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark'; root.setAttribute('data-theme', next); store.set('theme', next);
  });
});

/* ================= 시작 ================= */
async function init() {
  try { await loadData(); }
  catch (e) { console.error(e); renderError(e); return; }
  window.addEventListener('hashchange', route);
  await route();
  checkFilePaths();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
