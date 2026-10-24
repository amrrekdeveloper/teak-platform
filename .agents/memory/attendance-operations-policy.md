---
name: Attendance operations policy
description: Owner requirements for employee attendance, geofences, schedule choices and deficiency approval.
---
TEAK's current working week is Saturday through Thursday; Friday alone is the weekly rest day. HR must be able to change working days for everyone or individual employees through clear attendance settings.

**Why:** On 2026-10-24 the owner explicitly corrected the Friday/Saturday weekend assumption and requested configurable working days after seeing incorrect weekly-rest labels in production.

**How to apply:** Do not infer TEAK's workweek from the standard Saudi weekend. Keep weekly-day policy configurable, visible to HR, and effective-dated; preserve historical evidence rather than silently applying today's rule to past attendance.

Attendance belongs to the employee's assigned workplace, not their home-location note. A workplace may offer several alternative schedules; each alternative has one or two periods, and the employee is assigned one alternative, not all alternatives combined.

**Why:** The owner explicitly requested multiple options at the same location, including a single 07:30–14:30 option and a separate split 09:00–12:00 / 16:00–22:00 option.

**How to apply:** Keep workplace assignment, schedule-option assignment and home-location notes separate. Configure geofences by choosing a center and numeric radius, not manual shape drawing.

Employees do not manually choose a period, including split schedules; the server selects it from the assigned schedule and current time.

**Why:** The owner explicitly approved removing the employee-side period selector because it confused employees. Alternative schedules are an HR assignment, not employee choice.

**How to apply:** Keep the attendance controls to assigned workplace/radius and punch buttons. Do not reintroduce a manual selector when handling split-period edge cases.

Attendance is mobile-first: the owner states that 99% of employees use their phones and many do not understand the term “GPS.”

**Why:** A coarse first mobile location reading was presented as a permission failure, incorrectly implying the employee had disabled location.

**How to apply:** Say “موقع الجوال” in employee-facing messages. Wait for location accuracy to improve, distinguish denied permission from poor accuracy, and show brief help on failure. Never solve mobile accuracy failures by weakening the geofence or accepting IP-based location.

Desktop attendance layout fixes must preserve the separate mobile attendance-card presentation.

**Why:** The owner repeated that desktop attendance should be made practical without affecting the phone version, which serves almost all employees.

**How to apply:** Scope desktop grid/table rules to desktop breakpoints and attendance selectors. Do not change shared mobile card markup or global form styles merely to widen a desktop attendance table; decisions/circulars form fixes are explicitly needed on both sizes.

An employee explanation is an HR approval request, not permission to overwrite a punch. Pending/rejected explanations retain the deficiency; approval excuses it while retaining original timestamps and audit evidence. Whole-period approval waits until the period ends.

**Why:** The owner described a simple reason/optional-attachment → HR accept/reject workflow. Approving an entire unfinished period would also excuse a future early departure or missing checkout that HR has not reviewed.

**How to apply:** Allow submission while a deficiency exists, but keep an unfinished period pending. Never count a not-yet-ended shift as absence. Keep sick-leave medical documentation separate from attendance explanations.

Departments may only be deleted after all employees have been moved out, including inactive employees.

**Why:** The owner explicitly made removing employees from a department a prerequisite for deletion; employment history must not be orphaned.

**How to apply:** Enforce this in the database as well as the UI, so concurrent assignment cannot bypass the restriction.

Department deletion is logical catalog removal; existing PostgreSQL enum values remain available internally rather than being physically removed or converting the whole legacy schema.

**Why:** Physical enum cleanup would require a broad migration across existing business tables. Removing the catalog entry already removes the usable department without risking old data.

**How to apply:** Populate selectors from the live catalog, not the legacy enum list; otherwise a deleted department reappears as a selectable option.

HR attendance setup is a primary workflow: workplace zones, schedule periods/work hours, and employee assignment must remain immediately discoverable, not buried inside advanced reports.

**Why:** The owner repeatedly could not find the controls needed to configure attendance. Hiding essential setup made the system appear nonfunctional even when its underlying forms existed.

**How to apply:** Keep concise, visible setup navigation alongside daily monitoring. On HR mobile pages, use one page heading, prioritize indicators, render employees as cards, and group exports/secondary tools separately. Preserve the desktop employee table the owner explicitly likes.
