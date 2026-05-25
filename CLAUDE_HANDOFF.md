# EmessA CMMS — Android App — ملف التسليم الكامل

## هوية المشروع

| | |
|--|--|
| **المشروع** | تطبيق Android لإدارة قسم الصيانة |
| **الشركة** | EMESSA DENIM CO. — مصنع غزل ونسيج — مصر |
| **صاحب المشروع** | Mohamed Aboud — مهندس صيانة |
| **إيميل** | mohamedabod696@gmail.com |
| **الباكند** | EmessA CMMS Pro — Node.js/Express/SQLite — يشتغل على كمبيوتر Windows في المصنع |
| **Git Branch** | `claude/maintenance-dept-app-r335s` |
| **Repository** | `mohamedabod/Abod` |
| **APK في الـ repo** | `app-arm64-v8a-release.apk` (arm64، 32MB) |

---

## Tech Stack

```
React Native 0.73.6
Expo SDK ~50.0.0
Navigation: @react-navigation/native + bottom-tabs + stack
HTTP: axios (interceptor يضيف baseURL + JWT تلقائياً)
Storage: AsyncStorage (token + server_url) + expo-sqlite (offline)
State: React Context API فقط (AuthContext + NetworkContext)
RTL: I18nManager.forceRTL(true) في App.js
```

### المكتبات الرئيسية
```
expo-camera ~14.1.3          — مسح QR
expo-image-picker ~14.7.1    — رفع صور
expo-notifications ~0.27.8   — push notifications
expo-location ~16.5.5        — GPS تتبع
expo-task-manager ~11.8.2    — background location task
expo-av ~13.10.6             — تسجيل وتشغيل صوت في الشات
expo-sqlite ~13.4.0          — offline storage
expo-file-system ~16.0.9     — تحميل APK للتحديث
expo-intent-launcher ~10.10.0 — تثبيت APK من داخل التطبيق
expo-task-manager ~11.8.2    — background location
@react-native-community/netinfo ^12.0.1 — كشف الإنترنت
react-native-chart-kit ^6.12.0 — الرسوم البيانية
react-native-maps 1.10.0     — خريطة (مستقبلاً)
socket.io-client ^4.8.1      — chat real-time (جاهز، مش مفعّل)
```

---

## هيكل الملفات

