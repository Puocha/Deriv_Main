const APP_ID = 71979;
const balanceListContainer = document.getElementById('balance-list-container');
const balanceList = document.getElementById('balance-list');
const noAccounts = document.getElementById('no-accounts');

function getToken() {
  return localStorage.getItem('deriv_token');
}

function setToken(token) {
  localStorage.setItem('deriv_token', token);
}

function extractTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('token')) {
    const token = params.get('token');
    setToken(token);
    window.history.replaceState({}, document.title, window.location.pathname);
    return token;
  }
  return null;
}

let ws = null;
let accountBalances = {};
let loginidList = [];

function renderBalances() {
  balanceList.innerHTML = '';
  if (!loginidList.length) {
    noAccounts.classList.remove('hidden');
    balanceListContainer.classList.remove('hidden');
    return;
  } else {
    noAccounts.classList.add('hidden');
  }
  loginidList.forEach(acc => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="loginid">${acc.loginid}</span> <span class="type">(${acc.is_virtual ? 'Demo' : 'Real'})</span> <span class="amount">${accountBalances[acc.loginid]?.balance ?? '--'}</span> <span class="currency">${accountBalances[acc.loginid]?.currency ?? ''}</span>`;
    balanceList.appendChild(li);
  });
  balanceListContainer.classList.remove('hidden');
}

function subscribeToBalance(token, loginid) {
  ws.send(JSON.stringify({ authorize: token, loginid }));
}

function connectWebSocket(token) {
  if (ws) ws.close();
  ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=' + APP_ID);
  ws.onopen = () => {
    ws.send(JSON.stringify({ authorize: token }));
  };
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.msg_type === 'authorize') {
      if (data.authorize && data.authorize.loginid_list) {
        loginidList = data.authorize.loginid_list;
        if (!loginidList.length) renderBalances();
        // Subscribe to each account's balance
        loginidList.forEach(acc => {
          ws.send(JSON.stringify({ authorize: token, loginid: acc.loginid }));
        });
      } else if (data.authorize && data.authorize.loginid) {
        ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
      }
    } else if (data.msg_type === 'balance') {
      const { loginid, balance, currency } = data.balance;
      accountBalances[loginid] = { balance: balance.toFixed(2), currency };
      renderBalances();
    }
  };
  ws.onerror = () => {
    balanceList.innerHTML = '<li>Error loading balances</li>';
    balanceListContainer.classList.remove('hidden');
  };
}

(function init() {
  let token = getToken();
  if (!token) {
    token = extractTokenFromUrl();
  }
  if (token) {
    connectWebSocket(token);
  }
})();

// --- Market Data Table Logic ---
const markets = [
  { name: 'Volatility 10 Index', symbol: 'R_10' },
  { name: 'Volatility 25 Index', symbol: 'R_25' },
  { name: 'Volatility 50 Index', symbol: 'R_50' },
  { name: 'Volatility 75 Index', symbol: 'R_75' },
  { name: 'Volatility 100 Index', symbol: 'R_100' },
  { name: 'Volatility 10 (1s) Index', symbol: 'R_10_1HZ' },
  { name: 'Volatility 25 (1s) Index', symbol: 'R_25_1HZ' },
  { name: 'Volatility 50 (1s) Index', symbol: 'R_50_1HZ' },
  { name: 'Volatility 75 (1s) Index', symbol: 'R_75_1HZ' },
  { name: 'Volatility 100 (1s) Index', symbol: 'R_100_1HZ' },
];

let tickCount = 1000;
const marketData = {};
markets.forEach(m => {
  // Dummy data: price, last digit, and 10 digit percentages
  marketData[m.symbol] = {
    name: m.name,
    price: 123.25,
    lastDigit: 5,
    digits: [8.2,8.2,8.2,8.2,8.2,8.2,8.2,8.2,8.2,8.2],
    history: Array(tickCount).fill({ price: 123.25, lastDigit: 5 })
  };
});

function renderMarketTable() {
  const tbody = document.getElementById('market-data-body');
  tbody.innerHTML = '';
  markets.forEach(m => {
    const data = marketData[m.symbol];
    if (!data) return;
    // Find most and least frequent digit(s)
    const max = Math.max(...data.digits);
    const min = Math.min(...data.digits);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${data.name}</td>
      <td>${data.price}</td>
      <td>${data.lastDigit}</td>
      ${data.digits.map((pct, i) => `<td class="${pct===max?'digit-most':''} ${pct===min?'digit-least':''}">${pct.toFixed(1)}%</td>`).join('')}
      <td><button class="download-btn" data-symbol="${m.symbol}">Download</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// Tick count selector
const tickCountSelect = document.getElementById('tick-count');
tickCountSelect.addEventListener('change', e => {
  tickCount = parseInt(e.target.value, 10);
  // Update dummy data for now
  markets.forEach(m => {
    marketData[m.symbol].history = Array(tickCount).fill({ price: 123.25, lastDigit: 5 });
  });
  renderMarketTable();
});

// Download CSV for each market
function downloadMarketCSV(symbol) {
  const data = marketData[symbol];
  if (!data) return;
  let csv = 'Price,Last Digit\n';
  data.history.forEach(row => {
    csv += `${row.price},${row.lastDigit}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.name.replace(/\s+/g, '_')}_history.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.addEventListener('click', e => {
  if (e.target.classList.contains('download-btn')) {
    const symbol = e.target.getAttribute('data-symbol');
    downloadMarketCSV(symbol);
  }
});

// Initial render
renderMarketTable(); 