/*
Tic-Tac-Toe Frontend JavaScript - Self-Contained Version

This version doesn't rely on any backend API calls and implements
all game logic directly in the frontend.
*/

// Console logging helpers (pass-through to native console to preserve objects)
function log(...args) {
    console.log(...args);
}

function logError(...args) {
    console.error(...args);
}

function logSuccess(...args) {
    console.log(...args);
}

function logWarning(...args) {
    console.warn(...args);
}

// Game state
let gameBoard = [
    ["", "", ""],
    ["", "", ""],
    ["", "", ""]
];
let gameStatus = "Human Turn"; // "Human Turn", "AI Turn", "Game Over"

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', function() {
    log('Game initializing');
    log({'hello': 'world'});
    resetGame();
    setupEventListeners();
    logSuccess('Game ready');
});

// Reset the game to initial state
function resetGame() {
    log('Resetting game');
    gameBoard = [
        ["", "", ""],
        ["", "", ""],
        ["", "", ""]
    ];
    
    // Human always goes first
    gameStatus = "Human Turn";
    
    updateDisplay();
}

// Update the visual display based on current game state
function updateDisplay() {
    // Update the game status text
    const statusElement = document.getElementById('game-status');
    if (statusElement) {
        statusElement.textContent = `Game Status: ${gameStatus}`;
    }
    
    // Update the board cells
    const cells = document.querySelectorAll('.board-cell');
    cells.forEach(cell => {
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        
        // Clear previous content and classes
        cell.textContent = '';
        cell.className = 'board-cell';
        
        // Set content based on board state
        if (gameBoard[row] && gameBoard[row][col]) {
            cell.textContent = gameBoard[row][col];
            cell.classList.add(gameBoard[row][col].toLowerCase());
        }
        
        // Add disabled class if it's not human's turn
        if (gameStatus !== "Human Turn") {
            cell.classList.add('disabled');
        }
    });
    
    // Show/hide reset button based on game status
    const resetButton = document.getElementById('play-again-btn');
    if (resetButton) {
        if (gameStatus.includes("Game Over")) {
            resetButton.style.display = 'block';
        } else {
            resetButton.style.display = 'none';
        }
    }
}

// Set up event listeners for user interactions
function setupEventListeners() {
    // Board cell clicks
    const cells = document.querySelectorAll('.board-cell');
    cells.forEach(cell => {
        cell.addEventListener('click', handleCellClick);
    });
    
    // Reset button
    const resetButton = document.getElementById('play-again-btn');
    if (resetButton) {
        resetButton.addEventListener('click', resetGame);
    }
}

// Handle when a user clicks on a board cell
function handleCellClick(event) {
    const row = parseInt(event.target.dataset.row);
    const col = parseInt(event.target.dataset.col);
    log(`Cell clicked [${row}][${col}]`);
    
    // Only allow clicks during human turn
    if (gameStatus !== "Human Turn") {
        logWarning('Click ignored - not human turn');
        return;
    }
    
    // Check if the move is valid
    if (isValidMove(row, col)) {
        // Make the human move
        gameBoard[row][col] = "X";
        log(`Human placed X at [${row}][${col}]`);
        
        // Check if game is over
        const winner = checkWinner();
        
        if (winner) {
            if (winner === "Tie") {
                gameStatus = "Game Over - Tie!";
                logWarning('Game ended in tie');
            } else {
                gameStatus = `Game Over - ${winner} Wins!`;
                logSuccess(`Game over - ${winner} wins`);
            }
            updateDisplay();
            return;
        }
        
        // If game is still ongoing, it's AI's turn
        gameStatus = "AI Turn";
        updateDisplay();
        
        // Make AI move after a short delay
        setTimeout(() => {
            makeAIMove();
        }, 500);
    } else {
        logWarning('Invalid move attempted');
    }
}

