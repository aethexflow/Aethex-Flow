# AethexFlow Firestore Security Specification

## 1. Data Invariants
1. **Default Deny**: No Firestore path is readable or writable unless explicitly matched and verified.
2. **Verified Identity**: All authenticated writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Zero-Trust Ownership**: Every user-scoped document (`/users/{userId}` and subcollections `private`, `chats`, `workflows`, `activities`, `preferences`) strictly verifies `request.auth.uid == userId` and `incoming().uid == request.auth.uid`.
4. **PII Isolation**: User email addresses are stored exclusively inside `/users/{userId}/private/account`, never inside `/publicWorkflows` or `/users/{userId}` public metadata.
5. **Privilege Escalation Prevention**: Users cannot assign themselves `'operator'` or admin privileges (`role == 'member'` enforced on create, immutable on update), and `/admins/{uid}` is strictly server/console managed.
6. **Temporal Integrity & Native Collections**: All `createdAt`/`updatedAt` timestamps must match `request.time`. All workflow graphs use native Firestore maps (`nodes`, `edges` bounded lists `<= 40` items).

## 2. "Dirty Dozen" Attack Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Write to User Profile**: `setDoc('/users/u1', { uid: 'u1', ... })` with `auth: null`.
2. **Unverified Email Spoof**: Signed in with `email_verified: false` writing `/users/u1/workflows/wf1`.
3. **Cross-User Profile Read (PII Leak)**: `u2` calls `getDoc('/users/u1/private/account')`.
4. **Cross-User Chat Hijack**: `u2` writes `/users/u1/chats/m1` with `uid: 'u1'`.
5. **UID Impersonation on Create**: `u2` creates `/users/u2/workflows/wf1` with `uid: 'u1'`.
6. **Privilege Escalation on Profile Create**: `u1` creates `/users/u1` with `role: 'operator'`.
7. **Shadow Ghost Field Injection**: `u1` creates `/users/u1/chats/m1` adding `{ isAdmin: true }`.
8. **ID Poisoning Attack**: `u1` creates `/users/u1/workflows/${'a'.repeat(300)}` or invalid regex `../evil`.
9. **Client-Spoofed Timestamp**: `u1` sets `createdAt: new Date(2099, 0, 1)` instead of `serverTimestamp()`.
10. **Immutable Owner Mutation**: `u1` updates `/publicWorkflows/pw1` changing `authorUid` to `'u2'`.
11. **Public Workflow Tampering by Non-Author**: `u2` updates `name` or `graph` on `u1`'s `/publicWorkflows/pw1`.
12. **Unbounded Array / Type Poisoning**: `u1` updates `/users/u1/preferences/workspace` with `pinnedToolIds` exceeding 20 elements or `theme: 'invalid_theme'`.
