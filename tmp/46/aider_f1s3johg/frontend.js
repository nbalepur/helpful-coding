 // HTML elements
const cells = Array.from(document.querySelectorAll(".cell"));
const statusElement = document.getElementById("status");

// global variables
let board = [
  ["", "", "", "", ""],
  ["", "", "", "", ""],
  ["", "", "", "", ""],
  ["", "", "", "", ""],
  ["", "", "", "", ""],
];
let currentPlayer = "A";
let statusMessage = "";
let movesThisTurn = 0;

// connect the HTML + JS
cells.forEach((cell) => {
  cell.addEventListener("click", (event) => {
    const index = Number(event.currentTarget.dataset.index);
    onMove(index);
  });
});

// start the game
renderBoard();

/**
 * Check for 5 in a row (horizontal, vertical) for either player.
 * Returns "A", "B", or null.
 */
function checkWinner() {
  // Check rows
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= 0; col++) {
      const symbol = board[row][col];
      if (
        symbol &&
        board[row][col + 1] === symbol &&
        board[row][col + 2] === symbol &&
        board[row][col + 3] === symbol &&
        board[row][col + 4] === symbol
      ) {
        return symbol;
      }
    }
  }
  // Check columns
  for (let col = 0; col < 5; col++) {
    for (let row = 0; row <= 0; row++) {
      const symbol = board[row][col];
      if (
        symbol &&
        board[row + 1][col] === symbol &&
        board[row + 2][col] === symbol &&
        board[row + 3][col] === symbol &&
        board[row + 4][col] === symbol
      ) {
        return symbol;
      }
    }
  }
  return null;
}

// JS functions
function playMove(cellIndex) {
  console.log("User clicked on cell:", cellIndex);

  // Convert cellIndex (0-24) to board coordinates
  const row = Math.floor(cellIndex / 5);
  const col = cellIndex % 5;

  // Only allow placing on empty cells
  if (board[row][col] !== "") {
    statusMessage = "Cell already taken!";
    return;
  }

  // Place the current player's symbol
  board[row][col] = currentPlayer;
  movesThisTurn += 1;

  // Check for a winner after each move
  const winner = checkWinner();
  if (winner) {
    statusMessage = `Player ${winner} wins!`;
    cells.forEach(cell => cell.disabled = true);
    return;
  }

  // Check for tie (board full, no winner)
  const isBoardFull = board.flat().every(cell => cell !== "");
  if (isBoardFull) {
    statusMessage = "It's a tie!";
    return;
  }

  // After two moves, switch player
  if (movesThisTurn === 2) {
    currentPlayer = currentPlayer === "A" ? "B" : "A";
    movesThisTurn = 0;
  }
  statusMessage = `Player ${currentPlayer}'s Turn`;
}

function renderBoard() {
  console.log("Displaying the board");
  // Update the UI to reflect the board state
  for (let i = 0; i < 25; i++) {
    const row = Math.floor(i / 5);
    const col = i % 5;
    cells[i].textContent = board[row][col];
  }
  if (statusElement) {
    statusElement.textContent = `Status: ${statusMessage}`;
  }
}

function onMove(cellIndex) {
  playMove(cellIndex);
  renderBoard();
}