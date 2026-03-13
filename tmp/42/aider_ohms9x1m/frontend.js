const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

// Game constants
const GRAVITY = 0.7;
const MOVE_SPEED = 3;
const JUMP_POWER = 12;

// Player object
const player = {
    x: 50,
    y: 0,
    w: 32,
    h: 32,
    vx: 0,
    vy: 0,
    onGround: false,
    color: "#222",
    jumpsLeft: 2 // For double jump
};

// Simple level: array of platforms {x, y, w, h}
const platforms = [
    { x: 0, y: 368, w: 640, h: 32 }, // ground
    { x: 120, y: 300, w: 100, h: 16 },
    { x: 300, y: 250, w: 120, h: 16 },
    { x: 500, y: 200, w: 80, h: 16 },
    { x: 400, y: 120, w: 60, h: 16 }
];

// Input state
const keys = {};

// Input listeners
window.addEventListener("keydown", e => {
    keys[e.key.toLowerCase()] = true;
});
window.addEventListener("keyup", e => {
    keys[e.key.toLowerCase()] = false;
});

// Focus canvas for keyboard input
canvas.focus();

// Game loop
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function update() {
    // Horizontal movement
    if (keys["arrowleft"] || keys["a"]) {
        player.vx = -MOVE_SPEED;
    } else if (keys["arrowright"] || keys["d"]) {
        player.vx = MOVE_SPEED;
    } else {
        player.vx = 0;
    }

    // Double jump logic
    if (!update.lastJump) update.lastJump = false;
    const jumpPressed = (keys["arrowup"] || keys["w"] || keys[" "]);
    if (jumpPressed && !update.lastJump && player.jumpsLeft > 0) {
        player.vy = -JUMP_POWER;
        player.onGround = false;
        player.jumpsLeft--;
    }
    update.lastJump = jumpPressed;

    // Apply gravity
    player.vy += GRAVITY;

    // Move player
    player.x += player.vx;
    player.y += player.vy;

    // Platform collision
    let wasOnGround = player.onGround;
    player.onGround = false;
    for (const plat of platforms) {
        if (
            player.x < plat.x + plat.w &&
            player.x + player.w > plat.x &&
            player.y < plat.y + plat.h &&
            player.y + player.h > plat.y
        ) {
            // Collision detected
            // From above
            if (player.vy > 0 && player.y + player.h - player.vy <= plat.y) {
                player.y = plat.y - player.h;
                player.vy = 0;
                player.onGround = true;
            }
            // From below
            else if (player.vy < 0 && player.y - player.vy >= plat.y + plat.h) {
                player.y = plat.y + plat.h;
                player.vy = 0;
            }
            // From left/right: simple stop
            else if (player.x + player.w - player.vx <= plat.x) {
                player.x = plat.x - player.w;
            } else if (player.x - player.vx >= plat.x + plat.w) {
                player.x = plat.x + plat.w;
            }
        }
    }

    // Reset jumpsLeft when landing
    if (!wasOnGround && player.onGround) {
        player.jumpsLeft = 2;
    }

    // Prevent going out of bounds
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > canvas.width) player.x = canvas.width - player.w;
    if (player.y + player.h > canvas.height) {
        player.y = canvas.height - player.h;
        player.vy = 0;
        if (!player.onGround) {
            player.onGround = true;
            player.jumpsLeft = 2;
        }
    }
}

function draw() {
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw platforms
    ctx.fillStyle = "#964B00";
    for (const plat of platforms) {
        ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    }

    // Draw player
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.w, player.h);
}

// Start game
gameLoop();