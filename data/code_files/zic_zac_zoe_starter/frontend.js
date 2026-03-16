// HTML elements
const cells = Array.from(document.querySelectorAll(".cell"));
// const statusElement = ...;

// global variables
let board = [
  ["", "", "", "", ""],
  ["", "", "", "", ""],
  ["", "", "", "", ""],
  ["", "", "", "", ""],
  ["", "", "", "", ""],
];
let currentPlayer = "";
let statusMessage = "";

// connect the HTML + JS
cells.forEach((cell) => {
  cell.addEventListener("click", (event) => {
    const index = Number(event.currentTarget.dataset.index);
    onMove(index);
  });
});

// JS functions
function playMove(cellIndex) {
  console.log("User clicked on cell:", cellIndex);
}

function renderBoard() {
  console.log("Displaying the board");
}

function onMove(cellIndex) {
  playMove(cellIndex);
  renderBoard();
}
