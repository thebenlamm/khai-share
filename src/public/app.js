const API_BASE = '/api';
let currentTestId = null;
let pollInterval = null;
let currentResults = null;

// DOM Elements
const siteSelect = document.getElementById('site-select');
const accountSelect = document.getElementById('account-select');
const depthInput = document.getElementById('depth-input');
const startTestBtn = document.getElementById('start-test-btn');
const stopTestBtn = document.getElementById('stop-test-btn');
const newTestBtn = document.getElementById('new-test-btn');
const exportBtn = document.getElementById('export-btn');

const newTestPanel = document.getElementById('new-test-panel');
const activeTestPanel = document.getElementById('active-test-panel');
const resultsPanel = document.getElementById('results-panel');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSites();
  loadHistory();
  setupEventListeners();
  checkPendingPurchases();
});

function setupEventListeners() {
  siteSelect.addEventListener('change', onSiteChange);
  accountSelect.addEventListener('change', onAccountChange);
  startTestBtn.addEventListener('click', startTest);
  stopTestBtn.addEventListener('click', stopTest);
  newTestBtn.addEventListener('click', showNewTestPanel);
  exportBtn.addEventListener('click', exportReport);

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Filters
  document.getElementById('severity-filter').addEventListener('change', filterIssues);
  document.getElementById('type-filter').addEventListener('change', filterIssues);

  // Modals
  document.querySelectorAll('.modal .close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal').style.display = 'none';
    });
  });

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.style.display = 'none';
    }
  });
}

