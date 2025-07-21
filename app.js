const APP_ID = '71979';
const API_TOKEN = 'SKyFDXvqk55Xtyr';
const DERIV_WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

let ws;

function connectWebSocket() {
    ws = new WebSocket(DERIV_WS_URL);

    ws.onopen = () => {
        ws.send(JSON.stringify({ authorize: API_TOKEN }));
    };

    ws.onmessage = (event) => {
        const response = JSON.parse(event.data);
        if (response.msg_type === 'authorize') {
            ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
        } else if (response.msg_type === 'balance') {
            document.getElementById('balance').textContent = response.balance.balance + ' ' + response.balance.currency;
        }
    };

    ws.onerror = (err) => {
        document.getElementById('balance').textContent = 'Error';
        console.error('WebSocket error:', err);
    };

    ws.onclose = () => {
        document.getElementById('balance').textContent = 'Disconnected';
    };
}

function loadPage(page) {
    const main = document.getElementById('main-content');
    if (page === 'home') {
        main.innerHTML = `<h2>Welcome to Deriv Synthetic Trader</h2><p>Trade synthetic markets with live and historical data.</p>`;
    } else if (page === 'testing') {
        main.innerHTML = `<h2>Testing Page</h2><p>Simulate trades and test your strategies here.</p>`;
    } else if (page === 'real') {
        main.innerHTML = `<h2>Real Trading Page</h2><p>Execute real trades on your Deriv account.</p>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    loadPage('home');
    document.getElementById('nav-home').onclick = () => loadPage('home');
    document.getElementById('nav-testing').onclick = () => loadPage('testing');
    document.getElementById('nav-real').onclick = () => loadPage('real');
}); 