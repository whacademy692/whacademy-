# v12.38 — STUDENT/PUBLIC SITE (repo whacademy692/whacademy-) — logo consistency, login lockup, favicons

Upload everything in this zip at the same paths (repo root). ~121 files: 6 new, the rest are changed.
(115 of them are .html pages: ONLY their favicon <link> lines changed — all pages now use the same absolute icon links.)

NEW:   favicon-48.png, favicon-192.png
CHANGED (real changes): assets/brand.css (login/welcome logo lockup), games/login.html, games/welcome.html,
        games/assets/css/pages/login.css, manifest.json, games/manifest.json
CHANGED (favicon links only): every other .html page

After upload: Ctrl+Shift+R.
GOOGLE: it shows the logo next to whacademypk.com only after it re-crawls. Fast way: Google Search Console >
URL inspection > https://whacademypk.com/ > Request indexing. Usually a few days; Google needs favicon >= 48x48 (now done).
