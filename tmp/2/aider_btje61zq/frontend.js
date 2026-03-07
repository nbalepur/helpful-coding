let cookieCount = 0;

function updateCookieCount() {
    const countDiv = document.getElementById("cookie-count");
    if (countDiv) {
        countDiv.textContent = `Cookies: ${cookieCount}`;
    }
}

function handleCookieClick() {
    cookieCount += 1;
    updateCookieCount();
    // Animate cookie
    const cookieImg = document.getElementById("cookie-img");
    if (cookieImg) {
        cookieImg.style.transform = "scale(0.9)";
        setTimeout(() => {
            cookieImg.style.transform = "scale(1)";
        }, 100);
    }
}

document.getElementById("cookie-btn")?.addEventListener("click", handleCookieClick);

window.addEventListener("DOMContentLoaded", updateCookieCount);