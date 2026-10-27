export type HrAlertCategory = "compliance" | "requests" | "data";
export type HrAlert = {
  key: string;
  kind: string;
  category: HrAlertCategory;
  severity: "critical" | "warning" | "info";
  employeeId: number;
  employeeNumber: string;
  employeeNameAr: string;
  employeeNameEn: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  dueDate: string | null;
  daysRemaining: number | null;
  href: string;
  readAt: string | null;
  snoozedUntil: string | null;
};
export type HrAlertSettings = { leadDays: number; requestSlaDays: number; updatedAt: string | null };
export type HrAlertsResponse = {
  asOf: string;
  generatedAt: string;
  settings: HrAlertSettings;
  items: HrAlert[];
};
