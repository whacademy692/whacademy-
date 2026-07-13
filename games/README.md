# W.H. Academy — Games Frontend

## GitHub par kaise daalein

Yeh poora **`games`** folder repo ke root mein daal do:

```
whacademy-/
├── index.html      ← Main Website zip se
├── sitemap.xml     ← Main Website zip se
├── faculty.html
├── terms.html
└── games/          ← YEH FOLDER
    ├── welcome.html
    ├── login.html
    ├── dashboard.html
    └── ...
```

**Kuch edit karne ki zarurat nahi.** `api.js` mein URL aur key pehle se bhare hue hain.

## Live URL
`whacademy692.github.io/whacademy-/games/welcome.html`

## Yahan koi index.html NAHI hai
Aap ki main website ka `index.html` protect karne ke liye:
- Landing → **welcome.html**
- Chapter → **chapter.html**

## Naya chapter add karna ho toh
Sirf 2 cheezein badalti hain:
1. Naya chapter folder (content.json + 3 files)
2. `assets/js/games.js` — us mein chapter ki list hai

Backend ko haath lagane ki zarurat nahi.