```
/home/user/Abod/
├── App.js                          ← نقطة الدخول
├── metro.config.js                 ← يشيل @anthropic-ai/sdk من Metro
├── src/
│   ├── context/
│   │   ├── AuthContext.js          ← login/logout/token/push-token
│   │   └── NetworkContext.js       ← online/offline/sync queue
│   ├── navigation/
│   │   └── AppNavigator.js         ← كل الـ stacks والـ tabs
│   ├── services/
│   │   └── api.js                  ← كل الـ API calls
│   ├── components/
│   │   ├── OfflineBanner.js        ← شريط أحمر عند انقطاع النت
│   │   ├── UpdateDialog.js         ← نافذة تحديث OTA
│   │   ├── PhotoPicker.js          ← اختيار صور (كاميرا + جاليري)
│   │   └── PartsUsedPicker.js      ← اختيار قطع غيار لأمر شغل
│   ├── screens/
│   │   ├── Auth/
│   │   │   ├── LoginScreen.js
│   │   │   └── ServerConfigScreen.js  ← إعداد IP + بحث تلقائي
│   │   ├── Dashboard/
│   │   │   └── DashboardScreen.js
│   │   ├── Requests/
│   │   │   ├── RequestsListScreen.js
│   │   │   ├── RequestDetailScreen.js
│   │   │   └── NewRequestScreen.js
│   │   ├── Technicians/
│   │   │   ├── TechniciansListScreen.js
│   │   │   ├── TechnicianDetailScreen.js
│   │   │   └── NewTechnicianScreen.js
│   │   ├── Equipment/
│   │   │   ├── EquipmentListScreen.js
│   │   │   ├── EquipmentDetailScreen.js
│   │   │   └── NewEquipmentScreen.js
│   │   ├── PM/
│   │   │   ├── PMScreen.js
│   │   │   └── Predictive/PredictiveScreen.js
│   │   ├── Inventory/
│   │   │   └── InventoryScreen.js
│   │   ├── Reports/
│   │   │   ├── ReportsScreen.js
│   │   │   └── FailureAnalysisScreen.js
│   │   ├── Analytics/
│   │   │   └── WrenchTimeScreen.js
│   │   ├── QR/
│   │   │   ├── QRScannerScreen.js      ← يفتح كاميرا ويقرأ QR
│   │   │   ├── QuickReportScreen.js    ← بلاغ عطل بدون login
│   │   │   └── QRCodeScreen.js         ← عرض QR كل الأصول
│   │   ├── Checklist/
│   │   │   ├── ChecklistScreen.js      ← الفني يملأ قائمة التحقق
│   │   │   └── ApprovalScreen.js       ← المهندس يعتمد
│   │   ├── Chat/
│   │   │   ├── ChatListScreen.js
│   │   │   ├── ChatRoomScreen.js       ← نص + صوت
│   │   │   └── NewChatScreen.js
│   │   ├── Location/
│   │   │   └── LocationTrackingScreen.js ← GPS + background task
│   │   ├── AI/
│   │   │   └── AIAssistantScreen.js    ← تشخيص عبر الباكند
│   │   └── Profile/
│   │       └── ProfileScreen.js
│   └── utils/
│       ├── appUpdater.js   ← OTA — يحمّل APK جديد من السيرفر
│       ├── notifications.js
│       ├── offline.js      ← SQLite queue للأوفلاين
│       └── emptyShim.js    ← shim لـ node:fs في Metro
├── android/
│   ├── app/
│   │   ├── build.gradle            ← versionCode/Name + signing config
│   │   ├── emessa-release.keystore ← keystore ثابت (صالح 27 سنة)
│   │   └── src/main/AndroidManifest.xml
│   └── build.gradle
```

---

## Navigation Structure

```
AuthStack (قبل Login)
  ├── Login
  └── ServerConfig

MainTabs (6 Bottom Tabs بعد Login)
  ├── Dashboard Tab
  │   └── DashboardStack
  │       ├── DashboardHome  (الرئيسي)
  │       ├── PM
  │       ├── Predictive
  │       ├── Inventory
  │       ├── Profile
  │       ├── QRScanner
  │       ├── QuickReport
  │       ├── WrenchTime
  │       └── AIAssistant
  │
  ├── Requests Tab
  │   └── RequestsStack
  │       ├── RequestsList
  │       ├── RequestDetail
  │       ├── NewRequest
  │       ├── Checklist
  │       └── Approval
  │
  ├── Technicians Tab
  │   └── TechniciansStack
  │       ├── TechniciansList
  │       ├── TechnicianDetail
  │       ├── NewTechnician
  │       └── LocationTracking
  │
  ├── Equipment Tab
  │   └── EquipmentStack
  │       ├── EquipmentList
  │       ├── EquipmentDetail
  │       ├── NewEquipment
  │       ├── QRCode
  │       └── AIAssistant
  │
  ├── Reports Tab
  │   └── ReportsStack
  │       ├── ReportsList
  │       ├── FailureAnalysis
  │       └── WrenchTime
  │
  └── Chat Tab
      └── ChatStack
          ├── ChatList
          ├── ChatRoom
          └── NewChat

Push Notification tap → ينتقل لـ RequestDetail بـ wo_id
```

---

## State Management

### AuthContext — `src/context/AuthContext.js`
```javascript
// State
user        // بيانات المستخدم الحالي { id, name, email, role }
token       // JWT token
loading     // هل لسه بيتحمل من AsyncStorage

// Methods
login(email, password)   // POST /api/auth/login → حفظ token + تسجيل push token
logout()                 // مسح token + مسح location من السيرفر + إيقاف GPS

// Constants
LOCATION_TASK = 'background-location'  // مشترك مع LocationTrackingScreen

// AsyncStorage Keys
'auth_token'    // JWT
'server_url'    // http://192.168.1.X:5000
```

