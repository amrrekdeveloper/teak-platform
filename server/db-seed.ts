import { db } from "./db";
import { sql } from "drizzle-orm";

const PASSWORD_14001400 = "135257277821cf7718862b0b53f8c76c5469267ce5ee2c41c6fd0b57b35b9cfee762ef5368f186f7136a3121e6e4be19dbac3526ef3c7c5cd05e0d0651b204dd.44910b366316f33cb27b1b8c80fb99fd";

const CORE_USERS = [
  { username: "jabran",   password: PASSWORD_14001400, fullNameAr: "جبران",      fullNameEn: "Jabran",   role: "owner",        email: "jabran@teak.sa",   phone: "0501234567", active: true },
  { username: "khaled",   password: PASSWORD_14001400, fullNameAr: "خالد",       fullNameEn: "Khaled",   role: "assistant",    email: "khaled@teak.sa",   phone: "0502234567", active: true },
  { username: "siham",    password: PASSWORD_14001400, fullNameAr: "سهام",       fullNameEn: "Siham",    role: "assistant",    email: "siham@teak.sa",    phone: "0514234567", active: true },
  { username: "mohannad", password: PASSWORD_14001400, fullNameAr: "مهند",       fullNameEn: "Mohannad", role: "sales",        email: "mohannad@teak.sa", phone: "0503334567", active: true },
  { username: "hadi",     password: PASSWORD_14001400, fullNameAr: "هادي",       fullNameEn: "Hadi",     role: "sales",        email: "hadi@teak.sa",     phone: "0503234567", active: true },
  { username: "mohsen",   password: PASSWORD_14001400, fullNameAr: "محسن",       fullNameEn: "Mohsen",   role: "designer",     email: "mohsen@teak.sa",   phone: "0504234567", active: true },
  { username: "hamdi",    password: PASSWORD_14001400, fullNameAr: "حمدي",       fullNameEn: "Hamdi",    role: "production",   email: "hamdi@teak.sa",    phone: "0505234567", active: true },
  { username: "ismail",   password: PASSWORD_14001400, fullNameAr: "إسماعيل",    fullNameEn: "Ismail",   role: "accountant",   email: "ismail@teak.sa",   phone: "0508234567", active: true },
  { username: "sultan",   password: PASSWORD_14001400, fullNameAr: "سلطان",      fullNameEn: "Sultan",   role: "accountant",   email: "sultan@teak.sa",   phone: "0508334567", active: true },
  { username: "abdullah", password: PASSWORD_14001400, fullNameAr: "عبدالله",    fullNameEn: "Abdullah", role: "warehouse",    email: "abdullah@teak.sa", phone: "0507134567", active: true },
  { username: "bassam",   password: PASSWORD_14001400, fullNameAr: "بسام",       fullNameEn: "Bassam",   role: "warehouse",    email: "bassam@teak.sa",   phone: "0507234567", active: true },
  { username: "ayman",    password: PASSWORD_14001400, fullNameAr: "أيمن",       fullNameEn: "Ayman",    role: "purchasing",   email: "ayman@teak.sa",    phone: "0506234567", active: true },
  { username: "m.sobri",  password: PASSWORD_14001400, fullNameAr: "محمد صبري",  fullNameEn: "M. Sobri", role: "delivery",     email: "m.sobri@teak.sa",  phone: "0510234567", active: true },
  { username: "sedad",    password: PASSWORD_14001400, fullNameAr: "سداد",       fullNameEn: "Sedad",    role: "installation", email: "sedad@teak.sa",    phone: "0511234567", active: true },
];

const COMPANY_SETTINGS = {
  nameAr: "مصنع تيك للمنتجات الخشبية",
  nameEn: "Teak Wood Products Factory",
  vatNumber: "310012345600003",
  address: "الرياض، المملكة العربية السعودية - المنطقة الصناعية الثانية",
  phone: "0112223344",
  email: "info@teak2030.net",
};

