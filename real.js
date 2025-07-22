// real.js
// Handles the Real Trading page Over 1 strategy card and logic

let realState = {
    selectedMarket: null,
    price: '-',
    amount: 0.5,
    bulkContracts: 1,
    minStreakLength: 2,
    patternCount: 0,
    streakDigits: [],
    waitingForTrade: false,
    activeTrade: null,
    running: false,
    startingBalance: 0,
    log: [],
    tickListener: null,
};

// Centralized trade state
let openContractIds = [];
let currentTrades = [];

function renderRealTradingPage() {
    const main = document.getElementById('main-content');
    if (!main) return;
    // Defensive: Only render if markets are loaded
    if (!markets || !markets.length) {
        main.innerHTML = '<div class="log-window">[ERROR] Markets not loaded yet. Please wait and try again.</div>';
        return;
    }
    let marketOptions = markets.map(m => `<option value="${m.symbol}">${m.name}</option>`).join('');
    let html = `
    <div class="strategy-card">
        <h2>Over 1 Strategy (Real Trading)</h2>
        <div class="strategy-fields">
            <label>Market:
                <select id="real-market">${marketOptions}</select>
            </label>
            <label>Price:
                <span id="real-market-price">-</span>
            </label>
            <label>Amount:
                <input type="number" id="real-amount" value="${realState.amount}" min="0.35" step="0.01" style="width:70px;">
            </label>
            <label>Bulk Contracts:
                <input type="number" id="real-bulk" value="${realState.bulkContracts}" min="1" max="100" style="width:70px;">
            </label>
            <label>Consecutive Length:
                <select id="real-consecutive-length">
                    <option value="2">More than once</option>
                    <option value="3">More than twice</option>
                    <option value="4">More than thrice</option>
                </select>
            </label>
            <label>Pattern Count:
                <span id="real-pattern-count">0</span>
            </label>
            <button id="real-toggle-btn" class="start">Start</button>
        </div>
        <div class="log-window" id="real-log-window"></div>
    </div>
    `;
    main.innerHTML = html;
    // Set up event listeners
    document.getElementById('real-market').onchange = onRealMarketChange;
    document.getElementById('real-amount').onchange = onRealAmountChange;
    document.getElementById('real-bulk').onchange = onRealBulkChange;
    document.getElementById('real-consecutive-length').onchange = onRealLengthChange;
    document.getElementById('real-toggle-btn').onclick = onRealToggle;
    // Set initial market
    if (!realState.selectedMarket || !markets.find(m => m.symbol === realState.selectedMarket)) {
        realState.selectedMarket = markets[0].symbol;
    }
    document.getElementById('real-market').value = realState.selectedMarket;
    document.getElementById('real-consecutive-length').value = realState.minStreakLength;
    updateRealMarketPrice();
    updateRealPatternCountUI();
    updateRealLogWindow();
    attachRealTickListener();
}

function onRealMarketChange(e) {
    const newSymbol = e.target.value;
    const market = markets.find(m => m.symbol === newSymbol);
    if (!market) {
        logReal('[ERROR] Selected market symbol not found in markets list.');
        realState.selectedMarket = markets[0].symbol;
    } else {
        realState.selectedMarket = newSymbol;
    }
    realState.streakDigits = [];
    realState.patternCount = 0;
    realState.waitingForTrade = false;
    updateRealMarketPrice();
    updateRealPatternCountUI();
    attachRealTickListener();
}

function onRealAmountChange(e) {
    let val = parseFloat(e.target.value);
    if (isNaN(val) || val < 0.35) val = 0.35;
    realState.amount = val;
    e.target.value = val;
}

function onRealBulkChange(e) {
    let val = parseInt(e.target.value);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 100) val = 100;
    realState.bulkContracts = val;
    e.target.value = val;
}

function onRealLengthChange(e) {
    realState.minStreakLength = parseInt(e.target.value, 10);
}

function onRealToggle() {
    realState.running = !realState.running;
    document.getElementById('real-toggle-btn').textContent = realState.running ? 'Stop' : 'Start';
    document.getElementById('real-toggle-btn').className = realState.running ? 'stop' : 'start';
    if (realState.running) {
        // Get the actual account balance from the DOM
        const balanceText = document.getElementById('balance').textContent;
        const balance = parseFloat(balanceText);
        realState.startingBalance = balance;
        realState.balance = balance;
        logReal(`Strategy started with balance: ${realState.startingBalance}`);
    } else {
        logReal(`Strategy stopped. Final balance: ${realState.balance}. (Started with ${realState.startingBalance})`);
        realState.streakDigits = [];
        realState.patternCount = 0;
        realState.waitingForTrade = false;
        updateRealPatternCountUI();
    }
}

