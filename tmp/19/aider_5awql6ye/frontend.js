/**
 * Simple HTML5 Canvas Platformer Game
 * Controls: Arrow keys or WASD to move and jump
 */

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// Game constants
const GRAVITY = 0.5;
const FRICTION = 0.8;
const PLAYER_SPEED = 3;
const JUMP_POWER = 10;

// Level data: platforms (x, y, width, height)
const platforms = [
    { x: 0, y: 340, w: 640, h: 20 }, // ground
    { x: 80, y: 270, w: 120, h: 16 },
    { x: 260, y: 210, w: 100, h: 16 },
    { x: 420, y: 150, w: 120, h: 16 },
    { x: 540, y: 90, w: 60, h: 16 }
];

// Goal
const goal = { x: 570, y: 50, w: 40, h: 40 };

// Player state
let player, keys, gameState;

function resetGame() {
    player = {
        x: 30,
        y: 300,
        w: 32,
        h: 32,
        vx: 0,
        vy: 0,
        onGround: false
    };
    keys = {
        left: false,
        right: false,
        up: false
    };
    gameState = "playing"; // "playing", "won"
}

resetGame();

function draw() {
    // Clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Draw background
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Draw platforms
    ctx.fillStyle = "#888";
    for (const pf of platforms) {
        ctx.fillRect(pf.x, pf.y, pf.w, pf.h);
    }

    // Draw goal
    ctx.fillStyle = "#ff0";
    ctx.fillRect(goal.x, goal.y, goal.w, goal.h);
    ctx.strokeStyle = "#cc0";
    ctx.strokeRect(goal.x, goal.y, goal.w, goal.h);

    // Draw player
    ctx.fillStyle = "#3af";
    ctx.fillRect(player.x, player.y, player.w, player.h);

    // Win text
    if (gameState === "won") {
        ctx.font = "bold 32px system-ui, sans-serif";
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.fillText("You Win!", WIDTH / 2, HEIGHT / 2 - 20);
        ctx.font = "20px system-ui, sans-serif";
        ctx.fillText("Press Restart to play again", WIDTH / 2, HEIGHT / 2 + 20);
    }
}

function update() {
    if (gameState !== "playing") return;

    // Horizontal movement
    if (keys.left) {
        player.vx = -PLAYER_SPEED;
    } else if (keys.right) {
        player.vx = PLAYER_SPEED;
    } else {
        player.vx *= FRICTION;
        if (Math.abs(player.vx) < 0.1) player.vx = 0;
    }

    // Jump
    if (keys.up && player.onGround) {
        player.vy = -JUMP_POWER;
        player.onGround = false;
    }

    // Gravity
    player.vy += GRAVITY;

    // Move player
    player.x += player.vx;
    player.y += player.vy;

    // Collision detection
    player.onGround = false;
    for (const pf of platforms) {
        // AABB collision
        if (
            player.x < pf.x + pf.w &&
            player.x + player.w > pf.x &&
            player.y < pf.y + pf.h &&
            player.y + player.h > pf.y
        ) {
            // From above
            if (player.vy > 0 && player.y + player.h - player.vy <= pf.y) {
                player.y = pf.y - player.h;
                player.vy = 0;
                player.onGround = true;
            }
            // From below
            else if (player.vy < 0 && player.y - player.vy >= pf.y + pf.h) {
                player.y = pf.y + pf.h;
                player.vy = 0;
            }
            // From left/right
            else if (player.x + player.w - player.vx <= pf.x) {
                player.x = pf.x - player.w;
                player.vx = 0;
            } else if (player.x - player.vx >= pf.x + pf.w) {
                player.x = pf.x + pf.w;
                player.vx = 0;
            }
        }
    }

    // Win condition
    if (
        player.x < goal.x + goal.w &&
        player.x + player.w > goal.x &&
        player.y < goal.y + goal.h &&
        player.y + player.h > goal.y
    ) {
        gameState = "won";
    }

    // Prevent going out of bounds
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > WIDTH) player.x = WIDTH - player.w;
    if (player.y + player.h > HEIGHT) {
        player.y = HEIGHT - player.h;
        player.vy = 0;
        player.onGround = true;
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Keyboard controls
function handleKey(e, isDown) {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = isDown;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = isDown;
    if (e.code === "ArrowUp" || e.code === "KeyW" || e.code === "Space") keys.up = isDown;
    // Prevent scrolling
    if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyW"].includes(e.code)
    ) {
        e.preventDefault();
    }
}

canvas.addEventListener("keydown", (e) => handleKey(e, true));
canvas.addEventListener("keyup", (e) => handleKey(e, false));
canvas.setAttribute("tabindex", "0");
canvas.focus();

document.getElementById("restart-btn").addEventListener("click", () => {
    resetGame();
    canvas.focus();
});

gameLoop();