// --- Configuration ---
const APP_ID = 71979;
const API_TOKEN = 'SKyFDXvqk55Xtyr'; // <-- Real account token

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

// --- Balance Display ---
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

function connectMarketWebSocket() {
  if (wsMarket) wsMarket.close();
  wsMarket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);
  wsMarket.onopen = () => {
    // Authorize with API token
    wsMarket.send(JSON.stringify({ authorize: API_TOKEN }));
  };
  wsMarket.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.msg_type === 'authorize') {
      if (data.error) {
        markets.forEach(m => {
          marketData[m.symbol].loading = false;
          marketData[m.symbol].error = 'Authorization error: ' + (data.error.message || 'Unknown');
        });
        renderMarketTable();
        updateBalanceUI(null, null);
        return;
      }
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

document.addEventListener('click', e => {
  if (e.target.classList.contains('download-btn')) {
    const symbol = e.target.getAttribute('data-symbol');
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
});

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
  initMarketData();
  renderMarketTable();
  connectMarketWebSocket();
}); 