function updateRealMarketPrice() {
    const priceSpan = document.getElementById('real-market-price');
    if (!priceSpan) return;
    const market = markets.find(m => m.symbol === realState.selectedMarket);
    if (!market) {
        logReal('[ERROR] Selected market not found in markets list.');
        priceSpan.textContent = '-';
        return;
    }
    const data = marketData[market.symbol];
    priceSpan.textContent = data && data.lastTick !== undefined ? Number(data.lastTick).toFixed(market.decimals) : '-';
}

function updateRealPatternCountUI() {
    const patternCountSpan = document.getElementById('real-pattern-count');
    if (patternCountSpan) {
        patternCountSpan.textContent = realState.patternCount;
    }
}

function updateRealLogWindow() {
    const logDiv = document.getElementById('real-log-window');
    logDiv.innerHTML = realState.log.map(entry => `<div>${entry}</div>`).join('');
    logDiv.scrollTop = logDiv.scrollHeight;
}

function logReal(msg) {
    realState.log.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    updateRealLogWindow();
}

function attachRealTickListener() {
    if (realState.tickListener) {
        window.removeEventListener('tick', realState.tickListener);
    }
    realState.tickListener = async function(e) {
        const { symbol, digit, price } = e.detail;

        if (typeof digit !== 'number' || digit < 0 || digit > 9) {
            return;
        }

        if (symbol === realState.selectedMarket) {
            updateRealMarketPrice();
        }
        
        if (symbol !== realState.selectedMarket || !realState.running) {
            return;
        }

        // State 1: Awaiting trade outcome
        if (realState.waitingForTrade) {
            // Ignore ticks while waiting for contract results
            return;
        }

        // State 2: Looking for a pattern
        if (digit === 0 || digit === 1) {
            realState.streakDigits.push(digit);
        } else {
            if (realState.streakDigits.length >= realState.minStreakLength) {
                realState.patternCount++;
                realState.waitingForTrade = true;
                realState.activeTrade = {
                    streak: [...realState.streakDigits],
                    breakDigit: digit,
                };
                logReal(`Pattern found: ${realState.streakDigits.join('')} broken by ${digit}. Executing ${realState.bulkContracts} Over 1 contracts at ${realState.amount} each.`);
                updateRealPatternCountUI();
                // Initiate contract purchase
                await executeBulkOver1Contracts(symbol, realState.amount, realState.bulkContracts, realState.activeTrade);
                realState.waitingForTrade = false;
            }
            realState.streakDigits = [];
        }
    };
    window.addEventListener('tick', realState.tickListener);
}

async function executeBulkOver1Contracts(symbol, amount, bulk, patternInfo) {
    const contractType = 'DIGITOVER';
    const barrier = 1;
    let contractsWon = 0;
    let contractsLost = 0;
    let contractResults = [];
    openContractIds = [];
    currentTrades = [];
    // Only execute a single contract for now
    try {
        logReal(`[DEBUG] Attempting to place trade for pattern: ${patternInfo.streak.join('')}${patternInfo.breakDigit}`);
        console.log('[DEBUG] Attempting to place trade for pattern:', patternInfo);
        const tradeResult = await placeTrade({
            symbol,
            tradeType: contractType,
            amount,
            duration: 1,
            barrier,
        });
        contractResults.push(tradeResult);
        if (tradeResult && tradeResult.profit > 0) {
            contractsWon++;
        } else {
            contractsLost++;
        }
    } catch (err) {
        contractsLost++;
        contractResults.push({ error: err });
        logReal(`[ERROR] Trade error: ${err}`);
        console.error('[ERROR] Trade error:', err);
    }
    await updateRealBalance();
    const patternString = `${patternInfo.streak.join('')}${patternInfo.breakDigit}`;
    logReal(`Pattern ${patternString}: 1 contract. Won: ${contractsWon}, Lost: ${contractsLost}. New Balance: ${realState.balance}`);
}

