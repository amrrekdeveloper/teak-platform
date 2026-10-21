---
name: Attendance operations policy
description: Owner requirements for employee attendance, geofences, schedule choices and deficiency approval.
---
Attendance belongs to the employee's assigned workplace, not their home-location note. A workplace may offer several alternative schedules; each alternative has one or two periods, and the employee is assigned one alternative, not all alternatives combined.

**Why:** The owner explicitly requested multiple options at the same location, including a single 07:30–14:30 option and a separate split 09:00–12:00 / 16:00–22:00 option.

**How to apply:** Keep workplace assignment, schedule-option assignment and home-location notes separate. Configure geofences by choosing a center and numeric radius, not manual shape drawing.

An employee explanation is an HR approval request, not permission to overwrite a punch. Pending/rejected explanations retain the deficiency; approval excuses it while retaining original timestamps and audit evidence. Whole-period approval waits until the period ends.

**Why:** The owner described a simple reason/optional-attachment → HR accept/reject workflow. Approving an entire unfinished period would also excuse a future early departure or missing checkout that HR has not reviewed.

**How to apply:** Allow submission while a deficiency exists, but keep an unfinished period pending. Never count a not-yet-ended shift as absence. Keep sick-leave medical documentation separate from attendance explanations.

Departments may only be deleted after all employees have been moved out, including inactive employees.

**Why:** The owner explicitly made removing employees from a department a prerequisite for deletion; employment history must not be orphaned.

**How to apply:** Enforce this in the database as well as the UI, so concurrent assignment cannot bypass the restriction.

Department deletion is logical catalog removal; existing PostgreSQL enum values remain available internally rather than being physically removed or converting the whole legacy schema.

**Why:** Physical enum cleanup would require a broad migration across existing business tables. Removing the catalog entry already removes the usable department without risking old data.

**How to apply:** Populate selectors from the live catalog, not the legacy enum list; otherwise a deleted department reappears as a selectable option.
