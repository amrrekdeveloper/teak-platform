---
name: Administrative login policy
description: Owner-managed passwords through the system-admin panel, short password requirements, and safe remembered sign-in.
---

HR account creation/resets and owner self-service password changes must accept a minimum of six characters containing a Latin uppercase letter, Latin lowercase letter, a digit, and a punctuation/symbol character. Do not silently raise the minimum again. This is not a reason to invalidate existing passwords at login or automatically change owner credentials.

**Why:** The owner explicitly approved these requirements after repeated difficulty entering long passwords on phones, and will reset HR passwords personally through the system-admin panel.

**How to apply:** Enforce the same requirements in the HR creation/reset interface and backend. Keep login verification compatible with existing credentials, retain rate limits and password hashing, and never reset real credentials merely to verify the feature.

The owner manages both their own password and the HR accounts they created through the system-admin panel. Provide the controls; the owner chooses and applies the passwords personally in each environment.

**Why:** The owner explicitly clarified that account/password management belongs in the system-admin panel, not in an employee-OTP redesign or agent-applied credential resets.

**How to apply:** Owner self-change requires their current password and ends all of their administrative sessions, including the current one. HR-account resets do not require the HR account's previous password. Keep ordinary panel changes independent of startup provisioning/recovery Secrets, and do not alter real credentials or publish just to test.

Remembered administrative sign-in must use revocable HttpOnly server sessions and browser password-manager support, never application-managed plaintext password storage. Keep remembered usernames separate by administrative entry point.

**Why:** The owner requested convenient repeat login without confusing the independent HR and system-owner accounts. Browser credential storage avoids exposing passwords to application scripts.

**How to apply:** Make persistent sign-in explicit and warn against shared devices. Preserve role isolation, logout, and password-reset session revocation. Do not claim an operating-system password-save prompt is guaranteed by the application.

Login controls must preserve credentials populated silently by a browser password manager, including when toggling remembered sign-in or password visibility.

**Why:** Verification reproduced autofilled DOM values being erased by a React rerender because controlled state had never received an input/change event.

**How to apply:** Keep the native form authoritative for submitted credentials. Before converting these fields back to controlled inputs, verify silent autofill followed by a remember/visibility toggle and submission.
