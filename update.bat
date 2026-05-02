@echo off
cd /d "E:\Claude Code Projects\Work\Assiments"
echo.
echo [Assignments App] Pushing update...
git add .
git commit -m "Update %date% %time%"
git push
echo.
echo Deploying to Vercel...
call npx vercel --prod
echo.
echo Done! Site will be live in ~30 seconds.
echo.
pause