### NetworkContext — `src/context/NetworkContext.js`
```javascript
// State
isOnline      // bool
syncing       // bool
pendingCount  // عدد الطلبات المنتظرة للـ sync

// Methods
runSync()   // يبعت الطلبات المحفوظة أوفلاين
```

---

## Authentication Flow

```
1. ServerConfigScreen → يحفظ server_url في AsyncStorage
2. LoginScreen → POST /api/auth/login → { token, user }
3. token يتحفظ في AsyncStorage 'auth_token'
4. AuthContext يسجّل Expo Push Token تلقائياً بعد login
5. كل request: axios interceptor يضيف:
   - config.baseURL = AsyncStorage.getItem('server_url')
   - Authorization: Bearer TOKEN
6. عند فتح App: GET /api/auth/me لتجديد بيانات المستخدم
   - لو فشل → logout تلقائي (token منتهي)
7. Logout:
   - DELETE /api/location/me
   - إيقاف background GPS task
   - مسح AsyncStorage
```

---

## API Endpoints الكاملة

**BASE:** `AsyncStorage('server_url')` — default: `http://localhost:5000`
**Auth header:** `Authorization: Bearer {token}` على كل endpoint ما عدا المذكور

### Authentication
```
POST /api/auth/login          { email, password } → { token, user }  ❌ no auth
GET  /api/auth/me             → { user }
POST /api/auth/change-password { current, next }
POST /api/auth/push-token     { token: expoToken }
```

### Dashboard
```
GET /api/dashboard    → { open_wos, overdue_pm, low_stock, ... }
GET /api/kpis         → { mttr, pm_compliance, availability, wrench_time_pct }
```

### Work Orders
```
GET    /api/workorders              params: status, assigned_to, priority
GET    /api/workorders/:id
POST   /api/workorders              { title, description, asset_id, priority, assigned_to }
PUT    /api/workorders/:id
PATCH  /api/workorders/:id/status   { status, message }
PATCH  /api/workorders/:id/checklist { checklist: [{id,label,done,value,note}], tech_notes }
DELETE /api/workorders/:id
GET    /api/workorders/stats/summary
```

### Assets / Equipment
```
GET    /api/assets         params: category
GET    /api/assets/:id
POST   /api/assets         { name, code, category, location, ... }
PUT    /api/assets/:id
DELETE /api/assets/:id
```

### Preventive Maintenance
```
GET   /api/pm
GET   /api/pm/overdue
GET   /api/pm/upcoming     params: days (default 7)
PATCH /api/pm/:id/complete { notes }
```

### Inventory
```
GET   /api/inventory
GET   /api/inventory/low-stock
PATCH /api/inventory/:id/qty  { delta, reason }
```

### Staff / HR
```
GET    /api/hr/staff       params: active
POST   /api/hr/staff       { name, email, role, department, specialization }
PUT    /api/hr/staff/:id
DELETE /api/hr/staff/:id
GET    /api/hr/summary
```

### Chat
```
GET  /api/chat/rooms
POST /api/chat/rooms              { name, is_group, members: [user_id] }
GET  /api/chat/rooms/:id/messages
POST /api/chat/messages           { room_id, text }
POST /api/chat/voice              FormData: { room_id, voice (audio/m4a), duration }
```

### Reports & Analytics
```
GET /api/reports/failure-patterns  params: days, min_count
GET /api/reports/wrench-time       params: days
GET /api/reports/oee               params: days
```

### Predictions
```
GET /api/predictions  params: days (default 90)
→ [{ asset_id, asset_name, risk_level, failure_count, mtbf_days, recommendation }]
```

### Location (GPS Tracking)
```
POST   /api/location/update   { latitude, longitude, accuracy, area_label }
GET    /api/location/current  → [{ user_id, name, lat, lng, updated_at }]
GET    /api/location/history/:techId
DELETE /api/location/me       ← عند logout
```

