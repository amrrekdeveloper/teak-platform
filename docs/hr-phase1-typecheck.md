# فحص الأنواع — المرحلة التشغيلية الأولى

التاريخ: 2026-10-20. الأمر: `npx tsc --noEmit --pretty false`.

**النتيجة العامة: FAIL — بقي 41 تشخيصًا.** كانت نقطة البداية المنفذة في هذه المهمة 161 تشخيصًا، وليست الأرقام القديمة وحدها مصدر المقارنة.

عولج هدف JavaScript القديم، وتعارض معاملات مسارات Express 5 مع المقاطع الفردية، وتكرار تعريف دالة سجل الحضور، وربط صفحة الإعدادات بموجّه الصفحات. لم يُستخدم تجاهل عام للأخطاء أو تحويل غير آمن لإخفائها.

## التشخيصات الباقية، كل موضع على حدة

| الملف والموضع | المشكلة | النطاق |
|---|---|---|
| `client/src/pages/contract-detail.tsx:259:71` | خاصية title لأيقونة | العقود |
| `client/src/pages/customer-portal.tsx:37:12` | تعريفات qrcode مفقودة | بوابة العملاء |
| `client/src/pages/inventory.tsx:120:40` | تعريفات qrcode مفقودة | المخزون |
| `client/src/pages/invoice-view.tsx:17:12` | تعريفات qrcode مفقودة | الفواتير |
| `client/src/pages/my-orders.tsx:91:62` | تحويل Date إلى string | الطلبات |
| `client/src/pages/my-orders.tsx:972:112` | Date بدل string | الطلبات |
| `client/src/pages/my-orders.tsx:1006:91` | Date بدل string | الطلبات |
| `client/src/pages/my-orders.tsx:1008:124` | Date بدل string | الطلبات |
| `client/src/pages/my-orders.tsx:1161:87` | Date بدل string | الطلبات |
| `client/src/pages/order-detail.tsx:371:92` | Date بدل string | تفاصيل الطلب |
| `client/src/pages/order-detail.tsx:419:109` | Date بدل string | تفاصيل الطلب |
| `client/src/pages/order-detail.tsx:444:21` | phone2 غير معرّف في نموذج العميل | تفاصيل الطلب |
| `client/src/pages/order-detail.tsx:444:88` | phone2 غير معرّف في نموذج العميل | تفاصيل الطلب |
| `client/src/pages/order-detail.tsx:446:20` | address غير معرّف | تفاصيل الطلب |
| `client/src/pages/order-detail.tsx:446:88` | address غير معرّف | تفاصيل الطلب |
| `client/src/pages/order-detail.tsx:468:9` | unknown لا يُعرض مباشرة | تفاصيل الطلب |
| `client/src/pages/order-detail.tsx:468:45` | length على قيمة غير مصنفة | تفاصيل الطلب |
| `client/src/pages/order-detail.tsx:516:24` | مقارنة حالة expired غير متوافقة | تفاصيل الطلب |
| `client/src/pages/order-detail.tsx:566:61` | projectType غير معرّف | تفاصيل الطلب |
| `client/src/pages/order-detail.tsx:570:29` | city غير معرّف في المعاينة | تفاصيل الطلب |
| `client/src/pages/order-detail.tsx:570:136` | city غير معرّف في المعاينة | تفاصيل الطلب |
| `client/src/pages/order-detail.tsx:571:29` | totalArea غير معرّف | تفاصيل الطلب |
| `client/src/pages/order-detail.tsx:571:110` | totalArea غير معرّف | تفاصيل الطلب |
| `client/src/pages/order-detail.tsx:572:29` | roomsCount غير معرّف | تفاصيل الطلب |
| `client/src/pages/order-detail.tsx:572:105` | roomsCount غير معرّف | تفاصيل الطلب |
| `client/src/pages/order-detail.tsx:912:18` | مقارنة حالة in_progress غير متوافقة | تفاصيل الطلب |
| `client/src/pages/order-detail.tsx:1011:90` | paymentDate غير معرّف | تفاصيل الطلب |
| `client/src/pages/quotation-builder.tsx:279:15` | حقول LineItem ناقصة | التسعير |
| `client/src/pages/quotation-builder.tsx:858:15` | قيمة nullable | التسعير |
| `client/src/pages/quotation-builder.tsx:1683:21` | قيمة nullable | التسعير |
| `client/src/pages/quotation-view.tsx:277:13` | قيمة nullable | عروض الأسعار |
| `client/src/pages/sales-map.tsx:471:39` | ringColor ليست خاصية CSS | المبيعات |
| `client/src/pages/scene-3d.tsx:5307:23` | قيمة nullable | المصمم |
| `client/src/pages/scene-3d.tsx:5308:23` | قيمة nullable | المصمم |
| `client/src/pages/work-orders.tsx:243:72` | معرّف nullable | أوامر العمل |
| `server/routes.ts:10079:9` | entryId ناقص في أسطر الإقفال | الإقفال المحاسبي |
| `server/storage.ts:1543:57` | توافق نوع attachments | إنشاء قيد محاسبي |
| `server/storage.ts:1574:57` | توافق نوع attachments | الأرصدة الافتتاحية |
| `server/storage.ts:1587:55` | توافق نوع attachments | تعديل قيد محاسبي |
| `server/storage.ts:1601:57` | توافق نوع attachments | تعديل أسطر القيد |
| `server/storage.ts:1626:9` | توافق واجهة قراءة أسطر الحساب | دفتر الأستاذ |

## أثرها وحدود الاستنتاج

- لا توجد تشخيصات في وحدات الموظف والمرفقات الطبية والحضور والجداول والجدولة ودخول مدير النظام أو صفحات HR المعدلة.
- صفحات ERP المذكورة ليست ضمن مسارات الصيانة المسموح بها. أخطاء التخزين المتبقية تخص دوال المحاسبة المذكورة؛ لا تتعلق بتخزين طلبات الإجازات أو الاستئذان أو الحضور. لا نعلن قبول المحاسبة أو صرف الرواتب.
- البناء وتشغيل حزمة الإنتاج في مخطط اختبار معزول نجحا. هذا يثبت أن هذه التشخيصات لم تمنع تجميع النسخة أو بدء خادمها في الاختبار، **ولا يحوّل الفحص العام إلى PASS**.
- لا يوجد قبول لإعادة فتح كامل ERP. يلزم إصلاح هذه المواضع والتحقق منها قبل توسيع النطاق.
