let currentPage = 'home';

const APP_ID = '71979';
const API_TOKEN = 'lvdD58UJ6xldxqm'
const DERIV_WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

const MARKET_NAMES = [
    'Volatility 10 Index',
    'Volatility 25 Index',
    'Volatility 50 Index',
    'Volatility 75 Index',
    'Volatility 100 Index',
    'Volatility 10 (1s) Index',
    'Volatility 25 (1s) Index',
    'Volatility 50 (1s) Index',
    'Volatility 75 (1s) Index',
    'Volatility 100 (1s) Index',
];

let ws;
let pingInterval;
let reconnectTimeout;
let marketData = {};
let tickCount = 1000;
let activeSymbols = [];
let markets = [];
let tickSubscriptions = {};

function connectWebSocket() {
    clearInterval(pingInterval);
    clearTimeout(reconnectTimeout);

    ws = new WebSocket(DERIV_WS_URL);
    window.ws = ws;

    ws.onopen = () => {
        ws.send(JSON.stringify({ authorize: API_TOKEN }));
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ ping: 1 }));
            }
        }, 30000);
    };

    ws.onmessage = (event) => {
        const response = JSON.parse(event.data);
        if (response.msg_type === 'authorize') {
            ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
            requestActiveSymbols();
        } else if (response.msg_type === 'balance') {
            document.getElementById('balance').textContent = response.balance.balance + ' ' + response.balance.currency;
        } else if (response.msg_type === 'active_symbols') {
            handleActiveSymbols(response);
        } else if (response.msg_type === 'history') {
            handleHistory(response);
        } else if (response.msg_type === 'tick') {
            handleTick(response);
        } else if (response.msg_type === 'forget') {
            // Unsubscribed
        }
    };

    ws.onerror = (err) => {
        document.getElementById('balance').textContent = 'Error';
    };

    ws.onclose = () => {
        document.getElementById('balance').textContent = 'Disconnected';
        clearInterval(pingInterval);
        reconnectTimeout = setTimeout(() => {
            connectWebSocket();
        }, 1000);
    };
}

function requestActiveSymbols() {
    ws.send(JSON.stringify({ active_symbols: 'brief', product_type: 'basic' }));
}

function handleActiveSymbols(response) {
    activeSymbols = response.active_symbols;
    markets = MARKET_NAMES.map(name => {
        const symbolObj = activeSymbols.find(s => s.display_name === name);
        if (!symbolObj) return null;
        let decimals = 0;
        if (symbolObj.pip) {
            const pipStr = symbolObj.pip.toString();
            if (pipStr.includes('.')) {
                decimals = pipStr.split('.')[1].length;
            }
        }
        return {
            name: symbolObj.display_name,
            symbol: symbolObj.symbol,
            decimals: decimals,
        };
    }).filter(Boolean);
    subscribeAllMarkets();
}

function unsubscribeAllMarkets() {
    Object.values(tickSubscriptions).forEach(id => {
        ws.send(JSON.stringify({ forget: id }));
    });
    tickSubscriptions = {};
}

function subscribeAllMarkets() {
    marketData = {};
    unsubscribeAllMarkets();
    if (!markets.length) return;
    markets.forEach(market => {
        ws.send(JSON.stringify({
            ticks_history: market.symbol,
            count: tickCount,
            end: 'latest',
            style: 'ticks',
            adjust_start_time: 1,
        }));
    });
}

function handleHistory(response) {
    const symbol = response.echo_req.ticks_history;
    if (!response.history || !response.history.prices) return;
    const prices = response.history.prices;
    marketData[symbol] = {
        prices: prices.slice(-tickCount),
        lastTick: prices[prices.length - 1],
        digits: getLastDigits(prices.slice(-tickCount), symbol),
        decimals: getDecimalsForSymbol(symbol),
    };
    ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
    renderMarketTable();
}

function handleTick(response) {
    const symbol = response.tick.symbol;
    const price = response.tick.quote;
    if (response.subscription && response.subscription.id) {
        tickSubscriptions[symbol] = response.subscription.id;
    }
    if (!marketData[symbol]) {
        marketData[symbol] = { prices: [], digits: [], decimals: getDecimalsForSymbol(symbol) };
    }
    marketData[symbol].prices.push(price);
    if (marketData[symbol].prices.length > tickCount) {
        marketData[symbol].prices = marketData[symbol].prices.slice(-tickCount);
    }
    marketData[symbol].lastTick = price;
    marketData[symbol].digits = getLastDigits(marketData[symbol].prices, symbol);
    if (currentPage === 'home') {
        renderMarketTable();
    }
    if (window.broadcastTick) {
        const digits = marketData[symbol].digits;
        const lastDigit = digits.length ? digits[digits.length - 1] : null;
        if (lastDigit !== null) {
            window.broadcastTick(symbol, lastDigit, price);
        }
    }
}