### AI Assistant
```
POST /api/ai/diagnose  { message, history: [{role,content}] }
→ { reply: string }
← الباكند يتصل بـ Claude API بنفسه (ANTHROPIC_API_KEY في env السيرفر)
```

### Public (بدون Auth)
```
POST /api/public/report   { asset_id, issue_type, description }  ❌ no auth
GET  /report?asset=ID     ← HTML form في المتصفح                 ❌ no auth
```

### Server Info
```
GET /api/server-info  → { hostname, ips, port, version, company }
← يُستخدم للتحقق من الاتصال في ServerConfigScreen
← 401 من هذا الـ endpoint = السيرفر شغال (عادي قبل login)
```

### OTA Update
```
GET  /api/app-version  → { version, build, apk_url, changelog }
GET  /app/emessa-cmms.apk  ← static file
```

---

## Android Config

```
applicationId:    com.maintenance.dept.app
versionCode:      1
versionName:      1.0.0
minSdk:           23 (Android 6.0)
targetSdk:        34
compileSdk:       34
ndkVersion:       25.1.8937393
buildToolsVersion: 34.0.0

Signing:
  keystore:   android/app/emessa-release.keystore
  alias:      emessa
  password:   emessa2024
  validity:   10,000 days (~27 years)
  ← ثابت في الـ repo، ضروري عشان التحديثات تشتغل بدون إعادة تثبيت

Permissions في AndroidManifest:
  INTERNET, READ/WRITE_EXTERNAL_STORAGE, SYSTEM_ALERT_WINDOW
  VIBRATE, CAMERA, RECORD_AUDIO
  ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, ACCESS_BACKGROUND_LOCATION
  FOREGROUND_SERVICE, RECEIVE_BOOT_COMPLETED
  POST_NOTIFICATIONS, REQUEST_INSTALL_PACKAGES

usesCleartextTraffic="true"  ← ضروري للـ HTTP على Android 9+
```

---

## Build Instructions

```bash
# Prerequisites
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME=/opt/android-sdk

# Build release APK
cd android
./gradlew assembleRelease --no-daemon

# Output files:
# android/app/build/outputs/apk/release/app-arm64-v8a-release.apk  ← هواتف حديثة
# android/app/build/outputs/apk/release/app-armeabi-v7a-release.apk ← هواتف قديمة

# توصيل APK للمستخدم:
# 1. انسخ APK للـ root: cp android/.../app-arm64-v8a-release.apk .
# 2. git add -f app-arm64-v8a-release.apk && git commit && git push
# 3. اعمل QR للرابط: npx qrcode -o /tmp/apk-qr.png "https://github.com/mohamedabod/Abod/raw/claude/maintenance-dept-app-r335s/app-arm64-v8a-release.apk"
# 4. ابعت الـ QR للمستخدم يمسحه بالكاميرا
```

---

## OTA Update System

التطبيق يتحقق من تحديثات تلقائياً كل مرة يفتح (بعد 3 ثواني).

**Flow:**
1. App يفتح → `checkForUpdate()` في `src/utils/appUpdater.js`
2. يسأل `GET /api/app-version` → `{ version, build, apk_url, changelog }`
3. لو `build > CURRENT_BUILD` → يظهر `UpdateDialog`
4. المستخدم يضغط "تحديث الآن" → يحمّل APK من `apk_url`
5. بار تقدم يظهر، بعد التحميل نظام Android يفتح مباشرة للتثبيت

**إصدار تحديث جديد (من الباكند):**
```javascript
// app-files/version.json على سيرفر EmessA
{ "version": "1.0.1", "build": 2, "apk_url": "http://IP:5000/app/emessa-cmms.apk", "changelog": "..." }
// ضع APK الجديد في app-files/emessa-cmms.apk
```

**CURRENT_BUILD في الكود:** `src/utils/appUpdater.js` سطر 4 — يجب تحديثه مع كل build.

---

## Background GPS Task

