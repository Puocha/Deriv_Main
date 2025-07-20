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
let wsMarket = null;
let marketToken = null;
let isAuthorized = false;

// Add balance display
const balanceContainer = document.getElementById('balance-list-container');
let balanceValue = null;
let balanceCurrency = null;

function updateBalanceUI(balance, currency) {
  let balanceDiv = document.getElementById('account-balance');
  if (!balanceDiv) {
    balanceDiv = document.createElement('div');
    balanceDiv.id = 'account-balance';
    balanceDiv.style.fontWeight = 'bold';
    balanceDiv.style.marginBottom = '0.5em';
    balanceContainer.prepend(balanceDiv);
  }
  if (balance !== null && currency) {
    balanceDiv.textContent = `Balance: ${currency} ${parseFloat(balance).toFixed(2)}`;
  } else {
    balanceDiv.textContent = 'Balance: --';
  }
}

function initMarketData() {
  markets.forEach(m => {
    marketData[m.symbol] = {
      name: m.name,
      price: 'Loading...',
      lastDigit: 'Loading...',
      digits: Array(10).fill(null),
      history: [],
      loading: true,
      error: null,
    };
  });
}

function calculateDigits(symbol) {
  const data = marketData[symbol];
  const digitCounts = Array(10).fill(0);
  data.history.forEach(tick => {
    const digit = parseInt(String(tick.lastDigit), 10);
    if (!isNaN(digit)) digitCounts[digit]++;
  });
  const total = data.history.length || 1;
  data.digits = digitCounts.map(count => (count / total) * 100);
}

function renderMarketTable() {
  const tbody = document.getElementById('market-data-body');
  tbody.innerHTML = '';
  markets.forEach(m => {
    const data = marketData[m.symbol];
    if (!data) return;
    let max = null, min = null;
    if (!data.loading && !data.error) {
      max = Math.max(...data.digits);
      min = Math.min(...data.digits);
    }
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${data.name}</td>
      <td>${data.error ? '<span style=\"color:#b91c1c\">Error</span>' : data.price}</td>
      <td>${data.error ? '-' : data.lastDigit}</td>
      ${data.digits.map((pct, i) =>
        data.loading ? '<td>Loading...</td>' :
        data.error ? '<td>-</td>' :
        `<td class=\"${pct===max?'digit-most':''} ${pct===min?'digit-least':''}\">${pct.toFixed(1)}%</td>`
      ).join('')}
      <td><button class="download-btn" data-symbol="${m.symbol}" ${data.loading||data.error?'disabled':''}>Download</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function subscribeToMarket(symbol) {
  // Request historical data first, then subscribe to live ticks
  wsMarket.send(JSON.stringify({
    authorize: marketToken
  }));
  wsMarket.send(JSON.stringify({
    ticks_history: symbol,
    adjust_start_time: 1,
    count: tickCount,
    end: 'latest',
    style: 'ticks',
    subscribe: 0
  }));
}

function subscribeLiveTick(symbol) {
  wsMarket.send(JSON.stringify({
    ticks: symbol,
    subscribe: 1
  }));
}

function connectMarketWebSocket() {
  if (wsMarket) wsMarket.close();
  wsMarket = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=71979');
  isAuthorized = false;
  wsMarket.onopen = () => {
    marketToken = getToken();
    console.log('[WS] Opened. Sending authorize...');
    wsMarket.send(JSON.stringify({ authorize: marketToken }));
  };
  wsMarket.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    console.log('[WS] Message:', data);
    if (data.msg_type === 'authorize') {
      if (data.error) {
        console.error('[WS] Authorization error:', data.error);
        markets.forEach(m => {
          marketData[m.symbol].loading = false;
          marketData[m.symbol].error = 'Authorization error: ' + (data.error.message || 'Unknown');
        });
        renderMarketTable();
        updateBalanceUI(null, null);
        return;
      }
      isAuthorized = true;
      // Request balance
      wsMarket.send(JSON.stringify({ balance: 1 }));
      // Now request historical+live for all
      markets.forEach(m => {
        wsMarket.send(JSON.stringify({
          ticks_history: m.symbol,
          count: tickCount,
          end: 'latest',
          style: 'ticks',
          subscribe: 1
        }));
      });
    } else if (data.msg_type === 'balance') {
      if (data.balance) {
        balanceValue = data.balance.balance;
        balanceCurrency = data.balance.currency;
        updateBalanceUI(balanceValue, balanceCurrency);
      }
    } else if (data.msg_type === 'history' && data.history && data.history.prices) {
      const symbol = data.echo_req.ticks_history;
      const prices = data.history.prices;
      const decimals = prices.length && String(prices[0]).split('.')[1] ? String(prices[0]).split('.')[1].length : 2;
      marketData[symbol].history = prices.map(price => {
        const priceStr = String(price);
        const lastDigit = priceStr.includes('.') ? priceStr.split('.').pop().slice(-1) : priceStr.slice(-1);
        return { price, lastDigit };
      });
      if (marketData[symbol].history.length) {
        const last = marketData[symbol].history[marketData[symbol].history.length - 1];
        marketData[symbol].price = last.price;
        marketData[symbol].lastDigit = last.lastDigit;
      }
      marketData[symbol].loading = false;
      marketData[symbol].error = null;
      calculateDigits(symbol);
      renderMarketTable();
    } else if (data.msg_type === 'tick') {
      const symbol = data.tick.symbol;
      const price = data.tick.quote;
      const priceStr = String(price);
      const lastDigit = priceStr.includes('.') ? priceStr.split('.').pop().slice(-1) : priceStr.slice(-1);
      marketData[symbol].history.push({ price, lastDigit });
      if (marketData[symbol].history.length > tickCount) {
        marketData[symbol].history.shift();
      }
      marketData[symbol].price = price;
      marketData[symbol].lastDigit = lastDigit;
      marketData[symbol].loading = false;
      marketData[symbol].error = null;
      calculateDigits(symbol);
      renderMarketTable();
    } else if (data.msg_type === 'error') {
      console.error('[WS] Error:', data);
      if (data.echo_req && (data.echo_req.ticks_history || data.echo_req.ticks)) {
        const symbol = data.echo_req.ticks_history || data.echo_req.ticks;
        marketData[symbol].loading = false;
        marketData[symbol].error = data.error.message || 'Error';
        renderMarketTable();
      } else {
        markets.forEach(m => {
          marketData[m.symbol].loading = false;
          marketData[m.symbol].error = data.error.message || 'Error';
        });
        renderMarketTable();
      }
      updateBalanceUI(null, null);
    }
  };
  wsMarket.onerror = (e) => {
    console.error('[WS] Connection error:', e);
    markets.forEach(m => {
      marketData[m.symbol].loading = false;
      marketData[m.symbol].error = 'WebSocket error';
    });
    renderMarketTable();
    updateBalanceUI(null, null);
  };
}

// Tick count selector
const tickCountSelect = document.getElementById('tick-count');
tickCountSelect.addEventListener('change', e => {
  tickCount = parseInt(e.target.value, 10);
  initMarketData();
  renderMarketTable();
  connectMarketWebSocket();
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

// Initial setup
initMarketData();
renderMarketTable();
connectMarketWebSocket(); 