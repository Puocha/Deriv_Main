// testing.js
// Handles the Testing page strategy card and logic (Over 1 strategy)

let testingState = {
    selectedMarket: null,
    points: 50,
    running: false,
    streakDigits: [],
    minStreakLength: 2,
    patternCount: 0,
    waitingForTrade: false,
    activeTrade: null,
    startingPoints: 0,
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
            <label>Consecutive Length:
                <select id="test-consecutive-length">
                    <option value="2">More than once</option>
                    <option value="3">More than twice</option>
                    <option value="4">More than thrice</option>
                </select>
            </label>
            <button id="test-toggle-btn" class="start">Start</button>
        </div>
        <div class="consecutive-counter">Pattern Count: <span id="test-pattern-count">0</span></div>
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
    document.getElementById('test-consecutive-length').onchange = onTestLengthChange;
    // Set initial market
    if (!testingState.selectedMarket && markets.length) {
        testingState.selectedMarket = markets[0].symbol;
    }
    document.getElementById('test-market').value = testingState.selectedMarket;
    document.getElementById('test-consecutive-length').value = testingState.minStreakLength;
    updateTestMarketPrice();
    updateTestMarketLastDigit();
    updateTestTradeTable();
    updateTestLogWindow();
    updatePatternCountUI();
    updatePointsUI();
    // Attach tick listener
    attachTestTickListener();
}

function onTestMarketChange(e) {
    testingState.selectedMarket = e.target.value;
    testingState.streakDigits = [];
    testingState.patternCount = 0;
    testingState.waitingForTrade = false;
    updateTestMarketPrice();
    updatePatternCountUI();
    attachTestTickListener();
}

function onTestPointsChange(e) {
    let val = parseInt(e.target.value);
    if (isNaN(val) || val < 1) val = 1;
    testingState.points = val;
    e.target.value = val;
}

function onTestLengthChange(e) {
    testingState.minStreakLength = parseInt(e.target.value, 10);
}

function onTestToggle() {
    testingState.running = !testingState.running;
    document.getElementById('test-toggle-btn').textContent = testingState.running ? 'Stop' : 'Start';
    document.getElementById('test-toggle-btn').className = testingState.running ? 'stop' : 'start';

    if (testingState.running) {
        testingState.startingPoints = testingState.points;
        logTest(`Strategy started with ${testingState.startingPoints} points.`);
    } else {
        logTest(`Strategy stopped. Final points: ${testingState.points}. (Started with ${testingState.startingPoints})`);
        testingState.streakDigits = [];
        testingState.patternCount = 0;
        testingState.waitingForTrade = false;
        updatePatternCountUI();
    }
}

function updateTestMarketPrice() {
    const priceSpan = document.getElementById('test-market-price');
    if (!priceSpan) return;
    const market = markets.find(m => m.symbol === testingState.selectedMarket);
    const data = marketData[market.symbol];
    priceSpan.textContent = data && data.lastTick !== undefined ? Number(data.lastTick).toFixed(market.decimals) : '-';
}

function updateTestMarketLastDigit() {
    const lastDigitSpan = document.getElementById('test-market-last-digit');
    if (!lastDigitSpan) return;
    const market = markets.find(m => m.symbol === testingState.selectedMarket);
    const data = marketData[market.symbol];
    const digits = data ? data.digits : [];
    const lastDigit = digits.length ? digits[digits.length - 1] : '-';
    lastDigitSpan.textContent = lastDigit;
}

function updatePointsUI() {
    const pointsInput = document.getElementById('test-points');
    if (pointsInput) {
        pointsInput.value = testingState.points;
    }
}

function updatePatternCountUI() {
    const patternCountSpan = document.getElementById('test-pattern-count');
    if (patternCountSpan) {
        patternCountSpan.textContent = testingState.patternCount;
    }
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
    if (testingState.tickListener) {
        window.removeEventListener('tick', testingState.tickListener);
    }
    testingState.tickListener = function(e) {
        const { symbol, digit, price } = e.detail;

        if (typeof digit !== 'number' || digit < 0 || digit > 9) {
            return;
        }

        if (symbol === testingState.selectedMarket) {
            updateTestMarketPrice();
            updateTestMarketLastDigit();
        }
        
        if (symbol !== testingState.selectedMarket || !testingState.running) {
            return;
        }

        // State 1: Awaiting trade outcome
        if (testingState.waitingForTrade) {
            const market = markets.find(m => m.symbol === symbol);
            const { streak, breakDigit } = testingState.activeTrade;
            const focusDigit = digit;
            const patternString = `${streak.join('')}${breakDigit}${focusDigit}`;

            if (digit >= 2) { // WIN
                testingState.points += 2;
                logTest(`WIN: Pattern ${patternString}. (+2 points) New Balance: ${testingState.points}`);
            } else { // LOSS
                testingState.points -= 10;
                logTest(`LOSS: Pattern ${patternString}. (-10 points) New Balance: ${testingState.points}`);
            }
            testingState.waitingForTrade = false;
            testingState.activeTrade = null;
            updatePointsUI();
            return; // Done with this tick
        }

        // State 2: Looking for a pattern
        if (digit === 0 || digit === 1) {
            testingState.streakDigits.push(digit);
        } else {
            if (testingState.streakDigits.length >= testingState.minStreakLength) {
                testingState.patternCount++;
                testingState.waitingForTrade = true;
                testingState.activeTrade = {
                    streak: [...testingState.streakDigits],
                    breakDigit: digit,
                };
                logTest(`Pattern found: ${testingState.streakDigits.join('')} broken by ${digit}. Awaiting next digit for trade.`);
                updatePatternCountUI();
            }
            testingState.streakDigits = [];
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