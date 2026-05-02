@echo off
cd /d "E:\Claude Code Projects\Work\Assiments"
echo.
echo ============================================
echo  ASSIGNMENTS APP - DEPLOY SETUP
echo ============================================
echo.

echo [1/4] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
  echo ERROR: npm install failed
  pause
  exit /b 1
)

echo.
echo [2/4] Logging into GitHub...
"C:\Program Files\GitHub CLI\gh.exe" auth login --web --git-protocol https
if %errorlevel% neq 0 (
  echo ERROR: GitHub login failed
  pause
  exit /b 1
)

echo.
echo [3/4] Creating GitHub repository...
git init
git add .
git commit -m "Initial commit - Assignments App"
"C:\Program Files\GitHub CLI\gh.exe" repo create assignments-weekly --public --source=. --remote=origin --push
if %errorlevel% neq 0 (
  echo Repo may already exist, pushing...
  git push -u origin master
)

echo.
echo [4/4] Deploying to Vercel...
call npx vercel --yes --prod
if %errorlevel% neq 0 (
  echo ERROR: Vercel deploy failed
  pause
  exit /b 1
)

echo.
echo ============================================
echo  SUCCESS! Your site is live!
echo.
echo  IMPORTANT - Setup KV database:
echo  1. Go to vercel.com/dashboard
echo  2. Open your project
echo  3. Storage tab -> Create KV Store
echo  4. Name it: assignments-kv
echo  5. Click Connect to Project
echo  6. Run update.bat once more to redeploy
echo ============================================
pause
