'use strict';

// ========== STATE ==========
let transactions = [];
let errors = [];
let flows = [];
let tables = [];
let favorites = new Set(JSON.parse(localStorage.getItem('sap-nav-favorites') || '[]'));

// ========== TAB ICONS (SVG strings reused for JS-generated empty states) ==========
const TAB_ICON = {
  find:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.5" y1="15.5" x2="20" y2="20"/><line x1="7.5" y1="9" x2="13.5" y2="9"/><line x1="7.5" y1="11.5" x2="13.5" y2="11.5"/><line x1="7.5" y1="14" x2="11" y2="14"/></svg>`,
  tables: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/></svg>`,
  decode: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 12 6 12 9 4 15 20 18 12 22 12"/></svg>`,
  flows:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><line x1="7.2" y1="10.9" x2="16.6" y2="7.1"/><line x1="7.2" y1="13.1" x2="16.6" y2="16.9"/></svg>`
};

// ========== DATA LOADING ==========
async function loadData() {
  const [txRes, errRes, flowRes, tableRes] = await Promise.all([
    fetch('data/transactions.json'),
    fetch('data/errors.json'),
    fetch('data/flows.json'),
    fetch('data/tables.json')
  ]);
  [transactions, errors, flows, tables] = await Promise.all([
    txRes.json(), errRes.json(), flowRes.json(), tableRes.json()
  ]);
}

// ========== FAVORITES ==========
function saveFavorites() {
  localStorage.setItem('sap-nav-favorites', JSON.stringify([...favorites]));
}

function toggleFavorite(flowId, btn) {
  if (favorites.has(flowId)) {
    favorites.delete(flowId);
  } else {
    favorites.add(flowId);
  }
  saveFavorites();
  renderFlows();
}

// ========== INTENT DETECTION ==========
const INTENT_MAP = {
  display: ['display', 'show', 'view', 'check', 'see', 'look', 'read', 'find', 'open'],
  create:  ['create', 'new', 'add', 'make', 'raise', 'enter', 'generate', 'post'],
  change:  ['change', 'edit', 'modify', 'update', 'maintain', 'correct', 'fix', 'adjust'],
  run:     ['run', 'execute', 'trigger', 'start', 'process', 'test', 'activate', 'schedule']
};

function detectIntent(query) {
  const q = ' ' + query.toLowerCase() + ' ';
  for (const [intent, verbs] of Object.entries(INTENT_MAP)) {
    if (verbs.some(v => q.includes(' ' + v + ' ') || q.startsWith(v + ' '))) return intent;
  }
  return null;
}

function txIntent(tx) {
  const n = tx.name.toLowerCase();
  if (n.startsWith('display') || n.startsWith('show')) return 'display';
  if (n.startsWith('create')) return 'create';
  if (n.startsWith('change') || n.startsWith('maintain') || n.startsWith('post') || n.startsWith('enter')) return 'change';
  if (n.startsWith('run') || n.startsWith('execute') || n.startsWith('activate')) return 'run';
  return null;
}

// ========== SYNONYM EXPANSION ==========
const SYNONYMS = {
  'gl':  ['general ledger', 'g/l', 'ledger'],
  'ap':  ['accounts payable', 'vendor payment', 'vendor invoice'],
  'ar':  ['accounts receivable', 'customer payment', 'customer invoice'],
  'fi':  ['finance', 'financial accounting', 'financial'],
  'co':  ['controlling', 'cost center', 'cost accounting'],
  'mm':  ['materials management', 'materials', 'procurement', 'purchasing'],
  'sd':  ['sales distribution', 'sales', 'order management', 'sales order'],
  'hr':  ['human resources', 'personnel', 'payroll', 'hcm', 'human capital'],
  'hcm': ['human capital management', 'human resources', 'hr', 'personnel'],
  'wm':  ['warehouse management', 'warehouse', 'stock management'],
  'ewm': ['extended warehouse management', 'warehouse'],
  'pm':  ['plant maintenance', 'maintenance order', 'equipment'],
  'pp':  ['production planning', 'production order', 'manufacturing'],
  'bc':  ['basis', 'system administration', 'technical'],
  'po':  ['purchase order', 'purchasing'],
  'gr':  ['goods receipt', 'goods movement', 'migo'],
  'gi':  ['goods issue', 'goods movement'],
  'iv':  ['invoice verification', 'vendor invoice', 'miro'],
  'fb':  ['financial document', 'finance posting'],
  'me':  ['purchasing', 'procurement', 'purchase order'],
  'se':  ['abap', 'development', 'technical'],
  'sm':  ['system', 'basis', 'technical', 'administration'],
  'su':  ['user', 'security', 'authorization', 'roles'],
  'pfcg': ['role maintenance', 'authorization roles', 'security'],
  'su01': ['user maintenance', 'user administration'],
  'general ledger': ['gl', 'g/l'],
  'accounts payable': ['ap'],
  'accounts receivable': ['ar'],
  'purchase order': ['po'],
  'goods receipt': ['gr'],
  'goods issue': ['gi'],
  'vendor': ['ap', 'supplier', 'accounts payable'],
  'customer': ['ar', 'accounts receivable'],
  'invoice': ['iv', 'billing', 'miro'],
  'payroll': ['hr', 'hcm', 'pc00'],
  'authorization': ['su', 'security', 'role', 'pfcg'],
  'role': ['authorization', 'pfcg', 'security'],
  'transport': ['stms', 'change request', 'workbench'],
  'batch job': ['sm36', 'sm37', 'background processing', 'job'],
  'background': ['batch', 'sm36', 'sm37'],
  'workflow': ['swi', 'business workflow'],
  'material': ['mm', 'materials management', 'stock'],
  'stock': ['mm', 'inventory', 'warehouse', 'wm'],
  'cost center': ['co', 'controlling', 'ksh'],
  'profit center': ['co', 'controlling', 'ke'],
};

function expandQuery(q) {
  const terms = new Set([q]);
  const words = q.split(/\s+/);
  // Single word synonyms
  for (const w of words) {
    if (SYNONYMS[w]) SYNONYMS[w].forEach(s => terms.add(s));
  }
  // Multi-word phrase synonyms (check 2–3 word slices)
  for (let i = 0; i < words.length; i++) {
    const phrase2 = words.slice(i, i + 2).join(' ');
    const phrase3 = words.slice(i, i + 3).join(' ');
    if (SYNONYMS[phrase2]) SYNONYMS[phrase2].forEach(s => terms.add(s));
    if (SYNONYMS[phrase3]) SYNONYMS[phrase3].forEach(s => terms.add(s));
  }
  return [...terms];
}

// ========== STEMMING ==========
function stem(word) {
  const w = word.toLowerCase();
  if (w.length < 5) return w;
  if (w.endsWith('ing')) return w.slice(0, -3);
  if (w.endsWith('ings')) return w.slice(0, -4);
  if (w.endsWith('tion')) return w.slice(0, -4);
  if (w.endsWith('tions')) return w.slice(0, -5);
  if (w.endsWith('ment')) return w.slice(0, -4);
  if (w.endsWith('ments')) return w.slice(0, -5);
  if (w.endsWith('ness')) return w.slice(0, -4);
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.endsWith('ied')) return w.slice(0, -3) + 'y';
  if (w.endsWith('ed')) return w.slice(0, -2);
  if (w.endsWith('er')) return w.slice(0, -2);
  if (w.endsWith('ers')) return w.slice(0, -3);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function stemWords(words) {
  return words.map(stem);
}

// ========== FUZZY TYPO CORRECTION ==========
// Damerau–Levenshtein (counts transpositions as 1 edit, not 2)
// e.g. "dispaly" → "display" = 1, "purcahse" → "purchase" = 1
function levenshtein(a, b, maxDist) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > maxDist) return maxDist + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;
  // Three rotating row buffers — avoids 2D array allocation
  const r0 = new Uint8Array(lb + 1);
  const r1 = new Uint8Array(lb + 1);
  const r2 = new Uint8Array(lb + 1);
  for (let j = 0; j <= lb; j++) r1[j] = j;
  let pr0 = r0, pr1 = r1, pr2 = r2;
  for (let i = 1; i <= la; i++) {
    pr2[0] = i;
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      pr2[j] = Math.min(pr1[j] + 1, pr2[j - 1] + 1, pr1[j - 1] + cost);
      // Transposition check (Damerau extension)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        pr2[j] = Math.min(pr2[j], pr0[j - 2] + 1);
      if (pr2[j] < rowMin) rowMin = pr2[j];
    }
    if (rowMin > maxDist) return maxDist + 1; // early exit — can't improve
    const tmp = pr0; pr0 = pr1; pr1 = pr2; pr2 = tmp; // rotate
  }
  return pr1[lb];
}

let txVocab = null; // flat array of index keys — built once for fuzzy scan

function correctTypos(query) {
  if (!txVocab) return query;
  const words = query.toLowerCase().split(/\s+/);
  let changed = false;
  const out = words.map(w => {
    if (w.length < 5) return w;                  // too short to safely auto-correct
    if (txIndex && txIndex.has(w)) return w;     // exact vocabulary hit — already correct
    const maxDist = w.length >= 8 ? 2 : 1;      // allow 2 edits for longer words
    let best = null, bestDist = maxDist + 1;
    for (const token of txVocab) {
      if (Math.abs(token.length - w.length) > maxDist) continue; // fast length gate
      const d = levenshtein(w, token, maxDist);
      if (d > 0 && d < bestDist) { bestDist = d; best = token; }
    }
    if (best) { changed = true; return best; }
    return w;
  });
  return changed ? out.join(' ') : query;
}

// ========== INVERTED TOKEN INDEX ==========
let txIndex = null; // Map<stemmed-token, Set<txIdx>>

function buildTxIndex() {
  txIndex = new Map();
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const tokens = new Set();
    // Tokenize all searchable fields
    const fields = [
      tx.code.toLowerCase(),
      tx.name.toLowerCase(),
      tx.description.toLowerCase(),
      tx.category.toLowerCase(),
      ...(tx.tags || []).map(t => t.toLowerCase())
    ];
    for (const field of fields) {
      for (const raw of field.split(/\s+|[-/]/)) {
        if (raw.length < 2) continue;
        tokens.add(raw);
        tokens.add(stem(raw));
      }
    }
    for (const token of tokens) {
      if (!txIndex.has(token)) txIndex.set(token, new Set());
      txIndex.get(token).add(i);
    }
  }
}

function txCandidates(query) {
  if (!txIndex) return transactions.map((_, i) => i);
  // Allow single-char words (e.g. typing "S" for a code prefix)
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return [];
  const stemmed = stemWords(words);

  // Expand synonyms into additional tokens
  const allTerms = new Set([...words, ...stemmed]);
  for (const w of words) {
    if (SYNONYMS[w]) SYNONYMS[w].forEach(s => {
      s.split(/\s+/).forEach(t => { allTerms.add(t); allTerms.add(stem(t)); });
    });
  }

  const candidates = new Set();

  for (const term of allTerms) {
    // 1. Exact index lookup — fast O(1)
    const exact = txIndex.get(term);
    if (exact) { exact.forEach(idx => candidates.add(idx)); continue; }

    // 2. Prefix scan — handles partial codes ("SU0" → finds "su01")
    //    and truncated words ("purcha" → finds "purchase")
    //    Only for terms >= 2 chars to avoid scanning the whole index on "a"
    if (term.length >= 2) {
      for (const [token, indices] of txIndex) {
        if (token.startsWith(term)) indices.forEach(idx => candidates.add(idx));
      }
    }
  }

  // 3. Full fallback — handles single-char code prefixes ("S", "M", …)
  //    Scoring will rank correctly; this just ensures nothing is gated out
  return candidates.size > 0 ? [...candidates] : transactions.map((_, i) => i);
}

// ========== SEARCH SCORING ==========
function scoreTransaction(tx, query) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/);
  const stemmedWords = stemWords(words);
  const expanded = expandQuery(q); // includes synonyms
  let score = 0;

  const codeL = tx.code.toLowerCase();
  const nameL = tx.name.toLowerCase();
  const descL = tx.description.toLowerCase();
  const tagsL = tx.tags.map(t => t.toLowerCase());
  const catL = tx.category.toLowerCase();

  // Exact code match
  if (codeL === q) score += 100;
  else if (codeL.includes(q)) score += 60;

  // Intent alignment bonus — boosts display/create/change transaction when query verb matches
  const qi = detectIntent(query);
  const ti = txIntent(tx);
  if (qi && ti && qi === ti) score += 28;

  // Synonym/expanded query matches (scored lower than direct to avoid noise)
  for (const exp of expanded) {
    if (exp === q) continue; // already scored above
    if (nameL.includes(exp)) score += 12;
    if (catL.includes(exp)) score += 8;
    for (const tag of tagsL) {
      if (tag === exp) score += 22;
      else if (tag.includes(exp) && exp.length > 3) score += 10;
    }
  }

  // Longest matching tag phrase (multi-word tags are high quality signals)
  for (const tag of tagsL) {
    if (q === tag) score += 50;
    else if (q.includes(tag) && tag.length > 4) score += 30;
    else if (tag.includes(q) && q.length > 4) score += 20;
  }

  // Each word match (original + stemmed)
  const allWords = [...new Set([...words, ...stemmedWords])];
  for (const w of allWords) {
    if (w.length < 2) continue;
    if (nameL.includes(w)) score += 20;
    if (descL.includes(w)) score += 6;
    if (catL.includes(w)) score += 10;
    for (const tag of tagsL) {
      if (tag === w) score += 30;
      else if (tag.includes(w) && w.length > 3) score += 14;
    }
  }

  // Full query in name
  if (nameL.includes(q)) score += 18;

  return score;
}

function matchReason(tx, query) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter(w => w.length > 2);
  const codeL = tx.code.toLowerCase();
  const tagsL = tx.tags.map(t => t.toLowerCase());
  const nameL = tx.name.toLowerCase();

  // Direct code match
  if (codeL === q) return `Exact match for transaction code ${tx.code}.`;
  if (codeL.includes(q) || q.includes(codeL)) return `Transaction code "${tx.code}" matches your query.`;

  // Intent + transaction name alignment
  const qi = detectIntent(query);
  const ti = txIntent(tx);
  if (qi && ti && qi === ti) {
    const verb = qi.charAt(0).toUpperCase() + qi.slice(1);
    return `${verb}-mode transaction — matches your intent in ${tx.category}.`;
  }

  // Best multi-word tag phrase match (longest wins)
  let bestTag = '';
  for (const tag of tagsL) {
    if (q.includes(tag) && tag.length > bestTag.length) bestTag = tag;
  }
  if (bestTag.length > 4) return `Phrase match on "${bestTag}" — ${tx.name} covers this directly.`;

  // Exact single-word tag hits
  for (const w of words) {
    for (const tag of tagsL) {
      if (tag === w) return `Keyword "${w}" is a direct tag in ${tx.category}.`;
    }
  }

  // Partial tag match — find the most descriptive tag hit
  for (const w of words) {
    for (const tag of tagsL) {
      if (tag.includes(w) && w.length > 3) return `Keyword "${w}" matched tag "${tag}" in ${tx.category}.`;
    }
  }

  // Category word match
  const catL = tx.category.toLowerCase();
  for (const w of words) {
    if (catL.includes(w)) return `Relevant in ${tx.category} for this query.`;
  }

  if (nameL.includes(q)) return `Transaction name contains "${q}".`;
  return `Likely starting point in ${tx.category} for "${query}".`;
}

function findTransactions(query) {
  if (!query.trim()) return [];
  const candidateIdxs = txCandidates(query);
  const scored = candidateIdxs
    .map(i => ({ tx: transactions[i], score: scoreTransaction(transactions[i], query) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored;
}

// Fill a search input and fire its input event (used by "Did you mean?" links)
function fillSearch(inputId, value) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
}

// Build a "Did you mean / Showing results for" snippet
function correctionHint(original, corrected, inputId) {
  if (!corrected || corrected === original) return '';
  return `<div class="search-correction">
    Did you mean <a class="search-correction-link" href="#" onclick="fillSearch('${inputId}','${escHtml(corrected)}');return false;">${escHtml(corrected)}</a>?
  </div>`;
}
function correctionBanner(original, corrected, inputId) {
  if (!corrected || corrected === original) return '';
  return `<div class="search-correction search-correction--banner">
    Showing results for <strong>${escHtml(corrected)}</strong>
    &nbsp;·&nbsp;
    <a class="search-correction-link" href="#" onclick="fillSearch('${inputId}','${escHtml(original)}');return false;">search instead for "${escHtml(original)}"</a>
  </div>`;
}

// ========== PINNED RESULT STATE ==========
let findPinnedCode   = null;
let tablePinnedName  = null;

function pinFindResult(code) {
  findPinnedCode = code;
  renderFind(document.getElementById('find-input').value);
}

function pinTableResult(name) {
  tablePinnedName = name;
  renderTables(document.getElementById('tables-input').value);
}

// ========== FIND TAB ==========
function renderFind(query) {
  document.getElementById('find-input').closest('.search-wrap').classList.remove('searching');
  const resultsEl = document.getElementById('find-results');
  const emptyEl = document.getElementById('find-empty');
  const clearBtn = document.getElementById('find-clear');

  clearBtn.classList.toggle('visible', query.length > 0);

  if (!query.trim()) {
    resultsEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  const corrected = correctTypos(query);
  const scored = findTransactions(corrected);
  emptyEl.classList.add('hidden');

  if (scored.length === 0) {
    resultsEl.innerHTML = `
      <div class="tab-empty">
        <div class="tab-empty-icon">${TAB_ICON.find}</div>
        <div class="tab-empty-title">No results found</div>
        <div class="tab-empty-desc">Try a different keyword, enter a transaction code directly, or rephrase the task.</div>
        ${correctionHint(query, corrected, 'find-input')}
      </div>`;
    return;
  }

  // Determine which result is promoted to "best"
  let bestIdx = 0;
  if (findPinnedCode) {
    const idx = scored.findIndex(r => r.tx.code === findPinnedCode);
    if (idx > 0) bestIdx = idx;
  }

  const best = scored[bestIdx];
  const origTopCode = scored[0].tx.code;
  const related = scored.filter((_, i) => i !== bestIdx).slice(0, 6);

  let html = correctionBanner(query, corrected, 'find-input');
  html += `<div class="results-section">
    <div class="results-label">Best starting point</div>
    ${renderBestCard(best.tx, matchReason(best.tx, corrected))}
  </div>`;

  if (related.length > 0) {
    html += `<div class="results-section">
      <div class="results-label">Related transactions</div>
      <div class="cards-grid">
        ${related.map(r => renderTxCard(r.tx, matchReason(r.tx, query), bestIdx !== 0 && r.tx.code === origTopCode)).join('')}
      </div>
    </div>`;
  }

  resultsEl.innerHTML = html;
}

function findRelatedFlowForTx(tx) {
  if (tx.relatedFlow) return flows.find(f => f.id === tx.relatedFlow) || null;
  const codeL = tx.code.toLowerCase();
  return flows.find(f =>
    f.startingTransaction === tx.code ||
    f.tags.some(t => t.toLowerCase() === codeL)
  ) || null;
}

function quickFind(code) {
  const findInput = document.getElementById('find-input');
  findInput.value = code;
  renderFind(code);
  switchTab('find');
  findInput.focus();
}

function renderBestCard(tx, reason) {
  const seeAlsoCodes = tx.seeAlso || [];
  const seeAlsoTxs = seeAlsoCodes.map(c => transactions.find(t => t.code === c)).filter(Boolean);
  const relatedFlow = findRelatedFlowForTx(tx);

  let extras = '';

  if (seeAlsoTxs.length > 0) {
    const chips = seeAlsoTxs.map(t =>
      `<button class="seealso-chip" onclick="quickFind('${escHtml(t.code)}')" title="${escHtml(t.description)}">${escHtml(t.code)} <span class="seealso-chip-name">${escHtml(t.name)}</span></button>`
    ).join('');
    extras += `<div class="see-also"><span class="see-also-label">Also see:</span><div class="see-also-chips">${chips}</div></div>`;
  }

  if (relatedFlow) {
    extras += `<div class="related-flow-hint">
      <button class="flow-link-btn" onclick="openFlowModal('${escHtml(relatedFlow.id)}')">
        → Related troubleshooting flow: ${escHtml(relatedFlow.title)}
      </button>
    </div>`;
  }

  return `
  <div class="best-card">
    <div class="best-badge">★ Best Starting Point</div>
    <div class="card-header">
      <div class="code-copy-row">
        <div class="card-code">${escHtml(tx.code)}</div>
        ${COPY_BTN(tx.code)}
      </div>
      ${tx.category ? `<span class="card-cat-badge">${escHtml(tx.category)}</span>` : ''}
    </div>
    <div class="card-name">${escHtml(tx.name)}</div>
    <div class="card-desc">${escHtml(tx.description)}</div>
    <div class="card-reason">${escHtml(reason)}</div>
    ${extras}
    ${tx.report ? `<div class="card-footer"><span class="card-report">Report: ${escHtml(tx.report)}</span></div>` : ''}
  </div>`;
}

function renderTxCard(tx, reason, isOrigTop = false) {
  const hasFooter = tx.report || tx.category;
  return `
  <div class="tx-card clickable-card" tabindex="0" data-nav-card onclick="pinFindResult('${escHtml(tx.code)}')">
    ${isOrigTop ? '<div class="orig-top-tag">★ Top pick</div>' : ''}
    <div class="code-copy-row">
      <div class="card-code">${escHtml(tx.code)}</div>
      ${COPY_BTN(tx.code)}
    </div>
    <div class="card-name">${escHtml(tx.name)}</div>
    <div class="card-desc">${escHtml(tx.description)}</div>
    ${reason ? `<div class="card-reason">${escHtml(reason)}</div>` : ''}
    ${hasFooter ? `
    <div class="card-footer">
      <span class="card-report">${tx.report ? escHtml(tx.report) : ''}</span>
      <span class="card-cat-tag">${tx.category ? escHtml(tx.category) : ''}</span>
    </div>` : ''}
  </div>`;
}

// ========== TABLES TAB ==========
function scoreTable(tbl, query) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/);
  const stemmedWords = stemWords(words);
  const allWords = [...new Set([...words, ...stemmedWords])];
  const expanded = expandQuery(q);
  let score = 0;

  const nameL = tbl.name.toLowerCase();
  const titleL = tbl.title.toLowerCase();
  const descL = tbl.description.toLowerCase();
  const tagsL = tbl.tags.map(t => t.toLowerCase());
  const moduleL = tbl.module.toLowerCase();

  // Exact table name match
  if (nameL === q) score += 120;
  else if (nameL.startsWith(q)) score += 70;
  else if (nameL.includes(q)) score += 40;

  // Key field match
  if (tbl.keyFields && tbl.keyFields.some(f => f.toLowerCase() === q)) score += 50;

  // Tag matches
  for (const tag of tagsL) {
    if (q === tag) score += 55;
    else if (q.includes(tag) && tag.length > 3) score += 28;
    else if (tag.includes(q) && q.length > 3) score += 18;
  }

  // Synonym/expanded query matches
  for (const exp of expanded) {
    if (exp === q) continue;
    if (titleL.includes(exp)) score += 14;
    if (moduleL.includes(exp)) score += 8;
    for (const tag of tagsL) {
      if (tag === exp) score += 22;
      else if (tag.includes(exp) && exp.length > 3) score += 10;
    }
  }

  // Word-level matches (original + stemmed)
  for (const w of allWords) {
    if (w.length < 2) continue;
    if (nameL.includes(w)) score += 30;
    if (titleL.includes(w)) score += 20;
    if (descL.includes(w)) score += 6;
    if (moduleL.includes(w)) score += 8;
    for (const tag of tagsL) {
      if (tag === w) score += 30;
      else if (tag.includes(w) && w.length > 3) score += 12;
    }
  }

  // Full query in title
  if (titleL.includes(q)) score += 20;

  return score;
}

function matchTableReason(tbl, query) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter(w => w.length > 2);
  const nameL = tbl.name.toLowerCase();
  const tagsL = tbl.tags.map(t => t.toLowerCase());
  const titleL = tbl.title.toLowerCase();

  if (nameL === q) return `Exact match for table ${tbl.name}.`;
  if (nameL.startsWith(q) || nameL.includes(q)) return `Table name "${tbl.name}" matches your query.`;

  let bestTag = '';
  for (const tag of tagsL) {
    if (q.includes(tag) && tag.length > bestTag.length) bestTag = tag;
  }
  if (bestTag.length > 3) return `Phrase match on "${bestTag}" — ${tbl.name} covers this directly.`;

  for (const w of words) {
    for (const tag of tagsL) {
      if (tag === w) return `Keyword "${w}" is a direct tag — ${tbl.name} in ${tbl.module}.`;
    }
  }

  for (const w of words) {
    if (titleL.includes(w)) return `Table title matches "${w}" — ${tbl.title}.`;
  }

  return `Relevant table in ${tbl.module} for "${query}".`;
}

function findTables(query) {
  if (!query.trim()) return [];
  return tables
    .map(tbl => ({ tbl, score: scoreTable(tbl, query) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

function quickTableFind(name) {
  const tablesInput = document.getElementById('tables-input');
  tablesInput.value = name;
  renderTables(name);
  switchTab('tables');
  tablesInput.focus();
}

function renderBestTableCard(tbl, reason) {
  const seeAlso = (tbl.seeAlso || []).slice(0, 6);
  const keyFields = tbl.keyFields || [];

  let keyHtml = '';
  if (keyFields.length > 0) {
    keyHtml = `<div class="table-key-fields">
      <span class="table-key-label">Key fields:</span>
      ${keyFields.map(f => `<span class="table-key-chip">${escHtml(f)}</span>`).join('')}
    </div>`;
  }

  let seeAlsoHtml = '';
  if (seeAlso.length > 0) {
    seeAlsoHtml = `<div class="table-see-also">
      <span class="table-see-also-label">See also:</span>
      <div class="table-see-also-chips">
        ${seeAlso.map(name =>
          `<button class="table-chip" onclick="quickTableFind('${escHtml(name)}')">${escHtml(name)}</button>`
        ).join('')}
      </div>
    </div>`;
  }

  return `
  <div class="table-best-card">
    <div class="best-badge">★ Best Match</div>
    <div class="card-header">
      <div class="code-copy-row">
        <div class="table-name">${escHtml(tbl.name)}</div>
        ${COPY_BTN(tbl.name)}
      </div>
      ${tbl.module ? `<span class="table-module-tag">${escHtml(tbl.module)}</span>` : ''}
    </div>
    <div class="table-title">${escHtml(tbl.title)}</div>
    <div class="table-desc">${escHtml(tbl.description)}</div>
    <div class="card-reason">${escHtml(reason)}</div>
    ${keyHtml}
    ${seeAlsoHtml}
  </div>`;
}

function renderTableCard(tbl, reason, isOrigTop = false) {
  const keyFields = (tbl.keyFields || []).slice(0, 4);
  return `
  <div class="table-card clickable-card" tabindex="0" data-nav-card onclick="pinTableResult('${escHtml(tbl.name)}')">
    ${isOrigTop ? '<div class="orig-top-tag">★ Top pick</div>' : ''}
    <div class="card-header">
      <div class="code-copy-row">
        <div class="table-name" style="font-size:15px">${escHtml(tbl.name)}</div>
        ${COPY_BTN(tbl.name)}
      </div>
      ${tbl.module ? `<span class="table-module-tag">${escHtml(tbl.module)}</span>` : ''}
    </div>
    <div class="table-title" style="font-size:13px">${escHtml(tbl.title)}</div>
    <div class="table-desc" style="font-size:12.5px;margin-bottom:6px">${escHtml(tbl.description)}</div>
    ${reason ? `<div class="card-reason" style="font-size:12px">${escHtml(reason)}</div>` : ''}
    ${keyFields.length > 0 ? `
    <div class="table-key-fields">
      <span class="table-key-label">Keys:</span>
      ${keyFields.map(f => `<span class="table-key-chip">${escHtml(f)}</span>`).join('')}
    </div>` : ''}
  </div>`;
}

function renderTables(query) {
  document.getElementById('tables-input').closest('.search-wrap').classList.remove('searching');
  const resultsEl = document.getElementById('tables-results');
  const emptyEl = document.getElementById('tables-empty');
  const clearBtn = document.getElementById('tables-clear');

  clearBtn.classList.toggle('visible', query.length > 0);

  if (!query.trim()) {
    resultsEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  const corrected = correctTypos(query);
  const scored = findTables(corrected);
  emptyEl.classList.add('hidden');

  if (scored.length === 0) {
    resultsEl.innerHTML = `
      <div class="tab-empty">
        <div class="tab-empty-icon">${TAB_ICON.tables}</div>
        <div class="tab-empty-title">No tables found</div>
        <div class="tab-empty-desc">Try a table name like BKPF, or describe the data — e.g. "vendor", "purchase order", "cost center".</div>
        ${correctionHint(query, corrected, 'tables-input')}
      </div>`;
    return;
  }

  // Determine which result is promoted to "best"
  let bestIdx = 0;
  if (tablePinnedName) {
    const idx = scored.findIndex(r => r.tbl.name === tablePinnedName);
    if (idx > 0) bestIdx = idx;
  }

  const best = scored[bestIdx];
  const origTopName = scored[0].tbl.name;
  const related = scored.filter((_, i) => i !== bestIdx).slice(0, 6);

  let html = correctionBanner(query, corrected, 'tables-input');
  html += `<div class="results-section">
    <div class="results-label">Best match</div>
    ${renderBestTableCard(best.tbl, matchTableReason(best.tbl, corrected))}
  </div>`;

  if (related.length > 0) {
    html += `<div class="results-section">
      <div class="results-label">Related tables</div>
      <div class="cards-grid">
        ${related.map(r => renderTableCard(r.tbl, matchTableReason(r.tbl, corrected), bestIdx !== 0 && r.tbl.name === origTopName)).join('')}
      </div>
    </div>`;
  }

  resultsEl.innerHTML = html;
}

// ========== DECODE TAB ==========
function scoreError(err, query) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/);
  const stemmedWords = stemWords(words);
  const allWords = [...new Set([...words, ...stemmedWords])];
  const expanded = expandQuery(q);
  let score = 0;
  const titleL = err.title.toLowerCase();
  const descL = err.description.toLowerCase();

  for (const pat of err.pattern) {
    const patL = pat.toLowerCase();
    if (patL === q) score += 100;
    else if (q.includes(patL)) score += 80;
    else if (patL.includes(q)) score += 50;
    for (const w of allWords) {
      if (w.length < 3) continue;
      if (patL.includes(w)) score += 20;
    }
    for (const exp of expanded) {
      if (exp === q) continue;
      if (patL.includes(exp)) score += 12;
    }
  }
  // Title matches
  if (titleL === q) score += 80;
  else if (titleL.includes(q)) score += 40;
  for (const w of allWords) {
    if (w.length < 3) continue;
    if (titleL.includes(w)) score += 15;
    if (descL.includes(w)) score += 6;
  }
  for (const exp of expanded) {
    if (exp === q) continue;
    if (titleL.includes(exp)) score += 10;
  }
  return score;
}

function findErrors(query) {
  if (!query.trim()) return [];
  return errors
    .map(e => ({ err: e, score: scoreError(e, query) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

function categoryClass(cat) {
  const c = cat.toLowerCase();
  if (c.includes('security') || c.includes('auth')) return 'security';
  if (c.includes('transport')) return 'transport';
  if (c.includes('connect') || c.includes('service')) return 'connectivity';
  if (c.includes('system') || c.includes('admin')) return 'system';
  if (c.includes('hr') || c.includes('time')) return 'hr';
  if (c.includes('workflow')) return 'workflow';
  if (c.includes('material')) return 'materials';
  if (c.includes('control')) return 'controlling';
  return 'system';
}

function renderDecode(query) {
  document.getElementById('decode-input').closest('.search-wrap').classList.remove('searching');
  const resultsEl = document.getElementById('decode-results');
  const emptyEl = document.getElementById('decode-empty');
  const clearBtn = document.getElementById('decode-clear');

  clearBtn.classList.toggle('visible', query.length > 0);

  if (!query.trim()) {
    resultsEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  const corrected = correctTypos(query);
  const matched = findErrors(corrected);
  emptyEl.classList.add('hidden');

  if (matched.length === 0) {
    resultsEl.innerHTML = `
      <div class="tab-empty">
        <div class="tab-empty-icon">${TAB_ICON.decode}</div>
        <div class="tab-empty-title">No matches found</div>
        <div class="tab-empty-desc">Try describing the symptom differently — e.g. "user has no access", "service 404", "job failed".</div>
        ${correctionHint(query, corrected, 'decode-input')}
      </div>`;
    return;
  }

  let html = correctionBanner(query, corrected, 'decode-input');

  const top = matched.slice(0, 3);

  for (const [idx, { err }] of top.entries()) {
    const primaryTx = transactions.find(t => t.code === err.primaryTransaction);
    const relatedTxs = (err.relatedTransactions || [])
      .map(code => transactions.find(t => t.code === code))
      .filter(Boolean);
    const linkedFlow = err.linkedFlow ? flows.find(f => f.id === err.linkedFlow) : null;
    const catClass = categoryClass(err.category);
    const cardId = `dc-${idx}`;

    // Build the collapsible detail section
    let detail = '';
    if (err.steps && err.steps.length) {
      detail += `<div class="decode-steps">
        <div class="decode-steps-label">Troubleshooting steps</div>
        <ul class="step-list">
          ${err.steps.map((s, i) => `
            <li class="step-item">
              <span class="step-num">${i + 1}</span>
              <span>${escHtml(s)}</span>
            </li>`).join('')}
        </ul>
      </div>`;
    }
    if (relatedTxs.length) {
      detail += `<div class="decode-related">
        <div class="decode-steps-label">Related transactions</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
          ${relatedTxs.map(t => `<span class="flow-tx-badge" title="${escHtml(t.name)}">${escHtml(t.code)}</span>`).join('')}
        </div>
      </div>`;
    }
    if (linkedFlow) {
      detail += `<div class="decode-flow-link">
        <button class="flow-link-btn" onclick="openFlowModal('${linkedFlow.id}')">
          → View full troubleshooting flow: ${escHtml(linkedFlow.title)}
        </button>
      </div>`;
    }

    const hasDetail = detail.length > 0;

    html += `<div class="decode-card" id="${cardId}" tabindex="0" data-nav-card>
      <div class="decode-summary"${hasDetail ? ` onclick="toggleDecodeCard('${cardId}')"` : ''}>
        <div class="decode-header">
          <div class="decode-title">${escHtml(err.title)}</div>
          <span class="category-badge ${catClass}">${escHtml(err.category)}</span>
        </div>
        <div class="decode-desc">${escHtml(err.description)}</div>
        ${primaryTx ? `<div class="decode-primary">
          <span class="decode-primary-label">Start here</span>
          <span class="decode-primary-code">${escHtml(primaryTx.code)}</span>
          <span class="decode-primary-name">${escHtml(primaryTx.name)}</span>
        </div>` : ''}
        ${hasDetail ? `<div class="decode-toggle">
          <span class="decode-toggle-label">Show steps</span>
          <svg class="decode-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
        </div>` : ''}
      </div>
      ${hasDetail ? `<div class="decode-detail">${detail}</div>` : ''}
    </div>`;
  }

  resultsEl.innerHTML = html;
}

function toggleDecodeCard(id) {
  const card = document.getElementById(id);
  if (!card) return;
  const isOpen = card.classList.toggle('is-open');
  const label = card.querySelector('.decode-toggle-label');
  if (label) label.textContent = isOpen ? 'Hide steps' : 'Show steps';
}

// ========== FLOWS TAB ==========
let activeModule = '';
let activeFlowSearch = '';

function scoreFlow(flow, query) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/);
  const stemmedWords = stemWords(words);
  const allWords = [...new Set([...words, ...stemmedWords])];
  const expanded = expandQuery(q);
  let score = 0;

  const titleL = flow.title.toLowerCase();
  const descL = flow.description.toLowerCase();
  const moduleL = (flow.module || flow.category || '').toLowerCase();
  const tagsL = (flow.tags || []).map(t => t.toLowerCase());
  const txL = (flow.startingTransaction || '').toLowerCase();

  // Exact title match
  if (titleL === q) score += 100;
  else if (titleL.includes(q)) score += 50;

  // Transaction code match
  if (txL === q) score += 80;
  else if (txL.includes(q)) score += 35;

  // Tag matches
  for (const tag of tagsL) {
    if (q === tag) score += 55;
    else if (q.includes(tag) && tag.length > 3) score += 28;
    else if (tag.includes(q) && q.length > 3) score += 18;
  }

  // Synonym/expanded query matches
  for (const exp of expanded) {
    if (exp === q) continue;
    if (titleL.includes(exp)) score += 16;
    if (moduleL.includes(exp)) score += 8;
    for (const tag of tagsL) {
      if (tag === exp) score += 22;
      else if (tag.includes(exp) && exp.length > 3) score += 10;
    }
  }

  // Word-level matches (original + stemmed)
  for (const w of allWords) {
    if (w.length < 2) continue;
    if (titleL.includes(w)) score += 22;
    if (descL.includes(w)) score += 7;
    if (moduleL.includes(w)) score += 10;
    if (txL.includes(w)) score += 15;
    for (const tag of tagsL) {
      if (tag === w) score += 30;
      else if (tag.includes(w) && w.length > 3) score += 12;
    }
  }

  // Step action/reason text (stemmed)
  if (flow.steps) {
    for (const step of flow.steps) {
      const actionL = (step.action || '').toLowerCase();
      const reasonL = (step.reason || '').toLowerCase();
      for (const w of allWords) {
        if (w.length < 3) continue;
        if (actionL.includes(w)) score += 4;
        if (reasonL.includes(w)) score += 2;
      }
    }
  }

  return score;
}

// Module display order
const MODULE_ORDER = ['Security', 'Transport', 'Finance', 'Logistics', 'HCM', 'Connectivity', 'Technical', 'Workflow'];
// Modules always visible as quick-filter chips (others go into "More")
const PINNED_MODULES = ['Security', 'Finance', 'Logistics', 'HCM', 'Technical', 'Transport', 'Connectivity'];

function getFlowModule(flow) {
  return flow.module || flow.category;
}

function setModuleFilter(mod) {
  activeModule = mod;
  renderFlows();
}

function renderFlows() {
  const flowsInput = document.getElementById('flows-input');
  if (flowsInput) flowsInput.closest('.search-wrap').classList.remove('searching');

  const container = document.getElementById('flows-container');
  if (!container) return;

  const clearBtn = document.getElementById('flows-clear');
  if (clearBtn) clearBtn.classList.toggle('visible', activeFlowSearch.length > 0);

  const allModules = [...new Set(flows.map(getFlowModule))];
  const orderedModules = [
    ...MODULE_ORDER.filter(m => allModules.includes(m)),
    ...allModules.filter(m => !MODULE_ORDER.includes(m)).sort()
  ];
  const byTitle = (a, b) => a.title.localeCompare(b.title);
  const isSaved = activeModule === '__favorites__';

  // ── Nav bar builder ──────────────────────────────────────────────
  function flowsNav(leftLabel, leftAction, centerText, contextDefault) {
    const leftBtn = leftAction
      ? `<button class="flows-nav-back" onclick="${leftAction}">${leftLabel}</button>`
      : `<span class="flows-nav-all">All</span>`;
    const savedCls = isSaved ? ' active' : '';
    return `<div class="flows-nav" data-context-default="${escHtml(contextDefault || '')}">
      <div class="flows-nav-left">${leftBtn}</div>
      <div class="flows-nav-center"><span id="flows-context-label" class="flows-nav-context">${escHtml(centerText)}</span></div>
      <div class="flows-nav-right"><button class="flows-nav-saved${savedCls}" onclick="setModuleFilter('__favorites__')">★ Saved</button></div>
    </div>`;
  }

  // ── Search mode ──────────────────────────────────────────────────
  if (activeFlowSearch.trim()) {
    const corrected = correctTypos(activeFlowSearch);
    const scored = flows
      .map(f => ({ f, score: scoreFlow(f, corrected) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score);
    const countLabel = scored.length === 0 ? 'No results' : `${scored.length} result${scored.length !== 1 ? 's' : ''}`;
    const nav = flowsNav('← Back', 'clearFlowSearch()', countLabel, countLabel);
    const hint = scored.length === 0 ? correctionHint(activeFlowSearch, corrected, 'flows-input') : '';
    const banner = scored.length > 0 ? correctionBanner(activeFlowSearch, corrected, 'flows-input') : '';
    container.innerHTML = nav + (scored.length === 0
      ? `<div class="tab-empty"><div class="tab-empty-icon">${TAB_ICON.flows}</div>
         <div class="tab-empty-title">No flows found</div>
         <div class="tab-empty-desc">Try a different keyword — e.g. "user access", "payment run", "goods receipt".</div>
         ${hint}</div>`
      : banner + `<div class="flows-overview-grid">${scored.map(r => renderFlowOverviewCard(r.f, true)).join('')}</div>`);
    return;
  }

  // ── Saved view ───────────────────────────────────────────────────
  if (isSaved) {
    const favFlows = [...flows.filter(f => favorites.has(f.id))].sort(byTitle);
    const nav = flowsNav('← Back', "setModuleFilter('')", 'Saved flows', 'Saved flows');
    container.innerHTML = nav + (favFlows.length > 0
      ? `<div class="flows-overview-grid">${favFlows.map(f => renderFlowOverviewCard(f, true)).join('')}</div>`
      : `<div class="tab-empty"><div class="tab-empty-icon">${TAB_ICON.flows}</div>
         <div class="tab-empty-title">No saved flows yet</div>
         <div class="tab-empty-desc">Star any flow to save it here for quick access.</div></div>`);
    return;
  }

  // ── Module drill-down ────────────────────────────────────────────
  if (activeModule) {
    const modFlows = [...flows.filter(f => getFlowModule(f) === activeModule)].sort(byTitle);
    const favInMod = modFlows.filter(f => favorites.has(f.id));
    const otherInMod = modFlows.filter(f => !favorites.has(f.id));
    const centerLabel = `${escHtml(activeModule)} · ${modFlows.length} flow${modFlows.length !== 1 ? 's' : ''}`;
    let html = flowsNav('← Back', "setModuleFilter('')", centerLabel, centerLabel);
    if (favInMod.length > 0) {
      html += `<div class="flows-section"><div class="flows-section-title">★ Saved</div>
        <div class="flows-overview-grid">${favInMod.map(f => renderFlowOverviewCard(f)).join('')}</div></div>`;
    }
    if (otherInMod.length > 0) {
      html += `<div class="flows-section">
        ${favInMod.length > 0 ? '<div class="flows-section-title">All flows</div>' : ''}
        <div class="flows-overview-grid">${otherInMod.map(f => renderFlowOverviewCard(f)).join('')}</div></div>`;
    }
    container.innerHTML = html;
    return;
  }

  // ── Overview (All) ───────────────────────────────────────────────
  let html = flowsNav(null, null, '', '');
  html += `<div class="flows-overview-grid">`;
  for (const m of orderedModules) {
    const mFlows = [...flows.filter(f => getFlowModule(f) === m)].sort(byTitle);
    if (mFlows.length === 0) continue;
    const preview = mFlows.slice(0, 3);
    html += `<div class="flows-overview-card" onclick="setModuleFilter('${escHtml(m)}')">
      <div class="flows-overview-header">
        <span class="flows-overview-name">${escHtml(m)}</span>
        <span class="flows-overview-count">${mFlows.length}</span>
      </div>
      <div class="flows-overview-list">
        ${preview.map(f => `<div class="flows-overview-item">${escHtml(f.title)}</div>`).join('')}
        ${mFlows.length > 3 ? `<div class="flows-overview-more">+${mFlows.length - 3} more</div>` : ''}
      </div>
    </div>`;
  }
  html += `</div>`;
  container.innerHTML = html;
}

function clearFlowSearch() {
  const input = document.getElementById('flows-input');
  if (input) input.value = '';
  activeFlowSearch = '';
  renderFlows();
}

function setFlowContextLabel(text) {
  const el = document.getElementById('flows-context-label');
  if (el) el.textContent = text;
}

function resetFlowContextLabel() {
  const nav = document.querySelector('.flows-nav');
  const el = document.getElementById('flows-context-label');
  if (nav && el) el.textContent = nav.dataset.contextDefault || '';
}

function renderFlowCard(flow, isFav) {
  const catClass = categoryClass(flow.category);
  return `
  <div class="flow-card ${isFav ? 'favorited' : ''}" onclick="openFlowModal('${flow.id}')">
    <div class="flow-card-header">
      <div class="flow-title">${escHtml(flow.title)}</div>
      <button class="fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${flow.id}', this)" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
        ${isFav ? '★' : '☆'}
      </button>
    </div>
    <div class="flow-desc">${escHtml(flow.description)}</div>
    <div class="flow-meta">
      <span class="flow-tx-badge">${escHtml(flow.startingTransaction)}</span>
      <span class="flow-steps-count">${flow.steps.length} steps</span>
      <span class="category-badge ${catClass}" style="font-size:10.5px;padding:2px 8px">${escHtml(flow.category)}</span>
    </div>
  </div>`;
}

// Compact overview card used inside drill-down, search, and saved views
function renderFlowOverviewCard(flow, searchMode = false) {
  const isFav = favorites.has(flow.id);
  const mod = getFlowModule(flow);
  const hoverAttrs = searchMode
    ? `onmouseenter="setFlowContextLabel('${escHtml(mod)}')" onmouseleave="resetFlowContextLabel()"`
    : '';
  return `<div class="flows-overview-card flows-overview-card--flow ${isFav ? 'is-fav' : ''}" tabindex="0" data-nav-card onclick="openFlowModal('${escHtml(flow.id)}')" ${hoverAttrs}>
    <div class="flows-overview-header">
      <span class="flows-overview-name">${escHtml(flow.title)}</span>
      <button class="fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${escHtml(flow.id)}', this)" title="${isFav ? 'Remove from saved' : 'Save flow'}">
        ${isFav ? '★' : '☆'}
      </button>
    </div>
    <div class="flows-overview-list">
      <div class="flows-overview-item">${escHtml(flow.description)}</div>
    </div>
    <div class="flows-overview-meta">
      <span class="flow-tx-badge">${escHtml(flow.startingTransaction)}</span>
      <span class="flow-steps-count">${flow.steps.length} step${flow.steps.length !== 1 ? 's' : ''}</span>
    </div>
  </div>`;
}

// ========== URL STATE ==========
let openFlowId = null; // tracks which flow modal is open for URL sync

function updateUrl() {
  const params = new URLSearchParams();
  const tab = document.body.dataset.tab || 'find';

  if (tab !== 'find') params.set('tab', tab);

  const inputMap = { find: 'find-input', tables: 'tables-input', decode: 'decode-input', flows: 'flows-input' };
  const input = document.getElementById(inputMap[tab]);
  if (input && input.value.trim()) params.set('q', input.value.trim());

  if (openFlowId) params.set('flow', openFlowId);

  const str = params.toString();
  history.replaceState(null, '', location.pathname + (str ? '?' + str : ''));
}

function applyUrlParams() {
  const params = new URLSearchParams(location.search);
  const tab   = params.get('tab')  || 'find';
  const q     = params.get('q')    || '';
  const flowId = params.get('flow') || '';

  // Switch tab (suppress URL write — we're reading it, not writing)
  if (tab !== 'find') switchTab(tab, true);

  // Fill search query and trigger render
  if (q) {
    const inputMap = { find: 'find-input', tables: 'tables-input', decode: 'decode-input', flows: 'flows-input' };
    const input = document.getElementById(inputMap[tab]);
    if (input) {
      input.value = q;
      if (tab === 'find')        { findPinnedCode = null; renderFind(q); }
      else if (tab === 'tables') { tablePinnedName = null; renderTables(q); }
      else if (tab === 'decode') renderDecode(q);
      else if (tab === 'flows')  { activeFlowSearch = q; renderFlows(); }
    }
  }

  // Open flow modal if specified
  if (flowId) openFlowModal(flowId);
}

// ========== FLOW MODAL ==========
function openFlowModal(flowId) {
  const flow = flows.find(f => f.id === flowId);
  if (!flow) return;

  const overlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalSubtitle = document.getElementById('modal-subtitle');
  const modalBody = document.getElementById('modal-body');

  modalTitle.textContent = flow.title;
  modalSubtitle.textContent = flow.description;

  let stepsHtml = '<div class="modal-steps">';
  for (const step of flow.steps) {
    stepsHtml += `
    <div class="modal-step">
      <div class="modal-step-num">${step.order}</div>
      <div class="modal-step-content">
        ${step.transaction ? `<div class="code-copy-row modal-step-tx-row"><div class="modal-step-tx">${escHtml(step.transaction)}</div>${COPY_BTN(step.transaction)}</div>` : ''}
        <div class="modal-step-action">${escHtml(step.action)}</div>
        <div class="modal-step-reason">${escHtml(step.reason)}</div>
      </div>
    </div>`;
  }
  stepsHtml += '</div>';
  modalBody.innerHTML = stepsHtml;

  openFlowId = flowId;
  updateUrl();
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
  openFlowId = null;
  updateUrl();
}

function closeAbout() {
  document.getElementById('about-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ========== TABS ==========
function moveIndicator(tabId, instant) {
  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const indicator = document.getElementById('tab-indicator');
  if (!btn || !indicator) return;
  if (instant) indicator.style.transition = 'none';
  indicator.style.left = btn.offsetLeft + 'px';
  indicator.style.width = btn.offsetWidth + 'px';
  if (instant) requestAnimationFrame(() => { indicator.style.transition = ''; });
}

function switchTab(tabId, noUrl = false) {
  document.body.dataset.tab = tabId;
  document.documentElement.dataset.tab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === tabId);
  });
  moveIndicator(tabId);
  animateTabStat(tabId);
  if (!noUrl) updateUrl();
}

// ========== EXAMPLE TOGGLE ==========
function toggleExamples(btn) {
  const container = btn.closest('.chip-dropdown');
  const isOpen = container.classList.toggle('open');
  btn.setAttribute('aria-expanded', isOpen);
}

// ========== COPY UTIL ==========
function copyCode(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 1800);
  });
}

const COPY_BTN = (code) =>
  `<button class="copy-btn" onclick="event.stopPropagation();copyCode('${escHtml(code)}',this)" title="Copy ${escHtml(code)}">
    <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
    <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  </button>`;

// ========== UTILS ==========
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function countUp(el, target, duration) {
  if (!el) return;
  // Scale duration: fast for small numbers, slower for large ones
  const ms = duration || Math.min(300 + Math.sqrt(target) * 18, 1600);
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / ms, 1);
    // Ease out cubic
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(ease * target).toLocaleString();
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = target.toLocaleString();
  }
  el.textContent = '0';
  requestAnimationFrame(step);
}

const STAT_MAP = {
  'find':   { id: 'stat-transactions', source: () => transactions.length },
  'tables': { id: 'stat-tables',       source: () => tables.length },
  'decode': { id: 'stat-errors',       source: () => errors.length },
  'flows':  { id: 'stat-flows',        source: () => flows.length }
};

function animateTabStat(tabId) {
  const entry = STAT_MAP[tabId];
  if (!entry) return;
  countUp(document.getElementById(entry.id), entry.source());
}

function animateAllStats() {
  for (const tabId of Object.keys(STAT_MAP)) animateTabStat(tabId);
}

// ========== INIT ==========
async function init() {
  await loadData();
  buildTxIndex();                    // build inverted index after data is loaded
  txVocab = [...txIndex.keys()];    // flat vocab array for fuzzy typo correction
  document.body.classList.remove('app-loading');
  animateAllStats();

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  moveIndicator('find', true);
  window.addEventListener('resize', () => {
    const active = document.querySelector('.tab-btn.active');
    if (active) moveIndicator(active.dataset.tab, true);
  });

  // Find tab
  const findInput = document.getElementById('find-input');
  const findClear = document.getElementById('find-clear');
  const debouncedFind = debounce(q => { renderFind(q); updateUrl(); }, 180);

  findInput.addEventListener('input', () => {
    findPinnedCode = null;
    if (findInput.value.trim()) findInput.closest('.search-wrap').classList.add('searching');
    debouncedFind(findInput.value);
  });
  findClear.addEventListener('click', () => {
    findPinnedCode = null;
    findInput.value = '';
    renderFind('');
    findInput.focus();
  });

  document.querySelectorAll('[data-find]').forEach(chip => {
    chip.addEventListener('click', () => {
      findInput.value = chip.dataset.find;
      renderFind(chip.dataset.find);
      switchTab('find');
    });
  });

  // Tables tab
  const tablesInput = document.getElementById('tables-input');
  const tablesClear = document.getElementById('tables-clear');
  const debouncedTables = debounce(q => { renderTables(q); updateUrl(); }, 180);

  tablesInput.addEventListener('input', () => {
    tablePinnedName = null;
    if (tablesInput.value.trim()) tablesInput.closest('.search-wrap').classList.add('searching');
    debouncedTables(tablesInput.value);
  });
  tablesClear.addEventListener('click', () => {
    tablePinnedName = null;
    tablesInput.value = '';
    renderTables('');
    tablesInput.focus();
  });

  document.querySelectorAll('[data-tables]').forEach(chip => {
    chip.addEventListener('click', () => {
      tablesInput.value = chip.dataset.tables;
      renderTables(chip.dataset.tables);
      switchTab('tables');
    });
  });

  // Decode tab
  const decodeInput = document.getElementById('decode-input');
  const decodeClear = document.getElementById('decode-clear');
  const debouncedDecode = debounce(q => { renderDecode(q); updateUrl(); }, 180);

  decodeInput.addEventListener('input', () => {
    if (decodeInput.value.trim()) decodeInput.closest('.search-wrap').classList.add('searching');
    debouncedDecode(decodeInput.value);
  });
  decodeClear.addEventListener('click', () => {
    decodeInput.value = '';
    renderDecode('');
    decodeInput.focus();
  });

  document.querySelectorAll('[data-decode]').forEach(chip => {
    chip.addEventListener('click', () => {
      decodeInput.value = chip.dataset.decode;
      renderDecode(chip.dataset.decode);
      switchTab('decode');
    });
  });

  // Flows tab
  const flowsInput = document.getElementById('flows-input');
  const flowsClear = document.getElementById('flows-clear');
  const debouncedFlows = debounce(q => {
    activeFlowSearch = q; renderFlows(); updateUrl();
  }, 180);

  flowsInput.addEventListener('input', () => {
    if (flowsInput.value.trim()) flowsInput.closest('.search-wrap').classList.add('searching');
    debouncedFlows(flowsInput.value);
  });
  flowsClear.addEventListener('click', () => {
    flowsInput.value = '';
    activeFlowSearch = '';
    renderFlows();
    flowsInput.focus();
  });

  renderFlows();

  // Flow detail modal
  const overlay = document.getElementById('modal-overlay');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);

  // Theme toggle
  document.getElementById('theme-btn').addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('sap-nav-theme',
      document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  });

  // About modal
  const aboutOverlay = document.getElementById('about-overlay');
  function openAbout() {
    aboutOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  document.getElementById('about-btn').addEventListener('click', openAbout);
  document.getElementById('about-close-btn').addEventListener('click', closeAbout);
  aboutOverlay.addEventListener('click', (e) => {
    if (e.target === aboutOverlay) closeAbout();
  });

  // Terms modal
  const termsOverlay = document.getElementById('terms-overlay');
  document.getElementById('terms-btn').addEventListener('click', () => {
    termsOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  });
  document.getElementById('terms-close-btn').addEventListener('click', () => {
    termsOverlay.classList.remove('open');
    document.body.style.overflow = '';
  });
  termsOverlay.addEventListener('click', (e) => {
    if (e.target === termsOverlay) { termsOverlay.classList.remove('open'); document.body.style.overflow = ''; }
  });

  // Privacy modal
  const privacyOverlay = document.getElementById('privacy-overlay');
  document.getElementById('privacy-btn').addEventListener('click', () => {
    privacyOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  });
  document.getElementById('privacy-close-btn').addEventListener('click', () => {
    privacyOverlay.classList.remove('open');
    document.body.style.overflow = '';
  });
  privacyOverlay.addEventListener('click', (e) => {
    if (e.target === privacyOverlay) { privacyOverlay.classList.remove('open'); document.body.style.overflow = ''; }
  });

  // ========== KEYBOARD SHORTCUTS ==========
  document.addEventListener('keydown', e => {
    const active  = document.activeElement;
    const inInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
    const anyModalOpen = !!document.querySelector('.modal-overlay.open');
    const TAB_INPUTS = { find: 'find-input', tables: 'tables-input', decode: 'decode-input', flows: 'flows-input' };

    // Escape — close modal, or clear/blur search
    if (e.key === 'Escape') {
      const hadModal = anyModalOpen;
      closeModal(); closeAbout();
      termsOverlay.classList.remove('open');
      privacyOverlay.classList.remove('open');
      document.body.style.overflow = '';
      if (!hadModal && inInput) {
        if (active.value) { active.value = ''; active.dispatchEvent(new Event('input')); }
        else active.blur();
      }
      return;
    }

    if (anyModalOpen) return; // let modal handle its own keys

    // Ctrl/Cmd+K or / — focus active tab's search
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !inInput)) {
      e.preventDefault();
      const inp = document.getElementById(TAB_INPUTS[document.body.dataset.tab || 'find']);
      if (inp) { inp.focus(); inp.select(); }
      return;
    }

    // Alt+1-4 — switch tab and focus its search
    if (e.altKey && !e.ctrlKey && !e.metaKey && ['1','2','3','4'].includes(e.key)) {
      e.preventDefault();
      const newTab = ['find', 'tables', 'decode', 'flows'][+e.key - 1];
      switchTab(newTab);
      document.getElementById(TAB_INPUTS[newTab])?.focus();
      return;
    }

    // Arrow Down from search input — jump to first result card
    if (e.key === 'ArrowDown' && inInput) {
      e.preventDefault();
      const panel = document.getElementById(document.body.dataset.tab || 'find');
      panel?.querySelector('[data-nav-card]')?.focus();
      return;
    }

    // Arrow Up/Down/Enter/Space on a result card
    if (active?.hasAttribute('data-nav-card')) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        // Decode cards: click the inner summary; all others: click the card itself
        const target = active.querySelector('.decode-summary[onclick]') || active;
        target.click();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const panel = document.getElementById(document.body.dataset.tab || 'find');
        const cards = panel ? [...panel.querySelectorAll('[data-nav-card]')] : [];
        const idx   = cards.indexOf(active);
        if (e.key === 'ArrowDown') {
          cards[idx + 1]?.focus();
        } else {
          if (idx > 0) cards[idx - 1].focus();
          else document.getElementById(TAB_INPUTS[document.body.dataset.tab || 'find'])?.focus();
        }
      }
    }
  });

  // Initial empty states (fallback if no URL params)
  renderFind('');
  renderTables('');
  renderDecode('');

  // Shareable URL: apply params from address bar on load, keep in sync on back/forward
  applyUrlParams();
  window.addEventListener('popstate', applyUrlParams);
}

document.addEventListener('DOMContentLoaded', init);
