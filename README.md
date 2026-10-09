# Abhigam — AI & IoT Smart Gate Pass Management System (GPMS)

Production full-stack gate-pass management platform for JNN INSTITUTE with real-time mobile push notifications, instant direct sign-in, Render cloud hosting blueprint, and native Android APK generation.

## Features

- **Instant Authentication (No OTP):** Instant registration and login without OTP friction. Users sign in immediately with email & password.
- **Mobile Application & APK:** PWA app shell, native mobile bottom navigation, and Capacitor Android project to build `app-debug.apk`.
- **Real-Time Mobile Push Notifications:** Automatic notifications triggered when passes are approved, rejected, exited, or returned safely.
- **SMS Integration:** Instant Fast2SMS alerts dispatched directly to parents on student campus departure and return.
- **Hierarchical Role-Based Approvals:** Multi-level sequential routing for Students, Class Incharges, HODs, Wardens, Principal (Dr. G. Mohanbabu), and Campus Security.
- **Single-Use Dynamic QR Tokens:** Cryptographically signed time-bound QR passes scanned at gate terminals.

---

## 1. Run Locally

```powershell
.\start.bat
```
*(Or launch manually)*:

**Backend:**
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python seed.py
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

- Web App: `http://localhost:5173`
- Backend API Docs: `http://localhost:8000/docs`

Demo Accounts (Password: `DemoPass123!`):
- Student: `student@jnn.edu.in`
- Class Incharge: `incharge@jnn.edu.in`
- HOD: `hod.aids@jnn.edu.in`
- Principal: `principal@jnn.edu.in` (Dr. G. Mohanbabu)
- Warden: `warden@jnn.edu.in`
- Security Gate: `security@jnn.edu.in`

---

## 2. Real-Time Cloud Hosting on Render

The repository contains [`render.yaml`](./render.yaml).

1. Push your repository to **GitHub**.
2. Go to [Render Dashboard](https://dashboard.render.com/) $\rightarrow$ **New** $\rightarrow$ **Blueprint**.
3. Select this repository. Render automatically reads `render.yaml` and provisions:
   - **Backend Web Service (`abhigam-gpms-backend`)**: Python FastAPI served with Uvicorn.
   - **Frontend Static Site (`abhigam-gpms-frontend`)**: React Vite SPA with SPA routing rewrites.
4. Once deployed, Render provides live public URLs (e.g. `https://abhigam-gpms-frontend.onrender.com`).

---

## 3. Generate Android APK

You can build the native Android `.apk` using either method:

### Method A: Local 1-Click Build
Double-click [`build-apk.bat`](./build-apk.bat) or run in PowerShell:
```powershell
.\build-apk.bat
```
The compiled APK will be generated at:
`frontend\android\app\build\outputs\apk\debug\app-debug.apk`

*(Or open in Android Studio)*:
```powershell
cd frontend
npx.cmd cap open android
```

### Method B: Automated Cloud Build via GitHub Actions
Push your project to GitHub. The included workflow [`.github/workflows/build-apk.yml`](./.github/workflows/build-apk.yml) automatically compiles the APK and attaches `abhigam-gpms-debug-apk` under GitHub Actions Artifacts for download.
