const boardElement = document.getElementById('board');
const statusElement = document.getElementById('status');
const restartBtn = document.getElementById('restart-btn');
const winLineSvg = document.getElementById('win-line');

let board = Array(9).fill(null);
let currentPlayer = 'X'; // X = human, O = AI
let gameOver = false;

// Coordinates for win lines: [startX, startY, endX, endY]
const WIN_LINE_COORDS = [
  [36, 36, 204, 36],   // Row 0
  [36, 120, 204, 120], // Row 1
  [36, 204, 204, 204], // Row 2
  [36, 36, 36, 204],   // Col 0
  [120, 36, 120, 204], // Col 1
  [204, 36, 204, 204], // Col 2
  [36, 36, 204, 204],  // Diag TL-BR
  [204, 36, 36, 204],  // Diag TR-BL
];

function renderBoard() {
  boardElement.innerHTML = '';
  board.forEach((cell, idx) => {
    const cellDiv = document.createElement('div');
    cellDiv.className = 'cell';
    cellDiv.textContent = cell || '';
    cellDiv.dataset.idx = idx;
    // Add data-x and data-o for styling
    if (cell === 'X') cellDiv.dataset.x = "true";
    if (cell === 'O') cellDiv.dataset.o = "true";
    cellDiv.addEventListener('click', () => handleCellClick(idx));
    boardElement.appendChild(cellDiv);

    // Add a subtle "star" sparkle to some cells for space effect
    if (Math.random() < 0.18) {
      const star = document.createElement('div');
      star.style.position = 'absolute';
      star.style.left = `${Math.random() * 60 + 6}px`;
      star.style.top = `${Math.random() * 60 + 6}px`;
      star.style.width = `${Math.random() * 2 + 1.5}px`;
      star.style.height = star.style.width;
      star.style.borderRadius = '50%';
      star.style.background = 'white';
      star.style.opacity = Math.random() * 0.5 + 0.2;
      star.style.filter = 'blur(0.5px)';
      cellDiv.appendChild(star);
    }
  });
  drawWinLine();
}

function handleCellClick(idx) {
  if (gameOver || board[idx] || currentPlayer !== 'X') return;
  board[idx] = 'X';
  renderBoard();
  const result = checkWinner();
  if (result && result.winner) {
    statusElement.textContent = `Player ${result.winner} wins!`;
    gameOver = true;
  } else if (board.every(cell => cell)) {
    statusElement.textContent = "It's a draw!";
    gameOver = true;
  } else {
    currentPlayer = 'O';
    statusElement.textContent = `AI's turn`;
    setTimeout(aiMove, 400); // Let the UI update before AI moves
  }
}

function checkWinner() {
  const winPatterns = [
    [0,1,2],[3,4,5],[6,7,8], // rows
    [0,3,6],[1,4,7],[2,5,8], // cols
    [0,4,8],[2,4,6]          // diags
  ];
  for (let i = 0; i < winPatterns.length; i++) {
    const [a, b, c] = winPatterns[i];
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: i };
    }
  }
  return null;
}

function aiMove() {
  // Simple AI: pick a random empty cell
  if (gameOver) return;
  const emptyCells = board
    .map((cell, idx) => (cell === null ? idx : null))
    .filter(idx => idx !== null);
  if (emptyCells.length === 0) return;
  const move = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  board[move] = 'O';
  renderBoard();
  const result = checkWinner();
  if (result && result.winner) {
    statusElement.textContent = `Player ${result.winner} wins!`;
    gameOver = true;
  } else if (board.every(cell => cell)) {
    statusElement.textContent = "It's a draw!";
    gameOver = true;
  } else {
    currentPlayer = 'X';
    statusElement.textContent = `Player ${currentPlayer}'s turn`;
  }
}

function restartGame() {
  board = Array(9).fill(null);
  currentPlayer = 'X';
  gameOver = false;
  statusElement.textContent = `Player ${currentPlayer}'s turn`;
  renderBoard();
  if (winLineSvg) {
    winLineSvg.style.display = "none";
    winLineSvg.innerHTML = "";
  }
  // If you want AI to go first, uncomment below:
  // if (currentPlayer === 'O') setTimeout(aiMove, 400);
}

restartBtn.addEventListener('click', restartGame);

window.addEventListener('DOMContentLoaded', () => {
  restartGame();
});

// Draw the win line if there is a winner
function drawWinLine() {
  if (!winLineSvg) return;
  winLineSvg.innerHTML = "";
  const result = checkWinner();
  if (result && typeof result.line === "number") {
    const [x1, y1, x2, y2] = WIN_LINE_COORDS[result.line];
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", result.winner === "X" ? "#f4d35e" : "#a3cef1");
    line.setAttribute("stroke-width", "8");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("filter", "url(#glow)");
    winLineSvg.appendChild(line);

    // Add a glow filter
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    `;
    winLineSvg.appendChild(defs);

    winLineSvg.style.display = "block";
  } else {
    winLineSvg.style.display = "none";
  }
}