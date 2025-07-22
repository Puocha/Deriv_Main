// testing.js
// Handles the Testing page strategy card and logic (Over 1 strategy)

let testingState = {
    selectedMarket: null,
    points: 100,
    running: false,
    consecutiveCount: 0, // current streak
    streaksCount: 0,     // number of completed streaks
    lastDigitHistory: [],
    tradeLog: [],
    contractCount: 0,
    balance: 0,
    lastTrade: null,
    tickListener: null,
};

function renderTestingPage() {
    const main = document.getElementById('main-content');
    if (!main) return;
    // Build market options
    let marketOptions = markets.map(m => `<option value="${m.symbol}">${m.name}</option>`).join('');
    let html = `
    <div class="strategy-card">
        <h2>Over 1 Strategy</h2>
        <div class="strategy-fields">
            <label>Market:
                <select id="test-market">${marketOptions}</select>
            </label>
            <label>Price:
                <span id="test-market-price">-</span>
            </label>
            <label>Last Digit:
                <span id="test-market-last-digit">-</span>
            </label>
            <label>Points:
                <input type="number" id="test-points" value="${testingState.points}" min="1" style="width:70px;">
            </label>
            <button id="test-toggle-btn" class="start">Start</button>
        </div>
        <div class="consecutive-counter">Consecutive 0/1: <span id="test-consec">0</span></div>
        <div class="trade-table-container">
            <table class="trade-table">
                <thead><tr><th>#</th><th>Type</th><th>Market</th><th>Entry</th><th>Exit</th><th>Win/Loss</th><th>Points</th></tr></thead>
                <tbody id="test-trade-tbody"></tbody>
            </table>
        </div>
        <div class="log-window" id="test-log-window"></div>
    </div>
    `;
    main.innerHTML = html;
    // Set up event listeners
    document.getElementById('test-market').onchange = onTestMarketChange;
    document.getElementById('test-points').onchange = onTestPointsChange;
    document.getElementById('test-toggle-btn').onclick = onTestToggle;
    // Set initial market
    if (!testingState.selectedMarket && markets.length) {
        testingState.selectedMarket = markets[0].symbol;
    }
    document.getElementById('test-market').value = testingState.selectedMarket;
    updateTestMarketPrice();
    updateTestMarketLastDigit();
    updateTestTradeTable();
    updateTestLogWindow();
    updateTestConsecutive();
    // Attach tick listener
    attachTestTickListener();
}

function onTestMarketChange(e) {
    testingState.selectedMarket = e.target.value;
    updateTestMarketPrice();
    testingState.lastDigitHistory = [];
    testingState.consecutiveCount = 0;
    updateTestConsecutive();
    attachTestTickListener();
}

function onTestPointsChange(e) {
    let val = parseInt(e.target.value);
    if (isNaN(val) || val < 1) val = 1;
    testingState.points = val;
    e.target.value = val;
}

function onTestToggle() {
    testingState.running = !testingState.running;
    document.getElementById('test-toggle-btn').textContent = testingState.running ? 'Stop' : 'Start';
    document.getElementById('test-toggle-btn').className = testingState.running ? 'stop' : 'start';
    if (!testingState.running) {
        testingState.consecutiveCount = 0;
        updateTestConsecutive();
    }
}

function updateTestMarketPrice() {
    const priceSpan = document.getElementById('test-market-price');
    const market = markets.find(m => m.symbol === testingState.selectedMarket);
    const data = marketData[market.symbol];
    priceSpan.textContent = data && data.lastTick !== undefined ? Number(data.lastTick).toFixed(market.decimals) : '-';
}

function updateTestMarketLastDigit() {
    const lastDigitSpan = document.getElementById('test-market-last-digit');
    const market = markets.find(m => m.symbol === testingState.selectedMarket);
    const data = marketData[market.symbol];
    let lastDigit = '-';
    if (data && data.lastTick !== undefined) {
        const decimals = market.decimals;
        const num = Number(data.lastTick);
        if (decimals > 0) {
            const str = num.toFixed(decimals);
            lastDigit = str[str.length - 1];
        } else {
            lastDigit = Math.abs(Math.floor(num) % 10).toString();
        }
    }
    lastDigitSpan.textContent = lastDigit;
}

