# Friend Ledger Flow

## Friend Connection

Connection codes identify a user, but they do not create trust by themselves.

1. User enters a connection code.
2. App calls `POST /api/friends/verify` and shows the matched display name.
3. User sends a request with `POST /api/friends/request`.
4. Friend sees an incoming request in the Friends page.
5. Friend accepts or rejects with `POST /api/friends/respond`.
6. Only `connected` friends are shown as verified and eligible for shared settlements.

Blocked users cannot send new requests, mirror records, or create settlement events.

## Owe / Owed Records

Owe/owed records are shared ledger items, not silent copies.

- A connected friend can create an owe record.
- The opposite side sees it as a pending shared item.
- Edits are tracked with the previous value and marked as edited.
- Deletions require confirmation and are soft-deleted if linked to historical records.

## Repayment And Settlement

Repayments are acknowledgement-based.

1. One side creates a repayment request.
2. The other side accepts or rejects it.
3. Accepted repayments reduce the open balance.
4. Partial repayments stay linked to the original settlement through `previous_event_id`.
5. The remaining amount stays open until fully repaid and acknowledged.

This prevents one device from marking money as settled without the other side confirming it.

## Transaction Edits

Every transaction edit stores:

- previous payload
- next payload
- edit timestamp
- optional edit note

The UI should show an `Edited` marker and the last pre-edit values.