async function loadSites() {
  try {
    const response = await fetch(`${API_BASE}/sites`);
    const data = await response.json();

    if (data.error) {
      siteSelect.innerHTML = `<option value="">Error: ${data.error}</option>`;
      return;
    }

    siteSelect.innerHTML = '<option value="">Select a website...</option>';
    data.sites.forEach(site => {
      const option = document.createElement('option');
      option.value = site.name;
      option.textContent = `${site.name} (${site.baseUrl})`;
      option.dataset.accounts = JSON.stringify(site.accounts);
      siteSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading sites:', error);
    siteSelect.innerHTML = '<option value="">Error loading sites</option>';
  }
}

function onSiteChange() {
  const selectedOption = siteSelect.options[siteSelect.selectedIndex];
  accountSelect.innerHTML = '<option value="">Select account type...</option>';

  if (selectedOption.value) {
    const accounts = JSON.parse(selectedOption.dataset.accounts || '[]');
    accounts.forEach(account => {
      const option = document.createElement('option');
      option.value = account;
      option.textContent = account.charAt(0).toUpperCase() + account.slice(1);
      accountSelect.appendChild(option);
    });
    accountSelect.disabled = false;
  } else {
    accountSelect.disabled = true;
  }
  startTestBtn.disabled = true;
}

function onAccountChange() {
  startTestBtn.disabled = !accountSelect.value;
}

async function startTest() {
  const site = siteSelect.value;
  const account = accountSelect.value;
  const maxDepth = parseInt(depthInput.value) || 3;

  try {
    startTestBtn.disabled = true;
    startTestBtn.innerHTML = '<span class="icon">⏳</span> Starting...';

    const response = await fetch(`${API_BASE}/test/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site, account, maxDepth })
    });

    const data = await response.json();

    if (data.error) {
      alert('Error: ' + data.error);
      startTestBtn.disabled = false;
      startTestBtn.innerHTML = '<span class="icon">▶</span> Start Test';
      return;
    }

    currentTestId = data.testId;
    showActiveTestPanel(site, account);
    pollTestStatus();

  } catch (error) {
    console.error('Error starting test:', error);
    alert('Error starting test: ' + error.message);
    startTestBtn.disabled = false;
    startTestBtn.innerHTML = '<span class="icon">▶</span> Start Test';
  }
}

function showActiveTestPanel(site, account) {
  newTestPanel.style.display = 'none';
  activeTestPanel.style.display = 'block';
  resultsPanel.style.display = 'none';

  document.getElementById('active-site').textContent = site;
  document.getElementById('active-account').textContent = account;
  document.getElementById('active-status').textContent = 'Starting...';
  document.getElementById('active-status').className = 'status running';
}

function pollTestStatus() {
  if (pollInterval) clearInterval(pollInterval);

  pollInterval = setInterval(async () => {
    try {
      const response = await fetch(`${API_BASE}/test/${currentTestId}/status`);
      const data = await response.json();

      document.getElementById('active-status').textContent = data.status;
      document.getElementById('active-status').className = `status ${data.status}`;
      document.getElementById('pages-scanned').textContent = data.pagesScanned;
      document.getElementById('issues-found').textContent = data.issuesFound;

      // Update progress bar (estimate based on typical site size)
      const progress = Math.min((data.pagesScanned / 50) * 100, 95);
      document.getElementById('progress-fill').style.width = `${progress}%`;

      // Check for pending purchases
      if (data.pendingPurchase) {
        showPurchaseConfirmation(data.pendingPurchase);
      }

      if (data.status === 'completed' || data.status === 'error' || data.status === 'stopped') {
        clearInterval(pollInterval);
        document.getElementById('progress-fill').style.width = '100%';
        await loadResults();
        loadHistory();
      }
    } catch (error) {
      console.error('Error polling status:', error);
    }
  }, 1000);
}

async function stopTest() {
  try {
    await fetch(`${API_BASE}/test/${currentTestId}/stop`, { method: 'POST' });
    clearInterval(pollInterval);
  } catch (error) {
    console.error('Error stopping test:', error);
  }
}

async function loadResults() {
  try {
    const response = await fetch(`${API_BASE}/test/${currentTestId}/results`);
    currentResults = await response.json();

    showResultsPanel();
    renderResults();
  } catch (error) {
    console.error('Error loading results:', error);
  }
}

function showResultsPanel() {
  activeTestPanel.style.display = 'none';
  resultsPanel.style.display = 'block';
}

function renderResults() {
  // Summary
  document.getElementById('total-pages').textContent = currentResults.summary.total;
  document.getElementById('passed-pages').textContent = currentResults.summary.passed;
  document.getElementById('failed-pages').textContent = currentResults.summary.failed;
  document.getElementById('warning-count').textContent = currentResults.summary.warnings;

  // Populate type filter
  const types = [...new Set(currentResults.issues.map(i => i.type))];
  const typeFilter = document.getElementById('type-filter');
  typeFilter.innerHTML = '<option value="all">All Types</option>';
  types.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    typeFilter.appendChild(option);
  });

  renderIssues();
  renderPages();
  renderScreenshots();
}

function renderIssues() {
  const severity = document.getElementById('severity-filter').value;
  const type = document.getElementById('type-filter').value;

  let issues = currentResults.issues;

  if (severity !== 'all') {
    issues = issues.filter(i => i.severity === severity);
  }
  if (type !== 'all') {
    issues = issues.filter(i => i.type === type);
  }

  const list = document.getElementById('issues-list');
  list.innerHTML = issues.length === 0 ?
    '<p style="text-align: center; color: var(--text-muted); padding: 40px;">No issues found!</p>' :
    issues.map(issue => `
      <div class="list-item ${issue.severity}">
        <div class="title">${issue.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
        <div class="url">${issue.url}</div>
        <div class="message">${escapeHtml(issue.message)}</div>
        ${issue.notes ? `<div class="notes">${issue.notes.map(n => `<p>📝 ${n.text}</p>`).join('')}</div>` : ''}
        <div class="actions">
          <button onclick="viewScreenshot('${currentResults.id}', '${urlToFilename(issue.url)}.png')">View Screenshot</button>
          <button onclick="addNote('${issue.id}')">Add Note</button>
          <button onclick="copyToClipboard('${escapeHtml(issue.url)}')">Copy URL</button>
        </div>
      </div>
    `).join('');
}

function renderPages() {
  const list = document.getElementById('pages-list');
  list.innerHTML = currentResults.pages.map(page => `
    <div class="list-item ${page.issues.length > 0 ? 'error' : 'success'}">
      <div class="title">${page.status ? `HTTP ${page.status}` : 'Unknown'} - ${page.loadTime}ms</div>
      <div class="url">${page.url}</div>
      ${page.issues.length > 0 ? `
        <div class="message">
          ${page.issues.map(i => `• ${i.type}: ${i.message}`).join('<br>')}
        </div>
      ` : ''}
      <div class="actions">
        <button onclick="viewScreenshot('${currentResults.id}', '${page.screenshot}')">View Screenshot</button>
        <button onclick="window.open('${page.url}', '_blank')">Open Page</button>
      </div>
    </div>
  `).join('');
}

function renderScreenshots() {
  const grid = document.getElementById('screenshots-grid');
  grid.innerHTML = currentResults.pages
    .filter(p => p.screenshot)
    .map(page => `
      <div class="grid-item" onclick="viewScreenshot('${currentResults.id}', '${page.screenshot}')">
        <img src="/api/screenshot/${currentResults.id}/${page.screenshot}" alt="${page.url}" loading="lazy">
        <div class="caption">${page.url.replace(currentResults.site, '')}</div>
      </div>
    `).join('');
}

function filterIssues() {
  renderIssues();
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`${tabName}-tab`).classList.add('active');
}

function viewScreenshot(testId, filename) {
  const modal = document.getElementById('screenshot-modal');
  const img = document.getElementById('modal-image');
  const caption = document.getElementById('modal-caption');

  img.src = `/api/screenshot/${testId}/${filename}`;
  caption.textContent = filename.replace(/_/g, '/').replace('.png', '');
  modal.style.display = 'block';
}

let currentIssueId = null;
function addNote(issueId) {
  currentIssueId = issueId;
  document.getElementById('note-text').value = '';
  document.getElementById('note-modal').style.display = 'block';
}

document.getElementById('save-note-btn')?.addEventListener('click', async () => {
  const note = document.getElementById('note-text').value.trim();
  if (!note) return;

  try {
    await fetch(`${API_BASE}/test/${currentTestId}/issue/${currentIssueId}/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });

    document.getElementById('note-modal').style.display = 'none';
    await loadResults();
    renderIssues();
  } catch (error) {
    console.error('Error adding note:', error);
  }
});

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
}

