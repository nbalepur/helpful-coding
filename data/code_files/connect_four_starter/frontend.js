const resetBtn = document.getElementById("reset");
const statusEl = document.getElementById("status");
const colButtons = Array.from(document.querySelectorAll(".colbtn"));

const ROWS = 6;
const COLS = 7;

// global variables to modify!
let board = Array(ROWS * COLS).fill("");
let currentPlayer = "R";
let statusMessage = "";

colButtons.forEach((btn) => btn.addEventListener("click", () => onMove(Number(btn.dataset.col))));
resetBtn.addEventListener("click", () => {
  console.log("Reset clicked");
  reset_board();
  render_board();
});

reset_board();
render_board();

// ——— START: Backend Functions to Implement ———
function reset_board() {
  console.log("reset_board() called");
}

function update_board_and_status(col) {
  console.log("update_board_and_status() called at column:", col);
}

function render_board() {
  console.log("render_board() called");
}

// ——— END: Backend Functions to Implement ———

function onMove(col) {
  update_board_and_status(col);
  render_board();
}
