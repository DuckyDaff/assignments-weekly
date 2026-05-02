# מערכת שיבוצים שבועיים

ניהול שיבוצים שבועיים למחלקה — React + Vite + Node.js + SQLite.

## מבנה הפרויקט

```
├── backend/        Node.js + Express + SQLite
│   ├── server.js
│   ├── db.js
│   └── data.db     (נוצר אוטומטית)
├── frontend/       React + Vite
│   ├── src/
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── index.html
└── README.md
```

---

## הרצה ראשונה (התקנה)

פתח שני טרמינלים נפרדים:

### טרמינל 1 — Backend

```bash
cd backend
npm install
npm start
```

השרת יעלה על **http://localhost:3001**

### טרמינל 2 — Frontend

```bash
cd frontend
npm install
npm run dev
```

האפליקציה תהיה זמינה על **http://localhost:5173**

---

## גישה מהרשת הפנימית

כאשר ה-Frontend רץ עם `npm run dev`, הוא מאזין על כל הממשקים (`0.0.0.0`).  
עמיתים ברשת הפנימית יכולים לגשת דרך ה-IP של המחשב שלך:

```
http://<IP-של-המחשב>:5173
```

לאיתור ה-IP:
- **Windows:** `ipconfig` → חפש "IPv4 Address"
- **Linux/Mac:** `ip addr` או `hostname -I`

> **הבאקאנד** גם הוא נגיש מהרשת (`0.0.0.0:3001`) כך שהנתונים משותפים לכולם.

---

## הרצה יומית (אחרי ההתקנה הראשונה)

```bash
# טרמינל 1
cd backend && npm start

# טרמינל 2
cd frontend && npm run dev
```

---

## פרטי המערכת

| פרט | ערך |
|-----|-----|
| PIN ברירת מחדל | `1234` |
| בסיס נתונים | `backend/data.json` (JSON file) |
| Backend port | `3001` |
| Frontend port | `5173` |

---

## שינוי ה-PIN

1. כנס כמנהל (לחץ "כניסת מנהל" → `1234`)
2. עבור ל**הגדרות** → **אבטחה**
3. הזן קוד חדש ולחץ **עדכן**

---

## גיבוי הנתונים

כל הנתונים נשמרים בקובץ `backend/data.json`.  
מספיק לגבות קובץ זה.

---

## ייצוא

- **Excel (CSV):** לחץ על "Excel" בלוח השיבוצים — נפתח קובץ CSV בעברית
- **הדפסה:** לחץ "הדפסה" — נפתח עמוד הדפסה מעוצב