async function loadHistory() {
  try {
    const response = await fetch(`${API_BASE}/tests`);
    const data = await response.json();

    const list = document.getElementById('history-list');
    list.innerHTML = data.tests.length === 0 ?
      '<p style="text-align: center; color: var(--text-muted); padding: 20px;">No test history yet</p>' :
      data.tests.map(test => `
        <div class="list-item">
          <div class="info">
            <div class="title">${test.site} - ${test.account}</div>
            <div class="url">${new Date(test.startTime).toLocaleString()}</div>
          </div>
          <span class="status ${test.status}">${test.status}</span>
          <div class="actions">
            <button onclick="loadTestResults('${test.id}')">View</button>
            <button onclick="deleteTest('${test.id}')">Delete</button>
          </div>
        </div>
      `).join('');
  } catch (error) {
    console.error('Error loading history:', error);
  }
}

async function loadTestResults(testId) {
  currentTestId = testId;
  await loadResults();
}

async function deleteTest(testId) {
  if (!confirm('Delete this test and its screenshots?')) return;

  try {
    await fetch(`${API_BASE}/test/${testId}`, { method: 'DELETE' });
    loadHistory();
  } catch (error) {
    console.error('Error deleting test:', error);
  }
}

function showNewTestPanel() {
  resultsPanel.style.display = 'none';
  activeTestPanel.style.display = 'none';
  newTestPanel.style.display = 'block';
  startTestBtn.disabled = false;
  startTestBtn.innerHTML = '<span class="icon">▶</span> Start Test';
}

function exportReport() {
  if (!currentResults) return;

  const report = {
    ...currentResults,
    exportedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `siteguard-report-${currentResults.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Purchase confirmation
async function checkPendingPurchases() {
  try {
    const response = await fetch(`${API_BASE}/purchases/pending`);
    const data = await response.json();
    if (data.purchases && data.purchases.length > 0) {
      showPurchaseConfirmation(data.purchases[0]);
    }
  } catch (error) {
    // Endpoint may not exist yet, ignore
  }
}

function showPurchaseConfirmation(purchase) {
  const panel = document.createElement('div');
  panel.className = 'panel purchase-panel';
  panel.id = 'purchase-panel';
  panel.innerHTML = `
    <h2>⚠️ Purchase Confirmation Required</h2>
    <p>SiteGuard is testing a checkout flow and needs your approval to complete:</p>
    <div class="purchase-details">
      <div class="item"><span>Site:</span><span>${purchase.site}</span></div>
      <div class="item"><span>Product:</span><span>${purchase.product || 'Unknown'}</span></div>
      <div class="item"><span>Amount:</span><span>$${purchase.amount || '0.00'}</span></div>
      <div class="item"><span>Card:</span><span>****${purchase.cardLast4 || '0000'}</span></div>
    </div>
    <div class="purchase-actions">
      <button class="btn confirm" onclick="confirmPurchase('${purchase.id}', true)">
        ✓ Confirm Purchase
      </button>
      <button class="btn danger" onclick="confirmPurchase('${purchase.id}', false)">
        ✕ Cancel
      </button>
    </div>
  `;

  // Insert at top
  const main = document.querySelector('main');
  main.insertBefore(panel, main.firstChild);
}

async function confirmPurchase(purchaseId, confirm) {
  try {
    await fetch(`${API_BASE}/purchases/${purchaseId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm })
    });

    document.getElementById('purchase-panel')?.remove();
  } catch (error) {
    console.error('Error confirming purchase:', error);
  }
}

