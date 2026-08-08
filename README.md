# Aboud Sayem — v4.0

تطبيق أندرويد لإدارة الصيام المتقطع والممتد (حتى 72 ساعة فأكثر)، مع سجل كامل،
وربط سوار **Huawei Band 11 Pro** لقراءة النبض مباشرة، وقراءة النشاط البدني من
مستشعرات الهاتف نفسه.

Offline-first Android app for intermittent and extended fasting: a fast clock that
survives days, a real history, a live heart-rate link to a Huawei band over
standard BLE, and activity tracking from the phone's own sensors.

---

## 1. المشكلة في v3.2 وإيه اللي اتصلح — What was broken in the v3.2 spec

المواصفة القديمة كان فيها ٥ حاجات بتمنع الميزات دي إنها تشتغل أصلاً، مش مجرد
تفاصيل ناقصة:

| # | المشكلة في v3.2 | الحل في v4.0 |
|---|---|---|
| 1 | **BLE عن طريق Web Bluetooth** — `navigator.bluetooth` **غير موجود** في `android.webkit.WebView` نهائياً (موجود في متصفح Chrome بس). يعني كود السوار كله كان ميت. | عميل BLE أصلي بالكامل في Java (`BleManager`) + جسر `@JavascriptInterface`. |
| 2 | **أذونات البلوتوث ناقصة** — على أندرويد 11 وأقل، `startScan` بيرجّع صفر نتيجة من غير أي خطأ لو مفيش `ACCESS_FINE_LOCATION`، و`BLUETOOTH_SCAN/CONNECT` أصلاً أندرويد 12+. | كل الأذونات متقسّمة صح بـ `maxSdkVersion` + طلب runtime عند أول تشغيل. |
| 3 | **مفيش خدمة تعمل في الخلفية** — صيام 72 ساعة والتطبيق نشاطه (Activity) بيتقفل بعد دقايق. مفيش إشعار، مفيش تنبيه مراحل، والعدّاد بيقف عن العد الحي. | `FastingService` (foreground service) + إشعار مستمر بالعدّاد + `AlarmManager` يصحّى الجهاز عند كل مرحلة + `BootReceiver` يرجّع الصيام بعد إعادة التشغيل. |
| 4 | **عدّاد خطوات وهمي** — `devicemotion` بيشتغل بس والشاشة فاتحة والتطبيق قدامك، وبيستهلك بطارية. | `TYPE_STEP_COUNTER` (عدّاد الهاردوير) + عيّنات تسارع بنظام duty-cycle (١٢ ثانية كل دقيقة) لحساب شدّة النشاط والسعرات. |
| 5 | **تناقض داخلي** — المواصفة بتمنع `Promise` وفي نفس الوقت بتطلب Web Bluetooth، وهي API مبنية على Promises بالكامل. | الجسر الأصلي كله callbacks، فالقيد الـES5 اتحافظ عليه من غير تناقض. |

كمان: `aapt` بيولّد `R.java` دلوقتي (كان مفقود، فمستحيل تعمل إشعار بأيقونة)،
والأيقونات بقت متولّدة من غير Pillow ولا خطوط خارجية.

---

## 2. الميزات — Features

**الصيام**
- عدّاد دائري (SVG) بنسبة التقدم ولون المرحلة الحالية.
- أهداف: 16 / 18 / 20 / 24 / 36 / 48 / 72 ساعة (والعدّاد نفسه مالوش سقف).
- **٧ مراحل فسيولوجية** بدل ٦، آخرها `72h+` بتحذير طبي صريح.
- بدء/إيقاف مؤقت/استئناف/إنهاء + بداية بأثر رجعي (لو الصيام بدأ من ساعات).
- إشعار مستمر بالوقت والمرحلة والنبض، وتنبيه عند كل مرحلة جديدة وعند الهدف.

**السجل والإحصائيات**
- كل جلسة بتتسجّل: البداية، النهاية، المدة، الهدف، اكتملت ولا لأ، **متوسط وأقصى نبض**، **الخطوات أثناء الصيام**.
- السلسلة الحالية/الأفضل، عدد الجلسات، إجمالي الساعات، نسبة الإكمال، أطول صيام.
- رسم بياني لآخر ٧ أيام، BMI / BMR / TDEE، وسجل وزن.

