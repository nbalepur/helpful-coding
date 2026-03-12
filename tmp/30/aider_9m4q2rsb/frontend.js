document.getElementById("alert-btn")?.addEventListener("click", () =>
    console.log("Button clicked!")
);

// --- Platform Game Code ---

const canvas = document.getElementById("game-canvas");
const ctx = canvas?.getContext("2d");

const GAME_WIDTH = 640;
const GAME_HEIGHT = 360;
const GRAVITY = 0.7;
const FRICTION = 0.8;
const MOVE_SPEED = 3.2;
const JUMP_POWER = 12;

const player = {
    x: 50,
    y: 0,
    w: 32,
    h: 32,
    vx: 0,
    vy: 0,
    onGround: false,
    color: "#4FC3F7"
};

const platforms = [
    { x: 0, y: 340, w: 640, h: 20, color: "#888" }, // ground
    { x: 120, y: 260, w: 100, h: 16, color: "#6C6" },
    { x: 300, y: 200, w: 120, h: 16, color: "#C66" },
    { x: 500, y: 140, w: 80, h: 16, color: "#CC6" }
];

const keys = {};

function resetPlayer() {
    player.x = 50;
    player.y = 0;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
}

function rectsCollide(a, b) {
    return (
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
    );
}

function updatePlayer() {
    // Horizontal movement
    if (keys["ArrowLeft"] || keys["a"]) {
        player.vx = -MOVE_SPEED;
    } else if (keys["ArrowRight"] || keys["d"]) {
        player.vx = MOVE_SPEED;
    } else {
        player.vx *= FRICTION;
        if (Math.abs(player.vx) < 0.1) player.vx = 0;
    }

    // Jump
    if ((keys[" "] || keys["ArrowUp"]) && player.onGround) {
        player.vy = -JUMP_POWER;
        player.onGround = false;
    }

    // Apply gravity
    player.vy += GRAVITY;

    // Move player
    player.x += player.vx;
    player.y += player.vy;

    // Platform collision
    player.onGround = false;
    for (const plat of platforms) {
        if (rectsCollide(player, plat)) {
            // Coming down onto platform
            if (player.vy > 0 && player.y + player.h - player.vy <= plat.y) {
                player.y = plat.y - player.h;
                player.vy = 0;
                player.onGround = true;
            }
            // Hitting platform from below
            else if (player.vy < 0 && player.y - player.vy >= plat.y + plat.h) {
                player.y = plat.y + plat.h;
                player.vy = 0;
            }
            // Hitting platform from the side
            else if (player.x + player.w - player.vx <= plat.x) {
                player.x = plat.x - player.w;
                player.vx = 0;
            } else if (player.x - player.vx >= plat.x + plat.w) {
                player.x = plat.x + plat.w;
                player.vx = 0;
            }
        }
    }

    // Boundaries
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > GAME_WIDTH) player.x = GAME_WIDTH - player.w;
    if (player.y + player.h > GAME_HEIGHT) {
        player.y = GAME_HEIGHT - player.h;
        player.vy = 0;
        player.onGround = true;
    }
    if (player.y > GAME_HEIGHT + 100) {
        resetPlayer();
    }
}

function drawPlayer() {
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.w, player.h);
}

function drawPlatforms() {
    for (const plat of platforms) {
        ctx.fillStyle = plat.color;
        ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    }
}

function draw() {
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    drawPlatforms();
    drawPlayer();
}

function gameLoop() {
    updatePlayer();
    draw();
    requestAnimationFrame(gameLoop);
}

if (canvas && ctx) {
    canvas.width = GAME_WIDTH;
    canvas.height = GAME_HEIGHT;
    canvas.focus();

    window.addEventListener("keydown", (e) => {
        keys[e.key] = true;
    });
    window.addEventListener("keyup", (e) => {
        keys[e.key] = false;
    });

    resetPlayer();
    gameLoop();
}