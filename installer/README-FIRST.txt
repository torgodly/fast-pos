Fast POS — بعد التثبيت
======================

1) افتح النظام من أيقونة "Fast POS" على سطح المكتب، أو من المتصفح:
   http://localhost:3000

2) لوحة الإدارة:
   اسم المستخدم: admin
   كلمة المرور: 123
   غيّر كلمة المرور فوراً من: الإدارة ← الإعدادات.

3) دخول الكاشير:
   رمز PIN: 2580
   (يمكن تغييره من الإدارة ← الموظفون.)

4) الدخول من أجهزة iPad/اللابتوب على نفس الشبكة:
   http://<IP-الخادم>:3000
   مثال: http://192.168.1.10:3000
   إذا لم يعمل، تأكد من أن جدار الحماية يسمح بالمنفذ 3000 (يُضاف تلقائياً عند التثبيت).

5) الخدمة تعمل تلقائياً عند تشغيل الجهاز (Windows Service باسم FastPOS).
   أوامر مفيدة من أي نافذة أوامر (PATH):
   fast-pos-status     عرض حالة الخدمة
   fast-pos-start      تشغيل الخدمة
   fast-pos-stop       إيقاف الخدمة
   fast-pos-restart    إعادة تشغيل الخدمة
   fast-pos-console    تشغيل يدوي في نافذة (للتشخيص)
   fast-pos-remote     فتح وصول مؤقت من الإنترنت للمالك

6) قاعدة البيانات والترخيص محفوظان في:
   <مجلد التثبيت>\server\data
   لا تحذف هذا المجلد. الترقية لا تمسّه.

7) الوصول عن بُعد للمالك:
   من قائمة ابدأ افتح: Fast POS Remote Access
   أو اكتب في نافذة أوامر: fast-pos-remote
   ستظهر نافذة سوداء فيها رابط مؤقت مثل:
   https://xxxx-xxxx-xxxx.trycloudflare.com
   انسخ الرابط وأرسله للمالك (يُنسخ تلقائياً إلى الحافظة).
   - الرابط يتغيّر في كل مرة، ويعمل فقط ما دامت النافذة مفتوحة.
   - إغلاق النافذة أو Ctrl+C يوقف الوصول عن بُعد فوراً.
   - إذا ضاعت النافذة: fast-pos-remote stop
   - رمز الكاشير 2580 يفتح نقطة البيع عن بُعد أيضاً؛
     غيّره إلى رمز خاص قبل استخدام الوصول عن بُعد.

English quick start
-------------------
Admin: admin / 123 (change it immediately)
Cashier PIN: 2580
LAN URL: http://<server-ip>:3000
Remote: fast-pos-remote — temporary https URL, ends when its window closes.
Service name: FastPOS (starts on boot). Data lives in <install>\server\data.
