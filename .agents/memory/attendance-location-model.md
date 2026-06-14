---
name: Attendance location/zone data model
description: How employee "location" relates to attendance records and location_zones; why the monitor location filter must be client-side.
---

# Attendance location naming

There are three distinct sources of "location" in the attendance feature, and they do NOT share a controlled vocabulary:

- Employee "home" location is free text: `employees.fingerprintLocation || fingerScanLocation` (often "غير محدد").
- A check-in/out record's `locationName` is set server-side to the matched `location_zones.nameAr` (geofence match), or null/echoed client value when no zone matches.
- `location_zones` are the admin-defined geofences with `nameAr`.

**Why:** the old monitor filter hardcoded options "مصنع"/"معرض" and asked the server to filter by `locationName`, which broke because employee home-location strings rarely equal zone names. 

**How to apply:** build the location dropdown dynamically from the union of active zone `nameAr` + employee `locationName` + record `locationName`. Filter client-side: an employee matches a location if their home `locationName` equals it OR they have any record with that `locationName`. Don't send `locationName` to `/api/attendance/monitor`; fetch all and filter in the client so multi-day/zone math stays consistent.

# Employee PIN

`employeePin` lives on `users` (nullable text), not `employees`; employees link via `employees.userId`. Never send the actual pin to the client — expose only `hasPin: !!user.employeePin`. Verify via `POST /api/attendance/verify-pin` (per-IP rate limited). If an employee has no pin, verify returns `{success:true, noPin:true}` and the portal skips the pin step.