function updateTestConsecutive() {
    document.getElementById('test-consec').textContent = testingState.streaksCount;
}

function updateTestTradeTable() {
    const tbody = document.getElementById('test-trade-tbody');
    tbody.innerHTML = testingState.tradeLog.map((trade, i) =>
        `<tr><td>${i+1}</td><td>${trade.type}</td><td>${trade.market}</td><td>${trade.entry}</td><td>${trade.exit}</td><td>${trade.result}</td><td>${trade.points}</td></tr>`
    ).join('');
}

function updateTestLogWindow() {
    const logDiv = document.getElementById('test-log-window');
    logDiv.innerHTML = testingState.tradeLog.map(trade =>
        `<div>[${trade.time}] ${trade.log}</div>`
    ).join('');
    logDiv.scrollTop = logDiv.scrollHeight;
}

function attachTestTickListener() {
    // Remove previous listener if any
    if (testingState.tickListener) {
        window.removeEventListener('tick', testingState.tickListener);
    }
    // Add new listener
    testingState.tickListener = function(e) {
        const { symbol, digit, price } = e.detail;
        if (symbol === testingState.selectedMarket) {
            updateTestMarketPrice();
            updateTestMarketLastDigit();
        }
        if (!testingState.running) return;
        if (symbol !== testingState.selectedMarket) return;
        // Debug: log each digit and current streak
        console.log('[DEBUG] Tick digit:', digit, 'Current streak:', testingState.consecutiveCount, 'StreaksCount:', testingState.streaksCount);
        if (digit === 0 || digit === 1) {
            testingState.consecutiveCount++;
            console.log('[DEBUG] 0/1 seen, streak incremented to', testingState.consecutiveCount);
        } else {
            if (testingState.consecutiveCount > 1) {
                testingState.streaksCount++;
                console.log('[DEBUG] Streak broken by', digit, 'Streak length:', testingState.consecutiveCount, 'StreaksCount incremented to', testingState.streaksCount);
                logTest(`[Pattern] ${testingState.consecutiveCount}x 0/1 detected, next digit will be marked for contract.`);
                testingState.lastDigitHistory = [digit];
                testingState.waitingForTrade = true;
            } else {
                console.log('[DEBUG] Streak broken by', digit, 'but streak too short:', testingState.consecutiveCount);
            }
            testingState.consecutiveCount = 0;
        }
        updateTestConsecutive();
        if (testingState.waitingForTrade) {
            testingState.waitingForTrade = false;
            const entry = price;
            const exit = price;
            const win = digit >= 2;
            const result = win ? 'Win' : 'Loss';
            const pointsChange = win ? 2 : -10;
            testingState.points += pointsChange;
            testingState.contractCount++;
            const market = markets.find(m => m.symbol === symbol);
            const log = `Trade executed: ${result} (${digit}) on ${market.name}. Points: ${testingState.points}`;
            testingState.tradeLog.push({
                type: 'Over 1',
                market: market.name,
                entry: entry,
                exit: exit,
                result: result,
                points: testingState.points,
                time: new Date().toLocaleTimeString(),
                log: log
            });
            updateTestTradeTable();
            updateTestLogWindow();
        }
    };
    window.addEventListener('tick', testingState.tickListener);
}

function logTest(msg) {
    const time = new Date().toLocaleTimeString();
    testingState.tradeLog.push({
        type: '',
        market: '',
        entry: '',
        exit: '',
        result: '',
        points: testingState.points,
        time: time,
        log: msg
    });
    updateTestLogWindow();
}

// This function should be called from app.js tick handler for every new tick
function broadcastTick(symbol, digit, price) {
    const event = new CustomEvent('tick', { detail: { symbol, digit, price } });
    window.dispatchEvent(event);
}

// Export for app.js
window.renderTestingPage = renderTestingPage;
window.broadcastTick = broadcastTick; 