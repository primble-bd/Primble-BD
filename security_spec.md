# Security Specification — Primble BD LTD Firestore Rules

## 1. Data Invariants
1. **Owner-Bound Profiles**: Every `/users/{userId}` and `/accounts/{userId}` document must have `uid == userId` and be created either by `request.auth.uid == userId` (standard registration) or by a verified Super Admin (provisioning staff).
2. **Verified Identity**: Write operations across all collections require `request.auth != null && request.auth.token.email_verified == true`.
3. **Granular Staff RBAC (`perms`) vs Super Admin**: Only Super Admin (`office.primble@gmail.com` or `/admins/{uid}` with `isSuperAdmin == true && active == true`) can create/edit/revoke `/admins/{staffUid}` or grant `ADMIN` roles. Staff admins are strictly restricted server-side by `hasPerm(perm)` matching their active `/admins/{uid}.perms` list.
4. **PII Isolation**: `/users/{userId}`, `/accounts/{userId}`, and `/kycDocs/{userId}` contain PII (`email`, `ph`, `addr`, `dob`, NID/selfie images); reads are strictly restricted to the owner or authorized admins.
5. **Strict Schema & Server Timestamps**: Only allowlisted keys are permitted; `createdAt` must equal `request.time` on create and remain immutable on update; `updatedAt` must equal `request.time` on updates.

## 2. Dirty Dozen Adversarial Payloads (Expected: `PERMISSION_DENIED`)
1. **Shadow Field Injection**: `{ uid, name, role: "GENERAL_CUSTOMER", isAdmin: true, createdAt, updatedAt }`
2. **Balance Tampering**: `{ uid, name, role: "GENERAL_CUSTOMER", bal: 999999, createdAt, updatedAt }`
3. **Self-Assigned Admin / Staff Privilege Escalation**: Non-super-admin writing `/admins/{uid}` with `{ uid, email, isSuperAdmin: true, perms: ["kyc", "pay"] }`
4. **Staff Permission Bypass**: Staff with only `perms: ["ban"]` attempting to approve a `PENDING` withdrawal in `/requests/{reqId}` or credit `/accounts/{userId}` balance
5. **UID Mutation on Update**: Updating `/users/{uid}` or `/accounts/{uid}` changing `uid` to another user's ID
6. **Role Escalation on Update**: Non-admin updating `role` from `"GENERAL_CUSTOMER"` to `"ADMIN"` or altering own `perms` array
7. **Resource Exhaustion (1MB String)**: Updating `addr` with a 2,000-character string (`> 300` max)
8. **ID Poisoning**: Creating `/users/bad$id!@#` violating `^[a-zA-Z0-9_\-]+$`
9. **Spoofed Unverified Admin**: Request with `email: "office.primble@gmail.com"` and `email_verified: false`
10. **Forged Timestamp**: Creating profile or admin record with client-supplied past timestamp instead of `request.time`
11. **Unbounded Array Injection**: Setting `notif` or `perms` array beyond max length or invalid element type
12. **Blanket Collection Read**: Authenticated non-admin querying `collection(db, "accounts")` without `where("uid", "==", auth.uid)`