**السوار والمستشعرات**
- نبض حي من السوار + نسبة بطارية السوار + إعادة اتصال تلقائية.
- خطوات، دقائق نشاط، سعرات محروقة، ومستوى النشاط الحالي (ساكن/خفيف/متوسط/عالي).

**الباقي**
- وجبات: قاعدة بيانات ٧٠+ صنف مصري/شرق أوسطي بالماكروز، وتحذير لو بتسجّل وجبة وإنت صايم.
- مشروبات: المسموح والممنوع أثناء الصيام + عدّاد شرب مياه بهدف يومي.
- المدرب: تحليل فسيولوجي لكل مرحلة، توصية رياضية لكل مرحلة، بروتوكول إفطار، ونصائح علمية.
- المكملات مع تحذير الجرعة الزائدة.
- عربي (RTL) / إنجليزي (LTR)، تصدير/استيراد JSON، ومشاركة تقرير نصي.

---

## 3. ربط Huawei Band 11 Pro — كيف ولماذا هكذا

السوار بيتكلم مع تطبيق Huawei Health ببروتوكول **مغلق ومشفّر**، مفيش طريقة
قانونية تفكّه. بس السوار كمان بيدعم **بث معدل ضربات القلب** على البروفايل
القياسي `Heart Rate Service (0x180D)` — ودي اللي التطبيق بيستعملها.

**خطوات التشغيل (لازم مرة واحدة):**

1. افتح **Huawei Health** → اختار الجهاز → **الإعدادات (Settings)**
   → **بث بيانات معدل ضربات القلب / HR Data Broadcasts** → فعّلها.
2. في تطبيق عبود صايم: الإعدادات → السوار → **ربط السوار**.
3. فعّل **اتصال تلقائي** عشان يرجع يتصل لوحده بعد كده.
4. الإعدادات → **استثناء من موفّر البطارية** (مهم جداً على أجهزة Huawei/Xiaomi —
   مدير البطارية بيقتل الخدمات في الخلفية).

**حدود لازم تكون واضحة:**

- البث ده بيدّي **النبض الحي بس**. مفيش وصول لخطوات السوار أو نومه أو SpO2 —
  دي محفوظة جوه Huawei Health.
- **Huawei Health مبيدعمش Health Connect** لحد دلوقتي، فمفيش طريق رسمي لسحب
  تاريخ بيانات السوار للتطبيق. (فيه تطبيقات وسيطة زي Health Sync بتعمل الجسر ده،
  وهي خارج نطاق التطبيق ده.)
- عشان كده **الخطوات والنشاط بتتقرأ من مستشعرات الهاتف**، مش من السوار — وده
  أدق وأثبت من محاولة كسر بروتوكول مقفول.
- بث النبض بيستهلك بطارية السوار أسرع من الوضع العادي.

لو السوار اتصل والتطبيق قال **"بث النبض مقفول"** يبقى الخطوة ١ مش متعملة.

---

## 4. البناء — Build

**المطلوب:** JDK 17+ و Android SDK فيه `platforms;android-34` و `build-tools;34.0.0`.

```bash
export ANDROID_HOME=/path/to/android-sdk
bash build_apk.sh
# -> app-release.apk  (~118 KB)
```

السكربت بيعمل: أيقونات → `aapt package` (مع توليد `R.java`) → `javac` →
`d8` → إضافة `classes.dex` → `zipalign` → `apksigner`. من غير Gradle ولا Capacitor.

### نسخة تتثبت جنب نسخة قديمة — Side-by-side build

لو فيه نسخة قديمة متثبتة بنفس اسم الحزمة لكن موقّعة بمفتاح تاني، أندرويد بيرفض
التثبيت بـ**"App not installed as package conflicts with an existing package"**.
ده قيد أمان، مش عطل — أندرويد مبيسمحش باستبدال تطبيق بمفتاح مختلف. الحل من غير
مسح النسخة القديمة:

```bash
APP_ID=com.sayemfit.app4 APP_LABEL="Aboud Sayem 4" \
OUT=aboud-sayem-v4-side.apk bash build_apk.sh
```

`--rename-manifest-package` بتغيّر **اسم الحزمة المثبّتة بس**؛ `R.java` وأسماء
الكلاسات بتفضل على `com.sayemfit.app`، فمفيش أي تعديل في الكود.