function placeTrade({ symbol, tradeType, amount, duration, barrier }) {
    // Defensive: Only allow trading if symbol is valid
    const market = markets.find(m => m.symbol === symbol);
    if (!market) {
        logReal('[ERROR] Attempted to trade with invalid symbol. Aborting trade.');
        console.error('[ERROR] Attempted to trade with invalid symbol:', symbol);
        return Promise.reject('Invalid market symbol');
    }
    return new Promise((resolve, reject) => {
        const ws = window.ws;
        let openContractId = null;
        let tradeResult = null;
        // Step 1: Request proposal
        const proposalRequest = {
            proposal: 1,
            amount: amount,
            basis: 'stake',
            contract_type: tradeType,
            currency: 'USD',
            symbol: symbol,
            barrier: barrier,
            duration: duration,
            duration_unit: 't',
        };
        console.log('[DEBUG] Using symbol:', symbol);
        console.log('[DEBUG] Available markets:', markets);
        logReal(`[DEBUG] Sending proposal request: ${JSON.stringify(proposalRequest)}`);
        console.log('[DEBUG] Sending proposal request:', proposalRequest);
        const onProposal = (event) => {
            const data = JSON.parse(event.data);
            if (data.msg_type === 'proposal' && data.proposal && data.proposal.contract_type === tradeType) {
                ws.removeEventListener('message', onProposal);
                logReal(`[DEBUG] Received proposal response: ${JSON.stringify(data.proposal)}`);
                console.log('[DEBUG] Received proposal response:', data.proposal);
                // Step 2: Buy using proposal_id
                const buyRequest = {
                    buy: data.proposal.id,
                    price: amount
                };
                logReal(`[DEBUG] Sending buy request: ${JSON.stringify(buyRequest)}`);
                console.log('[DEBUG] Sending buy request:', buyRequest);
                ws.addEventListener('message', onBuy);
                ws.send(JSON.stringify(buyRequest));
            } else if (data.msg_type === 'error') {
                ws.removeEventListener('message', onProposal);
                logReal(`[ERROR] Proposal error: ${data.error.message}`);
                console.error('[ERROR] Proposal error:', data.error.message);
                reject(data.error.message);
            }
        };
        const onBuy = (event) => {
            const data = JSON.parse(event.data);
            if (data.msg_type === 'buy') {
                ws.removeEventListener('message', onBuy);
                openContractId = data.buy.contract_id;
                openContractIds.push(openContractId);
                currentTrades.push({ contract_id: openContractId, buyPrice: parseFloat(data.buy.buy_price) });
                logReal(`[DEBUG] Trade opened successfully. Contract ID: ${openContractId}, Buy Price: $${data.buy.buy_price}`);
                console.log('[DEBUG] Trade opened successfully. Contract ID:', openContractId, 'Buy Price:', data.buy.buy_price);
                // Step 3: Subscribe to contract updates
                ws.addEventListener('message', onContractUpdate);
                ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: openContractId }));
            } else if (data.msg_type === 'error') {
                ws.removeEventListener('message', onBuy);
                logReal(`[ERROR] Buy error: ${data.error.message}`);
                console.error('[ERROR] Buy error:', data.error.message);
                reject(data.error.message);
            }
        };
        const onContractUpdate = (event) => {
            const data = JSON.parse(event.data);
            if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract.contract_id === openContractId) {
                logReal(`[DEBUG] Contract update: ${JSON.stringify(data.proposal_open_contract)}`);
                console.log('[DEBUG] Contract update:', data.proposal_open_contract);
                if (data.proposal_open_contract.is_sold) {
                    ws.removeEventListener('message', onContractUpdate);
                    tradeResult = {
                        profit: data.proposal_open_contract.profit,
                        exit_tick: data.proposal_open_contract.exit_tick,
                        exit_tick_time: data.proposal_open_contract.exit_tick_time,
                        exit_tick_value: data.proposal_open_contract.exit_tick_value,
                    };
                    if (tradeResult.profit > 0) {
                        logReal(`Trade completed: WON, Profit/Loss: $${tradeResult.profit.toFixed(2)}`);
                    } else {
                        logReal(`Trade completed: LOST, Profit/Loss: $${tradeResult.profit.toFixed(2)}`);
                    }
                    resolve(tradeResult);
                }
            } else if (data.msg_type === 'error') {
                ws.removeEventListener('message', onContractUpdate);
                logReal(`[ERROR] Contract update error: ${data.error.message}`);
                console.error('[ERROR] Contract update error:', data.error.message);
                reject(data.error.message);
            }
        };
        ws.addEventListener('message', onProposal);
        ws.send(JSON.stringify(proposalRequest));
    });
}

function waitForContractResult(contractId) {
    return new Promise((resolve) => {
        const ws = window.ws;
        const onMessage = (event) => {
            const response = JSON.parse(event.data);
            if (response.msg_type === 'proposal_open_contract' && response.proposal_open_contract.contract_id === contractId && response.proposal_open_contract.is_sold) {
                ws.removeEventListener('message', onMessage);
                resolve({
                    profit: response.proposal_open_contract.profit,
                    exit_tick: response.proposal_open_contract.exit_tick,
                    exit_tick_time: response.proposal_open_contract.exit_tick_time,
                    exit_tick_value: response.proposal_open_contract.exit_tick_value,
                });
            }
        };
        ws.addEventListener('message', onMessage);
        // Subscribe to contract updates
        ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: contractId }));
    });
}

async function updateRealBalance() {
    // Request balance from Deriv
    return new Promise((resolve) => {
        const ws = window.ws;
        const onMessage = (event) => {
            const response = JSON.parse(event.data);
            if (response.msg_type === 'balance') {
                ws.removeEventListener('message', onMessage);
                realState.balance = response.balance.balance;
                logReal(`[DEBUG] Updated balance: ${realState.balance}`);
                console.log('[DEBUG] Updated balance:', realState.balance);
                resolve();
            }
        };
        ws.addEventListener('message', onMessage);
        ws.send(JSON.stringify({ balance: 1 }));
    });
} 