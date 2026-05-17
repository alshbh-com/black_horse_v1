# قسم "قراءة الباركود" - خطة التنفيذ

## نظرة عامة
بناء قسم متكامل لقراءة الباركود باستخدام أجهزة Scanner (تعمل كـ Keyboard)، مع إدارة جلسات اسكان، وأوامر جماعية، وتحديثات Realtime.

## ملاحظات مهمة على الوضع الحالي
- جدول `orders` يحتوي بالفعل على عمود `barcode` و `tracking_id` (يتم توليد الباركود تلقائيًا عبر trigger موجود).
- جدول `order_statuses` موجود مع حالات قابلة للتخصيص.
- صفحة `PrintSticker.tsx` موجودة بالفعل للطباعة الفردية.
- يوجد `diaries` و `diary_orders` لليوميات.

لذلك **لن نكرر** إنشاء جداول الأوردرات أو الباركود، بل نضيف فقط الجداول الناقصة ونربط بالموجود.

## 1. تغييرات قاعدة البيانات (Migration)

### جداول جديدة
- **`scan_sessions`**: `id, user_id, started_at, ended_at, total_scanned, notes, status (open/closed)`
- **`scan_session_items`**: `id, session_id, order_id, scanned_at` (unique على session_id+order_id لمنع التكرار)
- **`scan_logs`**: `id, session_id, order_id, user_id, action (scan/status_change/assign/print/delete), old_value, new_value, created_at`
- **`order_status_history`**: `id, order_id, old_status_id, new_status_id, changed_by, changed_at, session_id, reason`

### عمود إضافي
- `orders.qr_value` (text, nullable) — لتخزين قيمة QR منفصلة (افتراضيًا = tracking_id).

### RLS
- Owner/Admin: full access
- Courier: SELECT على sessions/items الخاصة به فقط
- جميع المستخدمين المصادقين: INSERT في sessions الخاصة بهم

### Realtime
- تفعيل Realtime على: `orders`, `scan_session_items`, `order_status_history`

## 2. المكتبات
```
bun add jsbarcode qrcode react-qr-code react-barcode
```
(jspdf و xlsx موجودة على الأرجح، سنتحقق)

## 3. الكود الأمامي

### Hook جديد
- **`src/hooks/useBarcodeScanner.ts`**: يتعامل مع input مخصص، يكتشف نهاية الاسكان (Enter أو timeout بين الضربات < 50ms)، صوت نجاح/فشل عبر Web Audio API.
- **`src/hooks/useScanSession.ts`**: يفتح/يغلق session، يضيف عناصر، يمنع التكرار، يستعلم الأوردر من Supabase عبر barcode أو tracking_id.
- **`src/hooks/useRealtimeOrders.ts`**: يشترك في تحديثات orders.

### مكونات
- **`src/pages/BarcodeScanning.tsx`**: الصفحة الرئيسية (زر "ابدأ الاسكان" → وضع الاسكان النشط).
- **`src/components/scan/ScanInput.tsx`**: input كبير auto-focus مع مؤشر بصري.
- **`src/components/scan/ScannedOrdersTable.tsx`**: جدول live للأوردرات الممسوحة (رقم، عميل، مندوب، حالة، مبلغ، مدينة، زر حذف).
- **`src/components/scan/BulkActionsDialog.tsx`**: نافذة الأوامر الجماعية بعد "انتهيت":
  - تغيير الحالة (dropdown من order_statuses)
  - تعيين/إزالة مندوب
  - طباعة فواتير جماعية
  - طباعة ملصقات باركود جماعية
  - تصدير PDF / Excel
  - حذف من القائمة / إغلاق الأوردرات
- **`src/components/scan/BulkPrintInvoices.tsx`**: طباعة عدة فواتير في صفحة واحدة (window.print + CSS @page).
- **`src/components/scan/BulkPrintBarcodes.tsx`**: طباعة ملصقات Barcode/QR.
- **`src/components/OrderBarcode.tsx`**: مكون مشترك لعرض barcode + QR في أي مكان (الفاتورة، الملصق، صفحة الأوردر).

### تحديثات على ملفات موجودة
- **`src/pages/PrintSticker.tsx`**: إضافة QR Code بجانب Barcode.
- **`src/components/AppSidebar.tsx`**: إضافة رابط "قراءة الباركود".
- **`src/App.tsx`**: تسجيل route `/barcode-scanning`.
- **`src/hooks/usePermissions.tsx`**: إضافة section key للقسم الجديد.
- **`src/pages/Orders.tsx`** (إن لزم): عرض الباركود الصغير في صف الأوردر.

## 4. منطق الأوامر الجماعية

عند تطبيق أي action على N أوردر:
1. تحديث `orders` (status_id / courier_id / is_closed).
2. كتابة سطر في `order_status_history` لكل أوردر.
3. كتابة سطر في `scan_logs`.
4. إذا الحالة = "تم التسليم": تأكد من ربط الأوردر بـ `diary_orders` لليومية الحالية للمندوب (إن وجدت)، وتسجيل المبلغ.
5. كل العمليات في batch واحد عبر `supabase.from(...).update().in('id', ids)`.

## 5. التحقق ومنع الأخطاء
- إذا الأوردر غير موجود → toast أحمر + صوت خطأ.
- إذا تم مسحه مسبقًا في الـ session → toast تحذير.
- إذا `is_closed = true` أو الحالة "ملغي" → منع الإضافة.
- التحقق من صلاحية القسم عبر `usePermissions`.

## 6. الطباعة
- **فاتورة فردية**: موجودة.
- **فاتورة جماعية**: صفحة طباعة تعرض كل أوردر في قسم منفصل مع `page-break-after: always`.
- **ملصقات باركود جماعية**: شبكة 2×N من ملصقات بحجم 50×30mm.
- **Barcode في الفاتورة والملصق**: عبر مكون `OrderBarcode` (jsbarcode للـ Barcode، QRCode للـ QR).

## 7. التصدير
- **Excel**: عبر مكتبة `xlsx` (موجودة في المشروع غالبًا).
- **PDF**: عبر `jspdf` + `jspdf-autotable` (أو طباعة كـ PDF عبر المتصفح).

## 8. الواجهة
- خلفية حديثة، زر "ابدأ الاسكان" كبير في المنتصف بتدرج لون primary.
- بعد البدء: شريط علوي يعرض عداد، وقت الجلسة، زر "انتهيت".
- جدول حي بأنميشن خفيف عند إضافة صف.
- صوت بيب نجاح (نغمة عالية قصيرة) / صوت خطأ (نغمتين منخفضتين).
- RTL كامل + متجاوب على الموبايل (الجدول يصبح cards).

## 9. ملف الإغلاق
زر إضافي في BulkActions: "إغلاق الأوردرات" يضع `is_closed = true` لجميع الأوردرات المختارة.

---

**ملاحظة**: ربط الحالات بالأرباح والـ daily reports يعتمد على المنطق الموجود حاليًا في `CourierStats.tsx` و `diaries`. لن نُنشئ جدول `courier_daily_reports` منفصل لأن `diaries` يؤدي نفس الغرض في النظام الحالي.

هل أبدأ بتنفيذ هذه الخطة؟