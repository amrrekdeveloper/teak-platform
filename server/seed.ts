import { db } from "./db";
import { hashPassword } from "./auth";
import {
  users, customers, products, woodTypes, doorTypes,
  inventory, suppliers, companySettings,
} from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedDatabase() {
  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length > 0) {
    console.log("Database already seeded, skipping...");
    return;
  }

  console.log("Seeding database...");

  const defaultPassword = await hashPassword("123456");

  const userSeeds = [
    { username: "jabran", password: defaultPassword, role: "owner" as const, fullNameAr: "جبران", fullNameEn: "Jabran", phone: "0501234567", email: "jabran@teak.sa" },
    { username: "khaled", password: defaultPassword, role: "assistant" as const, fullNameAr: "خالد", fullNameEn: "Khaled", phone: "0502234567", email: "khaled@teak.sa" },
    { username: "hadi", password: defaultPassword, role: "sales" as const, fullNameAr: "هادي", fullNameEn: "Hadi", phone: "0503234567", email: "hadi@teak.sa" },
    { username: "mohnad", password: defaultPassword, role: "sales" as const, fullNameAr: "مهند", fullNameEn: "Mohnad", phone: "0503334567", email: "mohnad@teak.sa" },
    { username: "mohsen", password: defaultPassword, role: "designer" as const, fullNameAr: "محسن", fullNameEn: "Mohsen", phone: "0504234567", email: "mohsen@teak.sa" },
    { username: "hamdi", password: defaultPassword, role: "production" as const, fullNameAr: "حمدي", fullNameEn: "Hamdi", phone: "0505234567", email: "hamdi@teak.sa" },
    { username: "ayman", password: defaultPassword, role: "purchasing" as const, fullNameAr: "أيمن", fullNameEn: "Ayman", phone: "0506234567", email: "ayman@teak.sa" },
    { username: "bassam", password: defaultPassword, role: "warehouse" as const, fullNameAr: "بسام", fullNameEn: "Bassam", phone: "0507234567", email: "bassam@teak.sa" },
    { username: "ismail", password: defaultPassword, role: "accountant" as const, fullNameAr: "إسماعيل", fullNameEn: "Ismail", phone: "0508234567", email: "ismail@teak.sa" },
    { username: "fatima", password: defaultPassword, role: "customer_service" as const, fullNameAr: "فاطمة", fullNameEn: "Fatima", phone: "0509234567", email: "fatima@teak.sa" },
    { username: "mohammed", password: defaultPassword, role: "delivery" as const, fullNameAr: "محمد", fullNameEn: "Mohammed", phone: "0510234567", email: "mohammed@teak.sa" },
    { username: "saddad", password: defaultPassword, role: "installation" as const, fullNameAr: "صداد", fullNameEn: "Saddad", phone: "0511234567", email: "saddad@teak.sa" },
    { username: "quality1", password: defaultPassword, role: "quality" as const, fullNameAr: "سعد", fullNameEn: "Saad", phone: "0512234567", email: "quality@teak.sa" },
    { username: "noura", password: defaultPassword, role: "hr" as const, fullNameAr: "نورة", fullNameEn: "Noura", phone: "0513234567", email: "noura@teak.sa" },
    { username: "hanan", password: defaultPassword, role: "hr" as const, fullNameAr: "حنان", fullNameEn: "Hanan", phone: "0513334567", email: "hanan@teak.sa" },
    { username: "siham", password: defaultPassword, role: "it" as const, fullNameAr: "سهام", fullNameEn: "Siham", phone: "0514234567", email: "siham@teak.sa" },
  ];

  await db.insert(users).values(userSeeds);
  console.log(`Seeded ${userSeeds.length} users`);

  const productSeeds = [
    { nameAr: "مطبخ كلاسيكي", nameEn: "Classic Kitchen", category: "kitchen" as const, descriptionAr: "مطبخ كلاسيكي فاخر مصنوع من أجود أنواع الخشب", descriptionEn: "Premium classic kitchen made from finest wood", featured: true, active: true, sortOrder: 1 },
    { nameAr: "مطبخ مودرن", nameEn: "Modern Kitchen", category: "kitchen" as const, descriptionAr: "مطبخ عصري بتصميم حديث وعملي", descriptionEn: "Modern kitchen with contemporary functional design", featured: true, active: true, sortOrder: 2 },
    { nameAr: "مطبخ نيوكلاسيك", nameEn: "Neoclassic Kitchen", category: "kitchen" as const, descriptionAr: "مطبخ نيوكلاسيك يجمع بين الأصالة والحداثة", descriptionEn: "Neoclassic kitchen combining tradition with modernity", featured: false, active: true, sortOrder: 3 },
    { nameAr: "خزانة ملابس مدمجة", nameEn: "Built-in Wardrobe", category: "wardrobe" as const, descriptionAr: "خزانة ملابس مدمجة بتصميم عملي وأنيق", descriptionEn: "Built-in wardrobe with elegant practical design", featured: true, active: true, sortOrder: 4 },
    { nameAr: "خزانة ملابس منزلقة", nameEn: "Sliding Wardrobe", category: "wardrobe" as const, descriptionAr: "خزانة ملابس بأبواب منزلقة لتوفير المساحة", descriptionEn: "Sliding door wardrobe for space efficiency", featured: false, active: true, sortOrder: 5 },
    { nameAr: "غرفة ملابس كاملة", nameEn: "Walk-in Closet", category: "wardrobe" as const, descriptionAr: "غرفة ملابس متكاملة بتصميم فاخر", descriptionEn: "Complete walk-in closet with luxury design", featured: true, active: true, sortOrder: 6 },
    { nameAr: "باب خشبي داخلي", nameEn: "Interior Wood Door", category: "door" as const, descriptionAr: "باب خشبي داخلي بجودة عالية وتشطيب ممتاز", descriptionEn: "High quality interior wood door with excellent finish", featured: false, active: true, sortOrder: 7 },
    { nameAr: "باب خشبي رئيسي", nameEn: "Main Entry Door", category: "door" as const, descriptionAr: "باب رئيسي خشبي فاخر بنقوش تقليدية", descriptionEn: "Luxury main entry door with traditional carvings", featured: true, active: true, sortOrder: 8 },
    { nameAr: "باب مزدوج", nameEn: "Double Door", category: "door" as const, descriptionAr: "باب مزدوج خشبي للصالونات والقاعات", descriptionEn: "Double wood door for halls and lounges", featured: false, active: true, sortOrder: 9 },
    { nameAr: "ديكور جداري خشبي", nameEn: "Wood Wall Panel", category: "decoration" as const, descriptionAr: "ديكور جداري خشبي بتصاميم عصرية", descriptionEn: "Modern wood wall panel designs", featured: true, active: true, sortOrder: 10 },
    { nameAr: "سقف خشبي مزخرف", nameEn: "Decorative Wood Ceiling", category: "decoration" as const, descriptionAr: "سقف خشبي مزخرف بأنماط تقليدية وحديثة", descriptionEn: "Decorative wood ceiling with traditional and modern patterns", featured: false, active: true, sortOrder: 11 },
    { nameAr: "مكتبة خشبية", nameEn: "Wood Bookshelf", category: "decoration" as const, descriptionAr: "مكتبة خشبية أنيقة بتصميم عملي", descriptionEn: "Elegant wood bookshelf with practical design", featured: false, active: true, sortOrder: 12 },
    { nameAr: "تجهيز غرفة فندقية", nameEn: "Hotel Room Furniture", category: "hotel" as const, descriptionAr: "تجهيز كامل لغرف الفنادق بأثاث خشبي فاخر", descriptionEn: "Complete hotel room furnishing with luxury wood furniture", featured: true, active: true, sortOrder: 13 },
    { nameAr: "استقبال فندقي", nameEn: "Hotel Reception Desk", category: "hotel" as const, descriptionAr: "كاونتر استقبال فندقي بتصميم احترافي", descriptionEn: "Professional hotel reception desk design", featured: false, active: true, sortOrder: 14 },
    { nameAr: "تجهيز مطعم فندقي", nameEn: "Hotel Restaurant Furniture", category: "hotel" as const, descriptionAr: "تجهيز مطاعم الفنادق بأثاث خشبي متين وأنيق", descriptionEn: "Hotel restaurant furnishing with durable elegant wood furniture", featured: false, active: true, sortOrder: 15 },
  ];

  await db.insert(products).values(productSeeds);
  console.log(`Seeded ${productSeeds.length} products`);

  const woodTypeSeeds = [
    { nameAr: "شيبورد", nameEn: "Chipboard", pricePerMeter: "450", category: "standard", active: true },
    { nameAr: "شيبورد مقاوم للرطوبة", nameEn: "Moisture Resistant Chipboard", pricePerMeter: "550", category: "standard", active: true },
    { nameAr: "MDF", nameEn: "MDF", pricePerMeter: "520", category: "standard", active: true },
    { nameAr: "خشب صولد زان", nameEn: "Solid Beech Wood", pricePerMeter: "1200", category: "premium", active: true },
    { nameAr: "خشب صولد بلوط", nameEn: "Solid Oak Wood", pricePerMeter: "1500", category: "premium", active: true },
    { nameAr: "كبس HPL", nameEn: "HPL Laminate", pricePerMeter: "650", category: "laminate", active: true },
    { nameAr: "PVC فاخر", nameEn: "Premium PVC", pricePerMeter: "380", category: "economy", active: true },
  ];

  const insertedWoodTypes = await db.insert(woodTypes).values(woodTypeSeeds).returning();
  console.log(`Seeded ${woodTypeSeeds.length} wood types`);

  const doorTypeSeeds = [
    { nameAr: "باب ضغط عادي", nameEn: "Standard Pressed Door", pricePerMeter: "350", woodTypeId: insertedWoodTypes[0].id, active: true },
    { nameAr: "باب MDF محفور", nameEn: "Carved MDF Door", pricePerMeter: "550", woodTypeId: insertedWoodTypes[2].id, active: true },
    { nameAr: "باب خشب صولد", nameEn: "Solid Wood Door", pricePerMeter: "1800", woodTypeId: insertedWoodTypes[3].id, active: true },
    { nameAr: "باب HPL", nameEn: "HPL Door", pricePerMeter: "750", woodTypeId: insertedWoodTypes[5].id, active: true },
  ];

  await db.insert(doorTypes).values(doorTypeSeeds);
  console.log(`Seeded ${doorTypeSeeds.length} door types`);

  const customerSeeds = [
    { fullName: "أحمد محمد العتيبي", phone: "0551234567", email: "ahmed@email.com", city: "الرياض", district: "النرجس", buildingStatus: "تحت الإنشاء", source: "website" as const, notes: "مهتم بمطبخ مودرن كبير" },
    { fullName: "سارة خالد السبيعي", phone: "0552234567", email: "sara@email.com", city: "جدة", district: "الروضة", buildingStatus: "جاهز للتسليم", source: "referral" as const, notes: "تحتاج خزائن ملابس لـ 4 غرف" },
    { fullName: "عبدالله فهد الدوسري", phone: "0553234567", email: "abdullah@email.com", city: "الرياض", district: "العليا", buildingStatus: "جاهز", source: "walk_in" as const, notes: "يريد أبواب خشب صولد" },
    { fullName: "فاطمة حسن الغامدي", phone: "0554234567", email: "fatimah@email.com", city: "الدمام", district: "الشاطئ", buildingStatus: "تشطيب", source: "phone" as const, notes: "مطبخ + ديكور جداري" },
    { fullName: "محمد سعيد القحطاني", phone: "0555234567", email: "moh.q@email.com", city: "الرياض", district: "حطين", buildingStatus: "جاهز", source: "social_media" as const, notes: "فندق صغير - يحتاج تجهيز 10 غرف" },
  ];

  await db.insert(customers).values(customerSeeds);
  console.log(`Seeded ${customerSeeds.length} customers`);

  const inventorySeeds = [
    { materialNameAr: "ألواح شيبورد 18مم", materialNameEn: "Chipboard Sheets 18mm", sku: "CB-18", category: "wood", unit: "sheet" as const, quantity: "250", minQuantity: "50", costPerUnit: "85", location: "مستودع 1" },
    { materialNameAr: "ألواح MDF 16مم", materialNameEn: "MDF Sheets 16mm", sku: "MDF-16", category: "wood", unit: "sheet" as const, quantity: "180", minQuantity: "40", costPerUnit: "120", location: "مستودع 1" },
    { materialNameAr: "خشب زان صولد", materialNameEn: "Solid Beech Wood", sku: "SBW-01", category: "wood", unit: "meter" as const, quantity: "75", minQuantity: "20", costPerUnit: "280", location: "مستودع 2" },
    { materialNameAr: "شريط PVC 2مم", materialNameEn: "PVC Edge Band 2mm", sku: "PVC-2", category: "accessories", unit: "meter" as const, quantity: "5000", minQuantity: "1000", costPerUnit: "3.5", location: "مستودع 1" },
    { materialNameAr: "مفصلات هيدروليك", materialNameEn: "Hydraulic Hinges", sku: "HH-01", category: "hardware", unit: "piece" as const, quantity: "800", minQuantity: "200", costPerUnit: "15", location: "مستودع 3" },
    { materialNameAr: "سكة درج تلسكوبيك", materialNameEn: "Telescopic Drawer Slides", sku: "TDS-45", category: "hardware", unit: "piece" as const, quantity: "400", minQuantity: "100", costPerUnit: "25", location: "مستودع 3" },
    { materialNameAr: "مقابض ستانلس ستيل", materialNameEn: "Stainless Steel Handles", sku: "SSH-01", category: "hardware", unit: "piece" as const, quantity: "600", minQuantity: "150", costPerUnit: "18", location: "مستودع 3" },
    { materialNameAr: "دهان بولي يوريثان", materialNameEn: "Polyurethane Paint", sku: "PUP-01", category: "finishing", unit: "liter" as const, quantity: "120", minQuantity: "30", costPerUnit: "65", location: "مستودع 2" },
    { materialNameAr: "غراء خشب PVA", materialNameEn: "PVA Wood Glue", sku: "PWG-01", category: "adhesive", unit: "kg" as const, quantity: "200", minQuantity: "50", costPerUnit: "22", location: "مستودع 1" },
    { materialNameAr: "براغي خشب 3.5×30", materialNameEn: "Wood Screws 3.5x30", sku: "WS-35", category: "hardware", unit: "piece" as const, quantity: "10000", minQuantity: "2000", costPerUnit: "0.15", location: "مستودع 3" },
    { materialNameAr: "HPL لامينيت", materialNameEn: "HPL Laminate Sheets", sku: "HPL-01", category: "laminate", unit: "sheet" as const, quantity: "90", minQuantity: "20", costPerUnit: "150", location: "مستودع 1" },
    { materialNameAr: "زجاج مطبخ 6مم", materialNameEn: "Kitchen Glass 6mm", sku: "KG-06", category: "glass", unit: "sqm" as const, quantity: "45", minQuantity: "10", costPerUnit: "180", location: "مستودع 2" },
  ];

  await db.insert(inventory).values(inventorySeeds);
  console.log(`Seeded ${inventorySeeds.length} inventory items`);

  const supplierSeeds = [
    { name: "مؤسسة الخشب السعودي", contactPerson: "عمر المطيري", phone: "0112345678", email: "info@saudiwood.sa", address: "الرياض - المنطقة الصناعية", materials: "ألواح شيبورد، MDF، خشب صولد", taxNumber: "310123456700003", active: true },
    { name: "شركة الحديد والعدد", contactPerson: "ناصر العنزي", phone: "0113456789", email: "sales@irontools.sa", address: "الرياض - الصناعية الثانية", materials: "مفصلات، سكك، مقابض، براغي", taxNumber: "310234567800003", active: true },
    { name: "مصنع الدهانات المتقدمة", contactPerson: "فيصل الشهري", phone: "0114567890", email: "contact@advpaint.sa", address: "جدة - المنطقة الصناعية", materials: "دهانات، ورنيش، غراء", taxNumber: "310345678900003", active: true },
  ];

  await db.insert(suppliers).values(supplierSeeds);
  console.log(`Seeded ${supplierSeeds.length} suppliers`);

  await db.insert(companySettings).values({
    nameAr: "مصنع تيك للمنتجات الخشبية",
    nameEn: "Teak Wood Products Factory",
    vatNumber: "310012345600003",
    address: "الرياض، المملكة العربية السعودية - المنطقة الصناعية الثانية",
    phone: "0112223344",
    email: "info@teak2030.net",
  });
  console.log("Seeded company settings");

  console.log("Database seeding completed successfully!");
}
