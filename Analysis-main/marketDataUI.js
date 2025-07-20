import { logMessage } from "./script.js"; // Assuming logMessage is exported from script.js
import { updateMarketData } from "./marketDataManager.js"; // Import the data saving function

// We'll need market details, similar to config.js in the root
// For now, we'll use a placeholder and you can integrate your config later.
const marketDetails = {
    "R_10": { name: "Volatility 10 Index", decimals: 3 },
    "R_25": { name: "Volatility 25 Index", decimals: 3 },
    "R_50": { name: "Volatility 50 Index", decimals: 4 },
    "R_75": { name: "Volatility 75 Index", decimals: 4 },
    "R_100": { name: "Volatility 100 Index", decimals: 2 },
    "1HZ10V": { name: "Volatility 10 (1s) Index", decimals: 2 },
    "1HZ25V": { name: "Volatility 25 (1s) Index", decimals: 2 },
    "1HZ50V": { name: "Volatility 50 (1s) Index", decimals: 2 },
    "1HZ75V": { name: "Volatility 75 (1s) Index", decimals: 2 },
    "1HZ100V": { name: "Volatility 100 (1s) Index", decimals: 2 }
  };

// Store tick data for each market, maintaining a rolling window (e.g., last 1000 ticks)
const marketTicks = {};
const TICK_HISTORY_SIZE = 1000; // Size of the rolling window for ticks

// State for tracking even/odd sequences for each market
const evenOddSequences = {};
const SEQUENCE_THRESHOLD = 6; // Minimum consecutive occurrences to save
const SAVE_TICKS_COUNT = 10; // Number of last digits to save when threshold is met

// Function to initialize the market data table in the UI
export function initializeMarketDataTable() {
    const tbody = document.getElementById("market-data-body");
    if (!tbody) {
        logMessage("Error: Market data table body not found.");
        return;
    }
    tbody.innerHTML = ''; // Clear existing rows
    
    Object.keys(marketDetails).forEach(symbol => {
        // Initialize tick history for each market
        marketTicks[symbol] = [];
        // Initialize even/odd sequence tracking for each market
        evenOddSequences[symbol] = {
            currentSequenceType: null, // 'even' or 'odd'
            currentSequenceCount: 0,
            detectedSequences: []
        };

        const row = document.createElement('tr');
        row.id = `market-row-${symbol}`;
        row.innerHTML = `
            <td>${marketDetails[symbol].name}</td>
            <td class="market-price">-</td>
            <td class="last-digit">-</td>
            ${Array(10).fill('<td class="digit-percentage">-</td>').join('')}
        `;
        tbody.appendChild(row);
    });
    logMessage("Market data table initialized.");
}

// Function to update a specific market data table row
function updateMarketDataTableUI(symbol, price, lastDigit, percentages, mostAppearing, leastAppearing) {
    const row = document.getElementById(`market-row-${symbol}`);
    if (!row) {
        // logMessage(`Error: Market row not found for symbol ${symbol}`); // Keep silent, might be too noisy
        return;
    }

    row.querySelector('.market-price').textContent = parseFloat(price).toFixed(marketDetails[symbol].decimals);
    row.querySelector('.last-digit').textContent = lastDigit;

    const digitCells = row.querySelectorAll('.digit-percentage');
    digitCells.forEach((cell, index) => {
        cell.textContent = `${percentages[index]}%`;
        // Remove previous highlighting classes
        cell.classList.remove('most-appearing', 'least-appearing');
        // Apply new highlighting classes based on the current color palette
        if (mostAppearing.includes(index)) {
            cell.classList.add('most-appearing');
        }
        if (leastAppearing.includes(index)) {
            cell.classList.add('least-appearing');
        }
    });
}

// Function to extract the last digit from a price string or number
function extractLastDigit(price, decimals) {
    // Ensure price is treated as a string to handle potential floating point issues
    const priceStr = parseFloat(price).toFixed(decimals);
    return parseInt(priceStr.slice(-1));
}

// Function to calculate digit percentages and find most/least appearing digits
function analyzeDigits(digits) {
    const counts = Array(10).fill(0);
    digits.forEach(d => counts[d]++);
    const total = digits.length;
    const percentages = counts.map(count => total > 0 ? ((count / total) * 100).toFixed(1) : '0.0');

    if (total === 0) {
        return { percentages, mostAppearing: [], leastAppearing: [] };
    }

    const maxCount = Math.max(...counts);
    const minCount = Math.min(...counts);

    const mostAppearing = counts
        .map((count, digit) => ({ count, digit }))
        .filter(item => item.count === maxCount && maxCount > 0)
        .map(item => item.digit);

    const leastAppearing = counts
         .map((count, digit) => ({ count, digit }))
        .filter(item => item.count === minCount && minCount >= 0)
        .map(item => item.digit);

    return { percentages, mostAppearing, leastAppearing };
}