```javascript
// src/context/AuthContext.js
export const LOCATION_TASK = 'background-location';

// src/screens/Location/LocationTrackingScreen.js
TaskManager.defineTask(LOCATION_TASK, async ({ data }) => {
  // يبعت الموقع لـ POST /api/location/update كل دقيقة
});

// يشتغل حتى لو التطبيق في الخلفية
// يوقف تلقائياً عند logout
```

---

## ميزات المشروع الكاملة

### مكتملة ✅
- Login / Logout / Session recovery
- Server auto-discovery (بيبحث عن EmessA على الشبكة تلقائياً)
- Dashboard + KPIs
- Work Orders: إنشاء / تعديل / حذف / تغيير status
- قائمة التحقق (Checklist) + اعتماد المهندس (Approval)
- Assets / Equipment: CRUD
- Preventive Maintenance: جدولة + إغلاق
- Inventory: عرض + تعديل كميات
- Staff / Technicians: CRUD
- QR Scanner: يقرأ `emessa://asset/ID` و `emessa://report/ID`
- Quick Report: بلاغ عطل بدون login (للعمال)
- QR Code Generator: عرض QR لكل الأصول مع رابط المتصفح
- Chat: نص + صوت + مجموعات
- Offline Mode: حفظ في SQLite + مزامنة تلقائية عند العودة للنت
- Push Notifications: تسجيل token عند login
- Location Tracking: GPS foreground + background
- Failure Analysis: تحليل أنماط الأعطال المتكررة
- Wrench Time Analytics: نسبة وقت العمل الفعلي
- Predictive Maintenance: توقعات الأعطال
- AI Assistant: تشخيص عبر Claude API (يمر بالباكند)
- OTA Updates: تحديث تلقائي بدون نزول APK جديد

### يحتاج باكند (UI جاهز) ⚠️
| Feature | Endpoint مطلوب |
|---------|----------------|
| AI Diagnosis | `POST /api/ai/diagnose` + `ANTHROPIC_API_KEY` |
| Wrench Time | `GET /api/reports/wrench-time` مع بيانات timing حقيقية |
| Predictive | `GET /api/predictions` (يحتاج 3 شهور بيانات) |
| Voice Chat | `POST /api/chat/voice` + static file serving |
| Anonymous Report | `POST /api/public/report` + `GET /report?asset=ID` |
| OTA Update | `GET /api/app-version` + static APK serving |
| Location Map | خريطة حية (يحتاج Google Maps API key) |

---

## Backend Endpoints اللي مش متربطة بشاشات لحد دلوقتي

```
GET /api/workorders/stats/summary   ← معرّف، مش مستخدم
GET /api/reports/oee                ← معرّف، مفيش شاشة OEE
GET /api/location/history/:techId   ← معرّف، مفيش شاشة replay مسار
PUT /api/workorders/:id             ← معرّف، الـ app بيستخدم PATCH فقط
DELETE /api/workorders/:id          ← معرّف، مفيش زرار حذف في الشاشة
DELETE /api/assets/:id              ← نفس الموضوع
DELETE /api/hr/staff/:id            ← نفس الموضوع
```

---

## مشاكل معروفة وحلولها

| المشكلة | السبب | الحل |
|---------|-------|------|
| 401 عند اختبار الاتصال | `/api/server-info` يحتاج auth | الـ app دلوقتي بيعامل 401 كـ "السيرفر شغال" ✅ |
| @anthropic-ai/sdk في Metro | يستخدم node:fs | `metro.config.js` بيحجبه + AIAssistantScreen يتصل بالباكند مش مباشرة ✅ |
| APK signing مختلف كل build | debug.keystore يتجدد مع كل container | `emessa-release.keystore` ثابت في الـ repo ✅ |
| expo-task-manager v56 | incompatible مع SDK 50 | نزّلنا v11.8.2 ✅ |
| useDefaultAndroidSdkVersions missing | غير موجودة في expo-modules-core المعدّلة | أضفناها في ExpoModulesCorePlugin.gradle ✅ |

---

## طريقة توصيل APK للمستخدم

