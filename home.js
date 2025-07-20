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