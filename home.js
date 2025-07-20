const APP_ID = 71979;
const balanceContainer = document.getElementById('balance-container');
const balanceSpan = document.getElementById('balance');
const currencySpan = document.getElementById('currency');

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
    // Remove token from URL
    window.history.replaceState({}, document.title, window.location.pathname);
    return token;
  }
  return null;
}

let ws = null;
function connectWebSocket(token) {
  if (ws) {
    ws.close();
  }
  ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=' + APP_ID);
  ws.onopen = () => {
    ws.send(JSON.stringify({ authorize: token }));
  };
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.msg_type === 'authorize') {
      ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
    } else if (data.msg_type === 'balance') {
      balanceSpan.textContent = data.balance.balance.toFixed(2);
      currencySpan.textContent = data.balance.currency;
      balanceContainer.classList.remove('hidden');
    }
  };
  ws.onerror = () => {
    balanceSpan.textContent = '--';
    currencySpan.textContent = '';
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