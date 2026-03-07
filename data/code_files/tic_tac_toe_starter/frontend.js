const cells = Array.from(document.querySelectorAll(".cell"));
const resetBtn = document.getElementById("reset");
const statusEl = document.getElementById("status");

// global variables to modify!
let board = [
  ["", "", ""],
  ["", "", ""],
  ["", "", ""],
];
let currentPlayer = "X";
let statusMessage = "";

cells.forEach((c) => c.addEventListener("click", (e) => onMove(Number(e.currentTarget.dataset.index))));
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

function update_board_and_status(cellIndex) {
  console.log("update_board_and_status() called at index:", cellIndex);
}

function render_board() {
  console.log("render_board() called");
}

// ——— END: Backend Functions to Implement ———

function onMove(cellIndex) {
  update_board_and_status(cellIndex);
  render_board();
}