// Helpers
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function urlToFilename(url) {
  return url
    .replace(/https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .substring(0, 100);
}

// =====================================
// COMMUNICATIONS MONITORING
// =====================================

let commsPolling = null;

document.getElementById('init-comms-btn')?.addEventListener('click', initComms);
document.getElementById('stop-comms-btn')?.addEventListener('click', stopComms);

async function initComms() {
  try {
    const response = await fetch(`${API_BASE}/comms/init`, { method: 'POST' });
    const data = await response.json();

    if (data.error) {
      alert('Error: ' + data.error);
      return;
    }

    document.getElementById('init-comms-btn').style.display = 'none';
    document.getElementById('stop-comms-btn').style.display = 'inline-flex';
    document.querySelector('.comms-counts').style.display = 'flex';

    // Start polling for messages
    commsPolling = setInterval(pollComms, 5000);
    pollComms();

  } catch (error) {
    console.error('Error initializing comms:', error);
  }
}

async function stopComms() {
  try {
    await fetch(`${API_BASE}/comms/stop`, { method: 'POST' });

    if (commsPolling) {
      clearInterval(commsPolling);
      commsPolling = null;
    }

    document.getElementById('init-comms-btn').style.display = 'inline-flex';
    document.getElementById('stop-comms-btn').style.display = 'none';
    document.querySelector('.comms-counts').style.display = 'none';

  } catch (error) {
    console.error('Error stopping comms:', error);
  }
}

async function pollComms() {
  try {
    // Get unread counts
    const countResponse = await fetch(`${API_BASE}/comms/unread`);
    const counts = await countResponse.json();

    document.getElementById('email-count').textContent = counts.byType?.email || 0;
    document.getElementById('sms-count').textContent = counts.byType?.sms || 0;
    document.getElementById('fax-count').textContent = counts.byType?.fax || 0;

    // Get recent messages
    const msgsResponse = await fetch(`${API_BASE}/comms/messages?unread=true`);
    const msgsData = await msgsResponse.json();

    renderCommsMessages(msgsData.messages || []);

  } catch (error) {
    console.error('Error polling comms:', error);
  }
}

function renderCommsMessages(messages) {
  const container = document.getElementById('comms-messages');

  if (messages.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">No new messages</p>';
    return;
  }

  container.innerHTML = messages.slice(0, 10).map(msg => `
    <div class="list-item ${msg.type}">
      <div class="title">
        ${msg.type === 'email' ? '📧' : msg.type === 'sms' ? '📱' : '📠'}
        ${msg.type.toUpperCase()} from ${msg.from || 'Unknown'}
      </div>
      <div class="message">${escapeHtml(msg.body || msg.subject || 'No content')}</div>
      <div class="actions">
        <button onclick="markCommsRead('${msg.id}')">Mark Read</button>
        ${msg.body ? `<button onclick="extractCode('${msg.id}')">Extract Code</button>` : ''}
      </div>
    </div>
  `).join('');
}

async function markCommsRead(messageId) {
  try {
    await fetch(`${API_BASE}/comms/messages/${messageId}/read`, { method: 'POST' });
    pollComms();
  } catch (error) {
    console.error('Error marking read:', error);
  }
}

async function extractCode(messageId) {
  // The server-side extraction will handle this
  alert('Code extraction happens automatically when Khai detects verification codes.');
}
