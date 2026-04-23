# Security Specification for iCall

## Data Invariants
1. **Username Uniqueness**: Users can only claim a username if not already exists. Handled via the `/usernames/{username}` collection which must match the user's ID.
2. **Identity Integrity**: Users can only write to their own `/users/{userId}` document.
3. **Friend-Only calling**: A call can ONLY be created if a friendship exists in `/friends/{callerId}/activeFriends/{receiverId}`.
4. **Call State Transitions**: Calls must follow the path `calling -> ringing -> connected -> ended`. Once `ended`, `declined`, or `missed`, no further updates are allowed (terminal state locking).
5. **PII Isolation**: FCM tokens are sensitive and should only be readable by the user or potentially the caller if needed for push? Actually, the caller needs to trigger a push. Usually FCM tokens are private. I'll make them private.

## The Dirty Dozen Payloads (Targeted for Permission Denied)
1. **Identity Spoof**: User A tries to update User B's profile.
2. **Username Hijack**: User A tries to delete User B's username mapping.
3. **Illegal Call**: User A tries to call User B without being friends.
4. **State Skip**: Caller tries to set state directly to `connected`.
5. **Answer Forge**: User A tries to answer a call intended for User B.
6. **Candidate Spam**: User C (not in call) tries to add candidates to Call X.
7. **Phantom Friend**: User A tries to add User B as a friend without User B accepting.
8. **Double Accept**: User B tries to accept a request that was already rejected.
9. **Toxic ID**: Trying to create a call with a 1MB string as ID.
10. **Time Machine**: Setting `createdAt` to a future time.
11. **Self-Friend**: User A trying to be friends with themselves.
12. **Zombie Call**: Updating a call that is already in state `ended`.

## Verification
- `isFriend(a, b)` helper using `get()` on `/friends/a/activeFriends/b`.
- `isValidCall(data)` schema validation.
- `affectedKeys().hasOnly(...)` for state transitions.
