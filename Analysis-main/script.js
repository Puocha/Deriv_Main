import { initializeMarketDataTable, handleMarketDataMessage, getDetectedEvenOddSequences } from './marketDataUI.js';

// Function to add messages to the log window
export function logMessage(message) {
    const logDiv = document.getElementById('log');
     if (logDiv) { // Check if logDiv exists before appending
        const p = document.createElement('p');
        p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logDiv.appendChild(p);
        logDiv.scrollTop = logDiv.scrollHeight; // Auto-scroll to the latest message
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connect-button');
    const startMarketAnalysisButton = document.getElementById('start-market-analysis-button');
    const startBotButton = document.getElementById('start-bot-button');
    const marketDataBody = document.getElementById('market-data-body');
    const evenOddButton = document.getElementById('even-odd-button');
    const marketDropdown = document.getElementById('market-dropdown');

    let ws = null; // WebSocket instance
    let pingInterval = null; // Variable to hold the ping interval ID
    let reconnectTimeout = null; // Variable to hold the reconnect timeout ID
    const app_id = 71979; // Your Deriv App ID
    const tokens = {
        demo: 'lvdD58UJ6xldxqm', // Replace with your demo token
        real: 'SKyFDXvqk55Xtyr' // Replace with your real token
    };
    let currentAccount = 'demo';

    // Function to connect to WebSocket
    function connectWebSocket() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            logMessage("WebSocket already connected.");
            return;
        }

        logMessage(`Connecting to WebSocket with App ID: ${app_id}...`);
        ws = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${app_id}`);

        ws.onopen = () => {
            logMessage("WebSocket connected.");
            connectButton.classList.add('disconnect');
            connectButton.textContent = 'Disconnect';
            authorize();
            // Initialize the market data table when the connection is open
            initializeMarketDataTable();
            // Note: In a real application, you'd also set up a ping interval and subscribe to ticks here
             // For now, let's manually subscribe to ticks for all markets defined in marketDetails
             // (assuming marketDetails is accessible or imported)
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

              Object.keys(marketDetails).forEach(symbol => {
                ws.send(JSON.stringify({
                    ticks_history: symbol,
                    count: 1000, // Rolling window of 1000 ticks
                    end: "latest",
                    style: "ticks",
                    subscribe: 1
                }));
                logMessage(`Subscribed to historical ticks and live updates for ${marketDetails[symbol].name}`);
            });
            
            // Start sending pings to keep connection alive
            pingInterval = setInterval(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ ping: 1 }));
                    // console.log('Sent ping'); // Uncomment for debugging, but keep UI log silent
                }
            }, 30000); // Ping every 30 seconds
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            // logMessage(`Received message: ${data.msg_type}`); // Uncomment for debugging

            if (data.msg_type === "authorize") {
                if (data.authorize) {
                    logMessage("Authorized successfully.");
                    // Request balance after authorization
                    ws.send(JSON.stringify({ balance: 1 }));
                    logMessage(`Requesting balance for ${currentAccount} account.`);
                    // Update UI with the subscribed account
                    updateAccountInfoUI(currentAccount);

                } else if (data.error) {
                    logMessage(`Authorization error: ${data.error.message}`);
                    disconnectWebSocket();
                }
            } else if (data.msg_type === "balance") {
                if (data.balance) {
                    updateAccountBalanceUI(data.balance.balance, data.balance.currency);
                } else if (data.error) {
                     logMessage(`Balance request error: ${data.error.message}`);
                }
            } else if (data.msg_type === "history" || data.msg_type === "tick") {
                // Handle both historical data and live ticks with the same function
                handleMarketDataMessage(data);
            }
            // Add more message type handlers here as needed (e.g., for history)
        };

        ws.onclose = () => {
            logMessage("WebSocket disconnected.");
            clearInterval(pingInterval); // Clear the ping interval on close
            pingInterval = null;
            // Update UI to reflect disconnected state
            connectButton.classList.remove('disconnect');
            connectButton.textContent = 'Connect';
            updateAccountBalanceUI(null, null); // Clear balance display
            updateAccountInfoUI(null); // Clear account info display

            // Attempt to reconnect after 1 second
            if (!reconnectTimeout) {
                reconnectTimeout = setTimeout(() => {
                    logMessage("Attempting to reconnect...");
                    reconnectTimeout = null;
                    connectWebSocket();
                }, 1000);
            }
        };

        ws.onerror = (error) => {
            logMessage("WebSocket error:");
            console.error(error); 
            logMessage("See console for detailed WebSocket error.");
        };
    }

    // Function to disconnect WebSocket
    function disconnectWebSocket() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
            logMessage("WebSocket disconnected manually.");
        }
        // Clear any pending reconnect attempts
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
    }

    // Function to authorize with API token
    function authorize() {
        const token = tokens[currentAccount];
        if (!token) {
            logMessage(`Error: API token for ${currentAccount} account not found.`);
            return;
        }
        ws.send(JSON.stringify({ authorize: token }));
        logMessage(`Authorizing with ${currentAccount} account...`);
    }

    // Function to update account balance display
    function updateAccountBalanceUI(balance, currency) {
        const accountBalanceSpan = document.getElementById('account-balance'); // We need to add an element for this in index.html
        if (accountBalanceSpan) {
            if (balance !== null && currency !== null) {
                accountBalanceSpan.textContent = `Balance: ${currency} ${balance.toFixed(2)}`;
            } else {
                accountBalanceSpan.textContent = 'Balance: N/A';
            }
        }
    }

    // Function to update displayed account info
    function updateAccountInfoUI(account) {
        const accountInfoSpan = document.getElementById('account-info'); // We need to add an element for this in index.html
         if (accountInfoSpan) {
             accountInfoSpan.textContent = account ? `Account: ${account.charAt(0).toUpperCase() + account.slice(1)}` : 'Account: N/A';
         }
    }

    // Toggle Connect/Disconnect button
    connectButton.addEventListener('click', () => {
        if (connectButton.classList.contains('disconnect')) {
            disconnectWebSocket();
        } else {
            connectWebSocket();
        }
    });

    // Automatically connect when the page loads
    connectWebSocket();

    // Toggle Start Market Analysis button
    startMarketAnalysisButton.addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            const isAnalyzing = startMarketAnalysisButton.classList.toggle('stop'); // Using 'stop' class for toggling visual state
            startMarketAnalysisButton.textContent = isAnalyzing ? 'Stop Market Analysis' : 'Start Market Analysis';
            if (isAnalyzing) {
                logMessage('Market analysis started.');
                // Add logic here to start market data analysis (if separate from bot logic)
            } else {
                logMessage('Market analysis stopped.');
                // Add logic here to stop market data analysis
            }
        } else {
            logMessage('Cannot start/stop market analysis: WebSocket is not connected.');
        }
    });

    // Toggle Start Bot button
    startBotButton.addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            const isBotRunning = startBotButton.classList.toggle('stop'); // Using 'stop' class for toggling visual state
            startBotButton.textContent = isBotRunning ? 'Stop Bot' : 'Start Bot';
            if (isBotRunning) {
                logMessage('Bot started (Note: Core trading logic is not integrated yet).');
                // Add logic here to start the bot's trading strategy
            } else {
                logMessage('Bot stopped.');
                // Add logic here to stop the bot's trading strategy
            }
        } else {
            logMessage('Cannot start/stop bot: WebSocket is not connected.');
        }
    });

    // Example of adding a market data row (you will replace this with actual data fetching logic)
    function addMarketData(market, price, lastDigit, percentages) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${market}</td>
            <td>${price}</td>
            <td>${lastDigit}</td>
            ${percentages.map(p => `<td>${p}%</td>`).join('')}
        `;
        marketDataBody.appendChild(row);
    }

    // Add event listener for the Even/Odd button
    evenOddButton.addEventListener('click', () => {
        const selectedMarketName = marketDropdown.value;
        if (!selectedMarketName) {
            logMessage('Please select a market first.');
            return;
        }

        // Find the symbol for the selected market name
        let selectedMarketSymbol = null;
        // Assuming marketDetails is accessible or imported in script.js
        // For now, let's duplicate the marketDetails object or find a way to access it.
        // A better approach would be to define marketDetails in a shared config file.
        // For this edit, I will add a local copy of marketDetails for mapping.
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

        for (const symbol in marketDetails) {
            if (marketDetails[symbol].name === selectedMarketName) {
                selectedMarketSymbol = symbol;
                break;
            }
        }

        if (!selectedMarketSymbol) {
            logMessage(`Error: Could not find market symbol for selected market: ${selectedMarketName}`);
            return;
        }

        const detectedSequences = getDetectedEvenOddSequences(selectedMarketSymbol);
        if (detectedSequences.length > 0) {
            logMessage(`Detected Even/Odd sequences for ${selectedMarketName}:`);
            detectedSequences.forEach(seq => {
                logMessage(`  Type: ${seq.type}, Count: ${seq.count}, Ticks: ${seq.ticks.join(', ')}`);
            });
        } else {
            logMessage(`No significant Even/Odd sequences detected for ${selectedMarketName} yet.`);
        }
    });

    // Example usage:
    // addMarketData('Volatility 100 Index', '1234.56', '6', [10, 5, 8, 12, 7, 9, 3, 6, 11, 4]);
}); 