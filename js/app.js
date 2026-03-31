'use strict';

// ========== STATE ==========
let transactions = [];
let errors = [];
let flows = [];
let favorites = new Set(JSON.parse(localStorage.getItem('sap-nav-favorites') || '[]'));

// ========== DATA LOADING ==========
async function loadData() {
  const [txRes, errRes, flowRes] = await Promise.all([
    fetch('data/transactions.json'),
    fetch('data/errors.json'),
    fetch('data/flows.json')
  ]);
  [transactions, errors, flows] = await Promise.all([txRes.json(), errRes.json(), flowRes.json()]);
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

// ========== SEARCH SCORING ==========
function scoreTransaction(tx, query) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/);
  let score = 0;

  const codeL = tx.code.toLowerCase();
  const nameL = tx.name.toLowerCase();
  const descL = tx.description.toLowerCase();
  const tagsL = tx.tags.map(t => t.toLowerCase());
  const catL = tx.category.toLowerCase();

  // Exact code match
  if (codeL === q) score += 100;
  else if (codeL.includes(q)) score += 60;

  // Each word match
  for (const w of words) {
    if (nameL.includes(w)) score += 20;
    if (descL.includes(w)) score += 8;
    if (catL.includes(w)) score += 10;
    for (const tag of tagsL) {
      if (tag === w) score += 30;
      else if (tag.includes(w)) score += 15;
    }
  }

  // Full query in tags or name
  if (tagsL.some(t => t.includes(q))) score += 25;
  if (nameL.includes(q)) score += 15;

  return score;
}

function matchReason(tx, query) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/);
  const codeL = tx.code.toLowerCase();
  const tagsL = tx.tags.map(t => t.toLowerCase());

  if (codeL === q || codeL.includes(q)) return `Matches transaction code "${tx.code}" directly.`;
  for (const tag of tagsL) {
    for (const w of words) {
      if (tag.includes(w)) return `Matches keyword: "${tag}"`;
    }
  }
  if (tx.name.toLowerCase().includes(q)) return `Name contains "${q}"`;
  return `Related to "${query}"`;
}

function findTransactions(query) {
  if (!query.trim()) return [];
  const scored = transactions.map(tx => ({
    tx,
    score: scoreTransaction(tx, query)
  })).filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored;
}

