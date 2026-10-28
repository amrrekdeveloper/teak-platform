---
name: Employee records versus application accounts
description: Owner-requested separation of HR placement, optional employee/account linkage, and phased account administration
---

User accounts must be creatable with or without an employee link. Employee records, organizational placement and job titles must not be prerequisites for creating a system login or sources of automatic application privileges.

**Why:** The owner explicitly requested on 2026-10-28 a simple account-administration screen that can grant access to HR, warehouses and their functions, without making HR more complex or damaging the existing architecture.

**How to apply:** Keep HR responsible for employee files and placement. Keep system access explicit and independently administered. Optional linking must not create duplicate employees or change payroll, attendance evidence or employment data.

Expand the current owner account-management screen into user administration first; a broader TEAK IT system is a later phase, not permission to add ticketing, assets or a large organizational engine now.

**Why:** The owner described the IT transformation as gradual and asked for usable, simple screens rather than more HR complexity.

**How to apply:** Separate account-administrator authority from merely belonging to the IT department. Do not automatically give the existing technical IT role, global owner powers or payroll access to an employee based on their job title.

The designated owner controls delegation of account administration. Explicitly authorized administrators or IT accounts may provision and maintain ordinary accounts within the programs the owner permits.

**Why:** On 2026-10-28 the owner expanded the earlier owner-only phase, requesting unified user sign-in and the ability to authorize other administrators and IT staff to administer accounts.

**How to apply:** Keep account-management authorization independent of employment placement and the legacy technical IT role. Only the owner grants or withdraws bounded delegation; delegates cannot administer owners, themselves, other administrators, or accounts with access outside their assigned programs. Do not leave alternate provisioning endpoints that bypass these checks.

Staff use one username/password entry and a dashboard of their authorized systems; employee self-service retains its separate entry.

**Why:** The owner explicitly requested one shield-based login for HR, warehouses, purchasing and future systems, without duplicating identities or changing the employee entry.

**How to apply:** Extend the shared workspace registry and existing authentication, not a parallel user/session store. A single available system may open directly; multiple systems require an authorized selector. Preserve server-side workspace isolation and the public maintenance boundary.