const CORE_PRODUCTS = [
  { nameAr: "مطبخ كلاسيكي",          nameEn: "Classic Kitchen",             category: "kitchen" },
  { nameAr: "مطبخ مودرن",            nameEn: "Modern Kitchen",              category: "kitchen" },
  { nameAr: "مطبخ نيوكلاسيك",        nameEn: "Neoclassic Kitchen",          category: "kitchen" },
  { nameAr: "خزانة ملابس مدمجة",     nameEn: "Built-in Wardrobe",           category: "wardrobe" },
  { nameAr: "خزانة ملابس منزلقة",    nameEn: "Sliding Wardrobe",            category: "wardrobe" },
  { nameAr: "غرفة ملابس كاملة",      nameEn: "Walk-in Closet",              category: "wardrobe" },
  { nameAr: "باب خشبي داخلي",        nameEn: "Interior Wood Door",          category: "door" },
  { nameAr: "باب خشبي رئيسي",        nameEn: "Main Entry Door",             category: "door" },
  { nameAr: "باب مزدوج",             nameEn: "Double Door",                 category: "door" },
  { nameAr: "ديكور جداري خشبي",      nameEn: "Wood Wall Panel",             category: "decoration" },
  { nameAr: "سقف خشبي مزخرف",       nameEn: "Decorative Wood Ceiling",     category: "decoration" },
  { nameAr: "مكتبة خشبية",           nameEn: "Wood Bookshelf",              category: "decoration" },
  { nameAr: "تجهيز غرفة فندقية",     nameEn: "Hotel Room Furniture",        category: "hotel" },
  { nameAr: "استقبال فندقي",         nameEn: "Hotel Reception Desk",        category: "hotel" },
  { nameAr: "تجهيز مطعم فندقي",      nameEn: "Hotel Restaurant Furniture",  category: "hotel" },
];

export async function seedProductionDatabase() {
  // Retired: production startup must never delete business data or replay
  // hardcoded identities/passwords. Provision only through initializeSystemAdmin.
  return;
}

async function cleanTestData() {
  const coreUsernames = CORE_USERS.map(u => u.username);
  const jabranExists = await db.execute(
    sql`SELECT id FROM users WHERE username = 'jabran'`
  );
  if ((jabranExists as any).rows?.length > 0) {
    console.log("[seed] Production already initialized, skipping test data cleanup.");
    return;
  }

  console.log("[seed] Cleaning test data from production...");
  const cleanSteps = [
    "DELETE FROM notifications",
    "DELETE FROM activity_log",
    "DELETE FROM password_reset_requests",
    "DELETE FROM user_sessions",
    "DELETE FROM quality_checks",
    "DELETE FROM deliveries",
    "DELETE FROM installations",
    "DELETE FROM warranties",
    "DELETE FROM production_stages",
    "DELETE FROM work_orders",
    "DELETE FROM design_assignments",
    "DELETE FROM payment_schedules",
    "DELETE FROM payments",
    "DELETE FROM invoices",
    "DELETE FROM maintenance_requests",
    "DELETE FROM contracts",
    "DELETE FROM site_surveys",
    "DELETE FROM quotations",
    "DELETE FROM customers",
  ];
  for (const step of cleanSteps) {
    await db.execute(sql.raw(step)).catch(() => {});
  }
  console.log("[seed] Test data cleaned from production.");
}

async function seedUsers() {
  for (const user of CORE_USERS) {
    const existing = await db.execute(
      sql`SELECT id FROM users WHERE username = ${user.username}`
    );
    if ((existing as any).rows?.length === 0) {
      await db.execute(sql`
        INSERT INTO users (username, password, full_name_ar, full_name_en, role, email, phone, active)
        VALUES (${user.username}, ${user.password}, ${user.fullNameAr}, ${user.fullNameEn}, ${user.role}, ${user.email}, ${user.phone}, ${user.active})
      `);
      console.log(`[seed] Created user: ${user.username}`);
    } else {
      await db.execute(sql`
        UPDATE users SET
          password = ${user.password},
          full_name_ar = ${user.fullNameAr},
          full_name_en = ${user.fullNameEn},
          role = ${user.role},
          active = ${user.active}
        WHERE username = ${user.username}
      `);
    }
  }
  console.log("[seed] All users synced.");
}

async function seedCompanySettings() {
  const existing = await db.execute(sql`SELECT id FROM company_settings LIMIT 1`);
  if ((existing as any).rows?.length === 0) {
    await db.execute(sql`
      INSERT INTO company_settings (name_ar, name_en, vat_number, address, phone, email)
      VALUES (${COMPANY_SETTINGS.nameAr}, ${COMPANY_SETTINGS.nameEn}, ${COMPANY_SETTINGS.vatNumber}, ${COMPANY_SETTINGS.address}, ${COMPANY_SETTINGS.phone}, ${COMPANY_SETTINGS.email})
    `);
    console.log("[seed] Created company settings");
  }
}

async function seedProducts() {
  const existing = await db.execute(sql`SELECT COUNT(*) as n FROM products`);
  const count = parseInt((existing as any).rows?.[0]?.n || "0");
  if (count === 0) {
    for (const p of CORE_PRODUCTS) {
      await db.execute(sql`
        INSERT INTO products (name_ar, name_en, category, active, featured, sort_order)
        VALUES (${p.nameAr}, ${p.nameEn}, ${p.category}, true, false, 0)
      `);
    }
    console.log(`[seed] Created ${CORE_PRODUCTS.length} products`);
  }
}
