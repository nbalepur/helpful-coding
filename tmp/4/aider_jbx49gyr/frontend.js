/**
 * Minimalist Wordle implementation
 * - 5-letter word
 * - 6 guesses
 * - No dictionary check (for simplicity)
 */

const WORDS = [
  "apple", "grape", "peach", "lemon", "mango", "berry", "melon", "plumb", "olive", "guava",
  "pride", "crane", "flame", "sugar", "brave", "quiet", "table", "chair", "light", "night"
];

// Pick a word from the predefined list
const ANSWER = WORDS[Math.floor(Math.random() * WORDS.length)].toUpperCase();
const MAX_GUESSES = 6;
let guesses = [];

const board = document.getElementById('game-board');
const form = document.getElementById('guess-form');
const input = document.getElementById('guess-input');
const message = document.getElementById('message');

function renderBoard() {
  board.innerHTML = '';
  for (let i = 0; i < MAX_GUESSES; i++) {
    const row = document.createElement('div');
    row.className = 'word-row';
    const guess = guesses[i] || '';
    for (let j = 0; j < 5; j++) {
      const box = document.createElement('div');
      box.className = 'letter-box';
      if (guess[j]) {
        box.textContent = guess[j];
        if (guesses[i]) {
          if (ANSWER[j] === guess[j]) {
            box.classList.add('correct');
          } else if (ANSWER.includes(guess[j])) {
            // Count occurrences for yellow/green logic
            const answerArr = ANSWER.split('');
            const guessArr = guess.split('');
            let correctCount = 0, presentCount = 0;
            for (let k = 0; k < 5; k++) {
              if (guessArr[k] === guess[j] && guessArr[k] === answerArr[k]) correctCount++;
              if (answerArr[k] === guess[j]) presentCount++;
            }
            // If not enough greens, show yellow
            let guessSoFar = 0, greenSoFar = 0;
            for (let k = 0; k < j; k++) {
              if (guessArr[k] === guess[j]) guessSoFar++;
              if (guessArr[k] === guess[j] && answerArr[k] === guess[j]) greenSoFar++;
            }
            if (guessSoFar < presentCount - correctCount + greenSoFar) {
              box.classList.add('present');
            } else {
              box.classList.add('absent');
            }
          } else {
            box.classList.add('absent');
          }
        }
      }
      row.appendChild(box);
    }
    board.appendChild(row);
  }
}

function showMessage(msg, color = "#d32f2f") {
  message.textContent = msg;
  message.style.color = color;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const guess = input.value.trim().toUpperCase();
  if (!/^[A-Z]{5}$/.test(guess)) {
    showMessage("Enter a valid 5-letter word.");
    return;
  }
  if (guesses.length >= MAX_GUESSES) return;
  guesses.push(guess);
  renderBoard();
  input.value = '';
  if (guess === ANSWER) {
    showMessage("Congratulations! You guessed it!", "#388e3c");
    input.disabled = true;
    form.querySelector('button').disabled = true;
  } else if (guesses.length === MAX_GUESSES) {
    showMessage(`Out of guesses! The word was ${ANSWER}.`);
    input.disabled = true;
    form.querySelector('button').disabled = true;
  } else {
    showMessage('');
  }
});

input.addEventListener('input', () => {
  input.value = input.value.replace(/[^a-zA-Z]/g, '').slice(0, 5);
});

renderBoard();
input.focus();