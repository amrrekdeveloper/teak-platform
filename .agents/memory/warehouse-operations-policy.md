---
name: Warehouse operating boundaries
description: TEAK warehouse keeper responsibilities, physical stock versus purchasing, and preservation of legacy stock
---

The warehouse keeper manages main/subordinate warehouses, their physical descriptions, and flexible category trees. A parent category may contain both items and subcategories. Warehouse stock includes kitchen materials and non-kitchen machines, equipment, and vehicles.

**Why:** The owner explicitly requested this mixed factory use case on 2026-10-28, not a kitchen-only catalogue or a financial fixed-assets replacement.

**How to apply:** Keep material quantities and item units meaningful; do not aggregate metres, pieces, and kilograms into a stock quantity. Storing a vehicle or machine must not silently capitalize or depreciate it in accounting.

Shortage requests go to the existing purchasing workflow. Approval or ordering does not add stock. Only the warehouse keeper's actual receipt, including partial receipts, adds the received quantity. Issues identify the recipient and purpose; transfers have two linked sides; counts preserve their adjustment evidence.

**Why:** The owner described repeated partial consumption and a zero-stock request that purchasing may accept or reject before goods physically arrive.

**How to apply:** Reject overdrafts, preserve explicit rejection, and prevent duplicate receipts or count overwrites after intervening movements. Do not substitute a purchase-order status change for physical delivery.

Preserve legacy balances and records. A legacy item without a known warehouse remains unassigned until the keeper explicitly assigns it with a reason.

**Why:** The user asked to extend the existing architecture and production data, not replace or invent them.

**How to apply:** Do not infer historical warehouses or fabricate movement balances. Archive rather than erase operational history.

Purchasing and warehouse users may work in separate sessions or on separate devices; refreshing one user's local data does not refresh the other user's view.

**Why:** Procurement handoffs must become visible to the keeper without requiring a full browser reload. An empty cached list must not imply that no delivery is ready.

**How to apply:** Give handoff queues bounded freshness and a complete explicit refresh. Treat unreadable responses as errors, not empty queues.
