(function () {
    const STORAGE_KEY = "jash-theme";

    function applyTheme(theme) {
        const isDark = theme === "dark";

        document.body.classList.toggle("dark-mode", isDark);

        const themeToggle = document.getElementById("theme-toggle");

        if (themeToggle) {
            themeToggle.textContent = isDark ? "☀" : "☾";

            themeToggle.setAttribute(
                "aria-label",
                isDark ? "Enable light mode" : "Enable dark mode"
            );

            themeToggle.setAttribute(
                "aria-pressed",
                String(isDark)
            );
        }
    }

    function initializeTheme() {
        const savedTheme = localStorage.getItem(STORAGE_KEY);
        applyTheme(savedTheme === "dark" ? "dark" : "light");

        const themeToggle = document.getElementById("theme-toggle");

        if (themeToggle) {
            themeToggle.addEventListener("click", () => {
                const isDark = document.body.classList.contains("dark-mode");
                const newTheme = isDark ? "light" : "dark";

                localStorage.setItem(STORAGE_KEY, newTheme);
                applyTheme(newTheme);
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeTheme);
    } else {
        initializeTheme();
    }
})();