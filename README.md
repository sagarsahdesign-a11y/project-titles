# 📋 Project Title Registry — CyberSec FYP

A real-time shared registry for B.Tech Cyber Security final-year project titles.  
Teams submit a title, everyone sees all submissions live, and near-duplicate titles are flagged automatically.

## Features

- ⚡ **Real-time sync** — all open tabs update within ~1 second (Firebase Firestore `onSnapshot`)
- 🔍 **Duplicate detection** — Jaccard keyword similarity flags titles with >35% overlap before submit
- 🗑️ **Remove claims** — any visitor can delete a card (intended for small trusted class group)
- 📱 **Mobile-first** — optimised for 375px (WhatsApp link sharing)
- 🔒 **Firestore rules** — only the `claims` collection is accessible

---

## Getting Started (Local Dev)

### 1. Clone the repo
```bash
git clone https://github.com/sagarsahdesign-a11y/project-titles.git
cd project-titles
npm install
```

### 2. Add your Firebase config
Copy the example env file and fill in your credentials:
```bash
cp .env.example .env
```

Edit `.env` with your real values from:  
**Firebase Console → Project Settings → Your Apps → Web App → Config**

```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXX
```

### 3. Run locally
```bash
npm run dev
```
Open [http://localhost:5173/project-titles/](http://localhost:5173/project-titles/)

---

## Firestore Setup

1. Go to **Firebase Console → Firestore Database → Rules**
2. Paste the contents of [`firestore.rules`](./firestore.rules) and click **Publish**

This locks Firestore so only the `claims` collection is readable/writable.

---

## Deploying to GitHub Pages

### Auto-deploy (recommended)
Every push to `main` triggers the GitHub Actions workflow at  
`.github/workflows/deploy.yml`, which builds the app and pushes to the `gh-pages` branch.

**You must add your Firebase credentials as GitHub Secrets:**
1. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
2. Add each `VITE_FIREBASE_*` variable from your `.env` file

### Manual deploy
```bash
npm run deploy
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Bundler | Vite |
| Database | Firebase Firestore |
| Hosting | GitHub Pages |
| Styling | Vanilla CSS |
| JS | Vanilla ES Modules |
| CI/CD | GitHub Actions |