// ========== FIND TAB ==========
function renderFind(query) {
  const resultsEl = document.getElementById('find-results');
  const emptyEl = document.getElementById('find-empty');
  const clearBtn = document.getElementById('find-clear');

  clearBtn.classList.toggle('visible', query.length > 0);

  if (!query.trim()) {
    resultsEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  const scored = findTransactions(query);
  emptyEl.classList.add('hidden');

  if (scored.length === 0) {
    resultsEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">No results found</div>
        <div class="empty-text">Try different keywords, a transaction code, or a task description.</div>
      </div>`;
    return;
  }

  const best = scored[0];
  const related = scored.slice(1, 6);

  let html = `<div class="results-section">
    <div class="results-label">Best starting point</div>
    ${renderBestCard(best.tx, matchReason(best.tx, query))}
  </div>`;

  if (related.length > 0) {
    html += `<div class="results-section">
      <div class="results-label">Related transactions</div>
      <div class="cards-grid">
        ${related.map(r => renderTxCard(r.tx, matchReason(r.tx, query))).join('')}
      </div>
    </div>`;
  }

  resultsEl.innerHTML = html;
}

function renderBestCard(tx, reason) {
  return `
  <div class="best-card">
    <div class="best-badge">★ Best Starting Point</div>
    <div class="card-code">${escHtml(tx.code)}</div>
    <div class="card-name">${escHtml(tx.name)}</div>
    <div class="card-desc">${escHtml(tx.description)}</div>
    <div class="card-reason">${escHtml(reason)}</div>
    <div class="card-category">${escHtml(tx.category)}</div>
  </div>`;
}

function renderTxCard(tx, reason) {
  return `
  <div class="tx-card">
    <div class="card-code">${escHtml(tx.code)}</div>
    <div class="card-name">${escHtml(tx.name)}</div>
    <div class="card-desc">${escHtml(tx.description)}</div>
    ${reason ? `<div class="card-reason">${escHtml(reason)}</div>` : ''}
    <div class="card-category" style="margin-top:8px">${escHtml(tx.category)}</div>
  </div>`;
}

// ========== DECODE TAB ==========
function scoreError(err, query) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/);
  let score = 0;
  for (const pat of err.pattern) {
    if (q.includes(pat)) score += 40;
    else if (pat.includes(q)) score += 20;
    for (const w of words) {
      if (pat.includes(w)) score += 10;
    }
  }
  if (err.title.toLowerCase().includes(q)) score += 15;
  if (err.description.toLowerCase().includes(q)) score += 5;
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
  const resultsEl = document.getElementById('decode-results');
  const emptyEl = document.getElementById('decode-empty');
  const clearBtn = document.getElementById('decode-clear');

  clearBtn.classList.toggle('visible', query.length > 0);

  if (!query.trim()) {
    resultsEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  const matched = findErrors(query);
  emptyEl.classList.add('hidden');

  if (matched.length === 0) {
    resultsEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔎</div>
        <div class="empty-title">No matches found</div>
        <div class="empty-text">Try describing the symptom differently — e.g. "user has no access", "service 404", "job failed".</div>
      </div>`;
    return;
  }

  const top = matched.slice(0, 3);
  let html = '';

  for (const { err } of top) {
    const primaryTx = transactions.find(t => t.code === err.primaryTransaction);
    const relatedTxs = (err.relatedTransactions || [])
      .map(code => transactions.find(t => t.code === code))
      .filter(Boolean);
    const linkedFlow = err.linkedFlow ? flows.find(f => f.id === err.linkedFlow) : null;
    const catClass = categoryClass(err.category);

    html += `<div class="decode-card">
      <div class="decode-header">
        <div class="decode-title">${escHtml(err.title)}</div>
        <span class="category-badge ${catClass}">${escHtml(err.category)}</span>
      </div>
      <div class="decode-desc">${escHtml(err.description)}</div>`;

    if (primaryTx) {
      html += `<div class="decode-primary">
        <span class="decode-primary-label">Start here</span>
        <span class="decode-primary-code">${escHtml(primaryTx.code)}</span>
        <span class="decode-primary-name">${escHtml(primaryTx.name)}</span>
      </div>`;
    }

    if (err.steps && err.steps.length) {
      html += `<div class="decode-steps">
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
      html += `<div style="margin-top:12px">
        <div class="decode-steps-label">Related transactions</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
          ${relatedTxs.map(t => `<span class="flow-tx-badge" title="${escHtml(t.name)}">${escHtml(t.code)}</span>`).join('')}
        </div>
      </div>`;
    }

    if (linkedFlow) {
      html += `<div style="margin-top:14px">
        <button class="flow-link-btn" onclick="openFlowModal('${linkedFlow.id}')">
          → View full troubleshooting flow: ${escHtml(linkedFlow.title)}
        </button>
      </div>`;
    }

    html += `</div>`;
  }

  resultsEl.innerHTML = html;
}

// ========== FLOWS TAB ==========
function renderFlows() {
  const container = document.getElementById('flows-container');
  if (!container) return;

  const favFlows = flows.filter(f => favorites.has(f.id));
  const otherFlows = flows.filter(f => !favorites.has(f.id));

  let html = '';

  if (favFlows.length > 0) {
    html += `<div class="flows-section">
      <div class="flows-section-title">Favorites</div>
      <div class="flows-grid">
        ${favFlows.map(f => renderFlowCard(f, true)).join('')}
      </div>
    </div>`;
  }

  if (otherFlows.length > 0) {
    html += `<div class="flows-section">
      <div class="flows-section-title">${favFlows.length > 0 ? 'All Flows' : 'Common Flows'}</div>
      <div class="flows-grid">
        ${otherFlows.map(f => renderFlowCard(f, false)).join('')}
      </div>
    </div>`;
  }

  if (flows.length === 0) {
    html = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <div class="empty-title">No flows available</div>
      <div class="empty-text">Flows will appear here once data is loaded.</div>
    </div>`;
  }

  container.innerHTML = html;
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
        ${step.transaction ? `<div class="modal-step-tx">${escHtml(step.transaction)}</div>` : ''}
        <div class="modal-step-action">${escHtml(step.action)}</div>
        <div class="modal-step-reason">${escHtml(step.reason)}</div>
      </div>
    </div>`;
  }
  stepsHtml += '</div>';
  modalBody.innerHTML = stepsHtml;

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

// ========== TABS ==========
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === tabId);
  });
}

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

// ========== INIT ==========
async function init() {
  await loadData();

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Find tab
  const findInput = document.getElementById('find-input');
  const findClear = document.getElementById('find-clear');
  const debouncedFind = debounce(q => renderFind(q), 180);

  findInput.addEventListener('input', () => debouncedFind(findInput.value));
  findClear.addEventListener('click', () => {
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

  // Decode tab
  const decodeInput = document.getElementById('decode-input');
  const decodeClear = document.getElementById('decode-clear');
  const debouncedDecode = debounce(q => renderDecode(q), 180);

  decodeInput.addEventListener('input', () => debouncedDecode(decodeInput.value));
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
  renderFlows();

  // Modal
  const overlay = document.getElementById('modal-overlay');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Initial empty states
  renderFind('');
  renderDecode('');
}

document.addEventListener('DOMContentLoaded', init);