function getLastDigits(prices, symbol) {
    const decimals = getDecimalsForSymbol(symbol);
    return prices.map(p => {
        const num = Number(p);
        let lastDigit;
        if (decimals > 0) {
            const str = num.toFixed(decimals);
            lastDigit = str[str.length - 1];
        } else {
            lastDigit = Math.abs(Math.floor(num) % 10).toString();
        }
        return parseInt(lastDigit, 10);
    });
}

function getDecimalsForSymbol(symbol) {
    const market = markets.find(m => m.symbol === symbol);
    return market ? market.decimals : 2;
}

function calculateDigitPercentages(digits) {
    const counts = Array(10).fill(0);
    digits.forEach(d => { if (d >= 0 && d <= 9) counts[d]++; });
    const total = digits.length || 1;
    return counts.map(c => ((c / total) * 100).toFixed(1) + '%');
}

function renderMarketTable() {
    const main = document.getElementById('main-content');
    if (!main) return;
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h2>Market Data</h2>
        <label>Ticks: <input type="number" id="tick-count" value="${tickCount}" min="10" max="5000" style="width:70px;" step="1"></label>
    </div>`;
    html += `<div style="overflow-x:auto;"><table class="market-table"><thead><tr><th>Market Name</th><th>Price</th><th>Last Digit</th>`;
    for (let i = 0; i < 10; i++) html += `<th>${i}%</th>`;
    html += `</tr></thead><tbody>`;
    markets.forEach(market => {
        const data = marketData[market.symbol];
        const price = data && data.lastTick !== undefined ? Number(data.lastTick).toFixed(market.decimals) : '-';
        const digits = data ? data.digits : [];
        const lastDigit = digits.length ? digits[digits.length - 1] : '-';
        const percentages = digits.length ? calculateDigitPercentages(digits) : Array(10).fill('-');
        let maxIdx = -1, minIdx = -1, maxVal = -Infinity, minVal = Infinity;
        if (digits.length) {
            percentages.forEach((p, i) => {
                const val = parseFloat(p);
                if (!isNaN(val)) {
                    if (val > maxVal) { maxVal = val; maxIdx = i; }
                    if (val < minVal) { minVal = val; minIdx = i; }
                }
            });
        }
        html += `<tr>`;
        html += `<td class="market-name">${market.name}</td>`;
        html += `<td class="price">${price}</td>`;
        html += `<td class="last-digit">${lastDigit}</td>`;
        percentages.forEach((p, i) => {
            let cls = '';
            if (i === maxIdx) cls = 'percent-highest';
            else if (i === minIdx) cls = 'percent-lowest';
            html += `<td class="${cls}">${p}</td>`;
        });
        html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    main.innerHTML = html;
    const tickInput = document.getElementById('tick-count');
    if (tickInput) {
        tickInput.value = tickCount;
        tickInput.oninput = (e) => {
            let val = parseInt(e.target.value);
            if (isNaN(val) || val < 10) val = 10;
            if (val > 5000) val = 5000;
            tickInput.value = val;
        };
        tickInput.onblur = (e) => {
            let val = parseInt(e.target.value);
            if (isNaN(val) || val < 10) val = 10;
            if (val > 5000) val = 5000;
            tickCount = val;
            subscribeAllMarkets();
        };
        tickInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                tickInput.blur();
            }
        };
    }
}

function loadPage(page) {
    currentPage = page;
    const main = document.getElementById('main-content');
    if (page === 'home') {
        renderMarketTable();
    } else if (page === 'testing') {
        if (window.renderTestingPage) window.renderTestingPage();
    } else if (page === 'real') {
        if (window.renderRealTradingPage) window.renderRealTradingPage();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    const main = document.getElementById('main-content');
    loadPage('home');
    document.getElementById('nav-home').onclick = (e) => { e.preventDefault(); loadPage('home'); };
    document.getElementById('nav-testing').onclick = (e) => { e.preventDefault(); loadPage('testing'); };
    document.getElementById('nav-real').onclick = (e) => { e.preventDefault(); loadPage('real'); };
}); 