```bash
# بعد كل build:
cp android/app/build/outputs/apk/release/app-arm64-v8a-release.apk .
git add -f app-arm64-v8a-release.apk && git commit -m "release: vX.X" && git push

# اعمل QR:
npx qrcode -o /tmp/apk-qr.png "https://github.com/mohamedabod/Abod/raw/claude/maintenance-dept-app-r335s/app-arm64-v8a-release.apk"
# ابعت الصورة للمستخدم — يمسح QR بالكاميرا — التحميل يبدأ مباشرة
```

---

## متطلبات الباكند على EmessA CMMS Pro

### إضافة للـ server.js
```javascript
// 1. OTA Update
const fs = require('fs');
app.get('/api/app-version', authMiddleware, (req, res) => {
  res.json(JSON.parse(fs.readFileSync('./app-files/version.json')));
});
app.use('/app', express.static('./app-files'));

// 2. AI Diagnosis (يحتاج: npm install @anthropic-ai/sdk)
const Anthropic = require('@anthropic-ai/sdk');
app.post('/api/ai/diagnose', authMiddleware, async (req, res) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { message, history = [] } = req.body;
  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message }
  ];
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'أنت مساعد ذكاء اصطناعي متخصص في صيانة المعدات الصناعية. أجب دائماً بالعربية.',
    messages
  });
  res.json({ reply: response.content[0].text });
});

// 3. Anonymous Report
app.post('/api/public/report', async (req, res) => {
  const { asset_id, issue_type, description } = req.body;
  const priority = issue_type === 'stopped' ? 'urgent' : issue_type === 'leak' ? 'high' : 'medium';
  // أنشئ work order جديد في SQLite
  res.json({ success: true });
});

// 4. Location cleanup
app.delete('/api/location/me', authMiddleware, (req, res) => {
  db.run('DELETE FROM technician_locations WHERE user_id = ?', [req.user.id]);
  res.json({ success: true });
});

// 5. Checklist save
app.patch('/api/workorders/:id/checklist', authMiddleware, (req, res) => {
  const { checklist, tech_notes } = req.body;
  db.run('UPDATE workorders SET checklist = ?, tech_notes = ? WHERE id = ?',
    [JSON.stringify(checklist), tech_notes, req.params.id]);
  res.json({ success: true });
});
```

### متغيرات البيئة (.env)
```
ANTHROPIC_API_KEY=sk-ant-...   ← للـ AI Assistant
PORT=5000
JWT_SECRET=...
```

---

## Git History الأساسي

```
a9da9bb  fix: use permanent release keystore for consistent APK signing
22979a6  feat: OTA update system — app checks backend for new version on startup
41a2254  feat: auto-discover EmessA server on local network (network scan button)
541c399  fix: treat 401/403 as successful connection in ServerConfigScreen
a8d2089  feat: sync with backend v10.0 API changes
325dac5  feat: implement all 4 phases of maintenance app features
```

---

## أهم القواعد عند العمل على المشروع

1. **@anthropic-ai/sdk لا يُستخدم في التطبيق** — فقط في الباكند. AIAssistantScreen يتصل بـ `/api/ai/diagnose` فقط.
2. **metro.config.js** يحجب `@anthropic-ai/sdk` وعنده shims لـ `node:fs, node:path, node:os, node:crypto`.
3. **RTL دايماً** — كل شيء بالعربية، `textAlign: 'right'`, `I18nManager.forceRTL(true)`.
4. **keystore ثابت** — `android/app/emessa-release.keystore` لازم يبقى في الـ repo عشان التحديثات تشتغل.
5. **LOCATION_TASK** — constant مشترك بين `AuthContext.js` و `LocationTrackingScreen.js`، لا تغيّره.
6. **expo-task-manager** لازم يبقى على v11.8.2 (مش أحدث) لتوافق Expo SDK 50.
7. **401 من السيرفر** = السيرفر شغال، مش مشكلة. الـ app يتعامل معها صح.
8. **OTA Update**: لما تعمل build جديد، حدّث `CURRENT_BUILD` في `src/utils/appUpdater.js` سطر 4.