// Check if a move is valid
function isValidMove(row, col) {
    return row >= 0 && row < 3 && col >= 0 && col < 3 && gameBoard[row][col] === "";
}

// Make the AI play a move
function makeAIMove() {
    log('AI making move');
    gameStatus = "AI Turn...";
    updateDisplay();
    
    // Get the AI's move
    const aiMove = getAIMove();
    
    if (aiMove) {
        gameBoard[aiMove.row][aiMove.col] = "O";
        log(`AI placed O at [${aiMove.row}][${aiMove.col}]`);
        
        // Check if game is over
        const winner = checkWinner();
        
        if (winner) {
            if (winner === "Tie") {
                gameStatus = "Game Over - Tie!";
                logWarning('Game ended in tie');
            } else {
                gameStatus = `Game Over - ${winner} Wins!`;
                logSuccess(`Game over - ${winner} wins`);
            }
        } else {
            // If game is still ongoing, it's human's turn
            gameStatus = "Human Turn";
        }
    }
    
    updateDisplay();
}

// Get empty cells on the board
function getEmptyCells() {
    const empty = [];
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            if (gameBoard[row][col] === "") {
                empty.push({ row, col });
            }
        }
    }
    return empty;
}

// AI move logic (same strategy as backend)
function getAIMove() {
    const emptyCells = getEmptyCells();
    
    if (emptyCells.length === 0) {
        return null; // No moves available
    }
    
    const aiPlayer = "O";
    const opponent = "X";
    
    // Strategy 1: Try to win
    for (const cell of emptyCells) {
        const testBoard = gameBoard.map(row => [...row]);
        testBoard[cell.row][cell.col] = aiPlayer;
        if (checkWinnerOnBoard(testBoard) === aiPlayer) {
            return cell;
        }
    }
    
    // Strategy 2: Block opponent from winning
    for (const cell of emptyCells) {
        const testBoard = gameBoard.map(row => [...row]);
        testBoard[cell.row][cell.col] = opponent;
        if (checkWinnerOnBoard(testBoard) === opponent) {
            return cell;
        }
    }
    
    // Strategy 3: Take center if available
    if (gameBoard[1][1] === "") {
        return { row: 1, col: 1 };
    }
    
    // Strategy 4: Take a corner if available
    const corners = [{ row: 0, col: 0 }, { row: 0, col: 2 }, { row: 2, col: 0 }, { row: 2, col: 2 }];
    const availableCorners = corners.filter(corner => gameBoard[corner.row][corner.col] === "");
    if (availableCorners.length > 0) {
        return availableCorners[Math.floor(Math.random() * availableCorners.length)];
    }
    
    // Strategy 5: Take any available space
    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
}

// Check for winner on the current board
function checkWinner() {
    return checkWinnerOnBoard(gameBoard);
}

// Check for winner on any given board
function checkWinnerOnBoard(board) {
    // Check rows
    for (let row = 0; row < 3; row++) {
        if (board[row][0] === board[row][1] && board[row][1] === board[row][2] && board[row][0] !== "") {
            return board[row][0];
        }
    }
    
    // Check columns
    for (let col = 0; col < 3; col++) {
        if (board[0][col] === board[1][col] && board[1][col] === board[2][col] && board[0][col] !== "") {
            return board[0][col];
        }
    }
    
    // Check diagonals
    if (board[0][0] === board[1][1] && board[1][1] === board[2][2] && board[0][0] !== "") {
        return board[0][0];
    }
    if (board[0][2] === board[1][1] && board[1][1] === board[2][0] && board[0][2] !== "") {
        return board[0][2];
    }
    
    // Check for tie (board is full)
    const isFull = board.every(row => row.every(cell => cell !== ""));
    if (isFull) {
        return "Tie";
    }
    
    return null; // No winner yet
}

// Error handling function (kept for compatibility)
function showError(message) {
    log(`ERROR: ${message}`);
    // Could show a user-friendly error message here if needed
}