فيه كمان GitHub Actions workflow (`.github/workflows/build-apk.yml`) بيبني الـAPK
ويرفعه كـartifact على كل push.

### قيود لازم تتحافظ عليها (اتعلمناها بالتجربة)

1. **`build-tools` لازم 34.0.0 أو أقل** — `aapt` (v1) اتشال من 35+، والبايبلاين ده بيعتمد عليه.
2. **متعملش `implements` لأي interface بـgenerics** (زي `ValueCallback<String>`).
   javac بيولّد bridge method، و`d8 8.2.2` بيقع عليه بـ`NullPointerException`.
   عشان كده زرار الرجوع بيشتغل عن طريق `Native.exitApp()` بدل `ValueCallback`.
3. **مفيش anonymous inner classes** — كل `Runnable` / `Callback` كلاس مستقل باسمه.
4. **JS كله ES5** — مفيش `let/const`، arrow functions، template literals، spread،
   destructuring، classes، أو Promises. استعمل `m(a, b)` بدل الـspread.
5. **`foregroundServiceType="dataSync"`** مش `health` — النوع `health` بيرمي
   `SecurityException` على أندرويد 14 لو `ACTIVITY_RECOGNITION` مرفوض، وإذن اختياري
   مرفوض المفروض ميوقعش التطبيق. لو الـtargetSdk اترفع لـ35+ حوّلها لـ`specialUse`.

---

## 5. بنية المشروع — Layout

```
AndroidManifest.xml            الأذونات + الخدمة + الـreceivers
build_apk.sh                   بايبلاين البناء اليدوي
tools/make_icons.py            توليد الأيقونات (بدون Pillow)
res/values/                    strings.xml, styles.xml
src/com/sayemfit/app/
  MainActivity.java            WebView + الأذونات + زر الرجوع
  JsBridge.java                window.Native — كل ما JS مش قادر يعمله
  AppCore.java                 singleton: ساعة الصيام + SharedPreferences
  FastingService.java          foreground service + الإشعارات + AlarmManager
  AlarmReceiver.java           تنبيه المراحل حتى والجهاز نايم (Doze)
  BootReceiver.java            استرجاع الصيام بعد إعادة التشغيل
  BleManager.java              مسح/اتصال/GATT للسوار (0x180D + 0x180F)
  BleScanCallbackImpl.java     ScanCallback مسمّى
  GattCallbackImpl.java        BluetoothGattCallback مسمّى
  SensorTracker.java           عدّاد خطوات + تسارع بنظام duty-cycle
  Phases.java                  المراحل الـ٧ (نسخة Java للإشعارات)
  Json.java                    escape بسيط لـJSON
  *Task.java                   Runnables مسمّاة (بدل anonymous classes)
assets/public/
  index.html                   الشكل والـCSS
  utils.js                     التخزين، i18n، المراحل، الأكل، الحسابات، الجسر
  app.js                       واجهة React (createElement، بدون JSX)
```

### الجسر بين JS والأصلي

```
JS  -> Native   syncFast, bandScan, bandConnectSaved, bandDisconnect, bandAuto,
                sensorsState, sensorsReset, requestPerms, permsState,
                share, saveExport, vibrate, exitApp, openBatterySettings
Native -> JS    window.__onNative('band'|'sensors'|'perms', {...})
```

الـ**localStorage** هي مصدر الحقيقة لبيانات المستخدم؛ الطبقة الأصلية بتحتفظ بس
بساعة الصيام (`SharedPreferences`) عشان الخدمة تفضل عارفة إنت صايم من إمتى حتى
لو الواجهة اتقفلت. البيانات القديمة (`sayem_v3`) بتتهاجر تلقائياً لـ`sayem_v4`.

---

## 6. تنبيه طبي — Medical notice

التطبيق ده **أداة تتبّع، مش استشارة طبية**. الصيام الممتد (٢٤ ساعة فأكثر) مش
مناسب للحوامل والمرضعات ومرضى السكري ومن بيتناول أدوية ضغط أو سكر أو له تاريخ
اضطرابات أكل. استشر طبيبك قبل أي صيام يتجاوز ٢٤ ساعة، وخصوصاً قبل ٧٢ ساعة.
لو حسيت بدوخة شديدة أو خفقان أو ارتباك — افطر فوراً.
