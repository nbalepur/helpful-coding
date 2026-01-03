/**
 * Simple Chess implementation (no castling, en passant, or promotion UI)
 * Only basic move legality, no check/checkmate detection.
 */

const PIECES = {
  r: "♜", n: "♞", b: "♝", q: "♛", k: "♚", p: "♟",
  R: "♖", N: "♘", B: "♗", Q: "♕", K: "♔", P: "♙"
};

const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

let board = [];
let turn = "w";
let selected = null;
let legalMoves = [];

function parseFEN(fen) {
  const rows = fen.split(" ")[0].split("/");
  const b = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (const c of rows[r]) {
      if (/\d/.test(c)) {
        for (let i = 0; i < Number(c); i++) row.push(null);
      } else {
        row.push(c);
      }
    }
    b.push(row);
  }
  return b;
}

function renderBoard() {
  const boardDiv = document.getElementById("chessboard");
  boardDiv.innerHTML = "";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement("div");
      sq.className = "chess-square " +
        ((r + c) % 2 === 0 ? "light" : "dark");
      sq.dataset.row = r;
      sq.dataset.col = c;
      if (selected && selected[0] === r && selected[1] === c) {
        sq.classList.add("selected");
      }
      if (legalMoves.some(([mr, mc]) => mr === r && mc === c)) {
        sq.classList.add("move");
      }
      const piece = board[r][c];
      if (piece) {
        sq.textContent = PIECES[piece];
      }
      sq.addEventListener("click", () => onSquareClick(r, c));
      boardDiv.appendChild(sq);
    }
  }
  document.getElementById("turn-indicator").textContent =
    turn === "w" ? "White's turn" : "Black's turn";
}

function isWhite(piece) {
  return piece && piece === piece.toUpperCase();
}
function isBlack(piece) {
  return piece && piece === piece.toLowerCase();
}

function onSquareClick(r, c) {
  const piece = board[r][c];
  if (selected) {
    // Try to move
    if (legalMoves.some(([mr, mc]) => mr === r && mc === c)) {
      movePiece(selected[0], selected[1], r, c);
      selected = null;
      legalMoves = [];
      renderBoard();
      return;
    }
    // Deselect if clicking same square or not a valid move
    selected = null;
    legalMoves = [];
    renderBoard();
    return;
  }
  // Select a piece
  if (piece && ((turn === "w" && isWhite(piece)) || (turn === "b" && isBlack(piece)))) {
    selected = [r, c];
    legalMoves = getLegalMoves(r, c, piece);
    renderBoard();
  }
}

function movePiece(fromR, fromC, toR, toC) {
  board[toR][toC] = board[fromR][fromC];
  board[fromR][fromC] = null;
  // Pawn promotion (to queen only)
  if (board[toR][toC] === "P" && toR === 0) board[toR][toC] = "Q";
  if (board[toR][toC] === "p" && toR === 7) board[toR][toC] = "q";
  turn = turn === "w" ? "b" : "w";
}

function getLegalMoves(r, c, piece) {
  // Only basic move legality, no check/checkmate detection
  const moves = [];
  const directions = {
    N: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
    B: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
    R: [[-1, 0], [1, 0], [0, -1], [0, 1]],
    Q: [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]],
    K: [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]
  };
  const isW = isWhite(piece);
  const isB = isBlack(piece);

  if (piece.toLowerCase() === "p") {
    // Pawn moves
    const dir = isW ? -1 : 1;
    const startRow = isW ? 6 : 1;
    // Forward
    if (inBounds(r + dir, c) && !board[r + dir][c]) {
      moves.push([r + dir, c]);
      // Double move
      if (r === startRow && !board[r + 2 * dir][c]) {
        moves.push([r + 2 * dir, c]);
      }
    }
    // Captures
    for (const dc of [-1, 1]) {
      if (
        inBounds(r + dir, c + dc) &&
        board[r + dir][c + dc] &&
        ((isW && isBlack(board[r + dir][c + dc])) ||
          (isB && isWhite(board[r + dir][c + dc])))
      ) {
        moves.push([r + dir, c + dc]);
      }
    }
    // No en passant
  } else if (piece.toLowerCase() === "n") {
    for (const [dr, dc] of directions.N) {
      const nr = r + dr, nc = c + dc;
      if (
        inBounds(nr, nc) &&
        (!board[nr][nc] ||
          (isW && isBlack(board[nr][nc])) ||
          (isB && isWhite(board[nr][nc])))
      ) {
        moves.push([nr, nc]);
      }
    }
  } else if (piece.toLowerCase() === "b") {
    for (const [dr, dc] of directions.B) {
      for (let i = 1; i < 8; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (!inBounds(nr, nc)) break;
        if (!board[nr][nc]) {
          moves.push([nr, nc]);
        } else {
          if ((isW && isBlack(board[nr][nc])) || (isB && isWhite(board[nr][nc])))
            moves.push([nr, nc]);
          break;
        }
      }
    }
  } else if (piece.toLowerCase() === "r") {
    for (const [dr, dc] of directions.R) {
      for (let i = 1; i < 8; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (!inBounds(nr, nc)) break;
        if (!board[nr][nc]) {
          moves.push([nr, nc]);
        } else {
          if ((isW && isBlack(board[nr][nc])) || (isB && isWhite(board[nr][nc])))
            moves.push([nr, nc]);
          break;
        }
      }
    }
  } else if (piece.toLowerCase() === "q") {
    for (const [dr, dc] of directions.Q) {
      for (let i = 1; i < 8; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (!inBounds(nr, nc)) break;
        if (!board[nr][nc]) {
          moves.push([nr, nc]);
        } else {
          if ((isW && isBlack(board[nr][nc])) || (isB && isWhite(board[nr][nc])))
            moves.push([nr, nc]);
          break;
        }
      }
    }
  } else if (piece.toLowerCase() === "k") {
    for (const [dr, dc] of directions.K) {
      const nr = r + dr, nc = c + dc;
      if (
        inBounds(nr, nc) &&
        (!board[nr][nc] ||
          (isW && isBlack(board[nr][nc])) ||
          (isB && isWhite(board[nr][nc])))
      ) {
        moves.push([nr, nc]);
      }
    }
    // No castling
  }
  return moves;
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function resetGame() {
  board = parseFEN(START_FEN);
  turn = "w";
  selected = null;
  legalMoves = [];
  renderBoard();
}

window.addEventListener("DOMContentLoaded", () => {
  resetGame();
  document.getElementById("reset-btn").addEventListener("click", resetGame);
});