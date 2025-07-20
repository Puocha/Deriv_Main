const APP_ID = 71979;
const DERIV_LOGIN_URL = 'https://oauth.deriv.com/oauth2/authorize';
const REDIRECT_URI = window.location.origin + window.location.pathname;

const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const accountTypeToggle = document.getElementById('account-type-toggle');
const loginSection = document.getElementById('login-section');
const homeSection = document.getElementById('home-section');
const balanceContainer = document.getElementById('balance-container');
const balanceSpan = document.getElementById('balance');
const currencySpan = document.getElementById('currency');

function getToken() {
  return localStorage.getItem('deriv_token');
}

function setToken(token) {
  localStorage.setItem('deriv_token', token);
}

function clearToken() {
  localStorage.removeItem('deriv_token');
}

function isDemo() {
  return localStorage.getItem('deriv_demo') === '1';
}

function setDemo(val) {
  localStorage.setItem('deriv_demo', val ? '1' : '0');
}

function showLogin() {
  loginSection.classList.remove('hidden');
  homeSection.classList.add('hidden');
  balanceContainer.classList.add('hidden');
}

function showHome() {
  loginSection.classList.add('hidden');
  homeSection.classList.remove('hidden');
  balanceContainer.classList.remove('hidden');
}

function handleLogin() {
  const is_demo = accountTypeToggle.checked;
  setDemo(is_demo);
  const account_type = is_demo ? 'demo' : 'real';
  const url = `${DERIV_LOGIN_URL}?app_id=${APP_ID}&l=${account_type}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  window.location.href = url;
}

function handleLogout() {
  clearToken();
  showLogin();
}

function extractTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('token')) {
    const token = params.get('token');
    setToken(token);
    // Remove token from URL
    window.history.replaceState({}, document.title, REDIRECT_URI);
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
      // After auth, request balance
      ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
    } else if (data.msg_type === 'balance') {
      balanceSpan.textContent = data.balance.balance.toFixed(2);
      currencySpan.textContent = data.balance.currency;
    }
  };
  ws.onerror = () => {
    balanceSpan.textContent = '--';
    currencySpan.textContent = '';
  };
  ws.onclose = () => {
    // Optionally, try to reconnect or show error
  };
}

// Event Listeners
loginBtn.addEventListener('click', handleLogin);
logoutBtn.addEventListener('click', handleLogout);
accountTypeToggle.addEventListener('change', () => {
  // Save toggle state
  setDemo(accountTypeToggle.checked);
});

// On load
(function init() {
  // Set toggle state from storage
  accountTypeToggle.checked = isDemo();
  let token = getToken();
  if (!token) {
    token = extractTokenFromUrl();
  }
  if (token) {
    showHome();
    connectWebSocket(token);
  } else {
    showLogin();
  }
})(); 