// Function to handle incoming market data messages (history and tick)
export function handleMarketDataMessage(data) {
    if (data.msg_type === "history") {
        const symbol = data.echo_req.ticks_history;
        const decimals = marketDetails[symbol]?.decimals || 2;

        // Initialize the rolling window with historical data
        marketTicks[symbol] = data.history.prices.map(price => extractLastDigit(price, decimals));

        // Analyze and update the UI table with initial data
        const { percentages, mostAppearing, leastAppearing } = analyzeDigits(marketTicks[symbol]);
        // Use the latest price from the history for initial display
        const latestPrice = data.history.prices[data.history.prices.length - 1];
        const lastDigit = extractLastDigit(latestPrice, decimals);
        updateMarketDataTableUI(symbol, latestPrice, lastDigit, percentages, mostAppearing, leastAppearing);
        
        // Call updateMarketData to save the historical data
        updateMarketData(marketDetails[symbol]?.name, { 
            price: latestPrice,
            lastDigit: lastDigit.toString(), // Ensure it's a string
            percentages: percentages.map(p => parseFloat(p)) // Save percentages as numbers
        });

        logMessage(`Historical data loaded and market table updated for ${marketDetails[symbol]?.name}.`);

    } else if (data.msg_type === "tick") {
        const symbol = data.tick.symbol;
        const price = data.tick.quote;
        const decimals = marketDetails[symbol]?.decimals || 2;
        const lastDigit = extractLastDigit(price, decimals);

        // Ensure the rolling window exists for this market
        if (!marketTicks[symbol]) {
            marketTicks[symbol] = [];
        }

        // Add the new last digit and maintain the window size
        marketTicks[symbol].push(lastDigit);
        if (marketTicks[symbol].length > TICK_HISTORY_SIZE) {
            marketTicks[symbol].shift(); // Remove the oldest digit
        }

        // Check for even/odd sequences
        const isEven = lastDigit % 2 === 0;
        const currentType = isEven ? 'even' : 'odd';

        if (evenOddSequences[symbol].currentSequenceType === currentType) {
            evenOddSequences[symbol].currentSequenceCount++;
        } else {
            evenOddSequences[symbol].currentSequenceType = currentType;
            evenOddSequences[symbol].currentSequenceCount = 1;
        }

        // If a sequence of 6 or more is detected, save the last 10 digits
        if (evenOddSequences[symbol].currentSequenceCount >= SEQUENCE_THRESHOLD) {
            const startIndex = Math.max(0, marketTicks[symbol].length - SAVE_TICKS_COUNT);
            const sequenceToSave = marketTicks[symbol].slice(startIndex);
            evenOddSequences[symbol].detectedSequences.push({
                type: currentType,
                count: evenOddSequences[symbol].currentSequenceCount,
                ticks: sequenceToSave
            });
            logMessage(`Detected ${evenOddSequences[symbol].currentSequenceCount} consecutive ${currentType} digits for ${marketDetails[symbol]?.name}. Saved the last ${SAVE_TICKS_COUNT} ticks.`);
            // You might want to reset the count here if you only want to save the *first* occurrence of a sequence of 6 or more.
            // If you want to save *every* tick that extends a sequence of 6+, don't reset.
            // For now, let's not reset, so it saves for 6, 7, 8... consecutive. If you only want 6+, reset here:
            // evenOddSequences[symbol].currentSequenceCount = 0;
        }

        // Analyze and update the UI table with real-time data
        const { percentages, mostAppearing, leastAppearing } = analyzeDigits(marketTicks[symbol]);
        updateMarketDataTableUI(symbol, price, lastDigit, percentages, mostAppearing, leastAppearing);

        // Call updateMarketData to save the real-time tick data
        updateMarketData(marketDetails[symbol]?.name, { 
            price: price,
            lastDigit: lastDigit.toString(), // Ensure it's a string
            percentages: percentages.map(p => parseFloat(p)) // Save percentages as numbers
        });

        // Keep tick logs silent as requested
        // logMessage(`Tick received for ${marketDetails[symbol]?.name}. Last Digit: ${lastDigit}, Price: ${price}`);
    }
}

// You can add functions here to access the detected sequences if needed by other modules.
// For example:
export function getDetectedEvenOddSequences(symbol) {
    return evenOddSequences[symbol]?.detectedSequences || [];
}