# Order Status Flow - Technical Architecture

## Business Definitions

| Status | Meaning | despatch_date | User Action |
|--------|---------|---------------|-------------|
| **PENDING** | Order booked, not yet sent to courier | `null` | Order is in pipeline, awaiting packing/dispatch |
| **DISPATCHED** | Order sent/shipped to courier | Set when dispatched (stored as despatch_date in DB) | Order has left premises |

## State Transition

```
[Add New Order] → PENDING ←→ DESPATCHED
       ↓              ↑
[Mark as Dispatched]  |
       ↓              |
   DESPATCHED ────────┘
[Move to Pending] (undo)
```

- **PENDING → DISPATCHED**: User clicks "Dispatch". Sets `despatch_date = today`, `status = DESPATCHED`.
- **DISPATCHED → PENDING**: User clicks "Move to Pending" (e.g. clicked Dispatch by mistake). Sets `despatch_date = null`, `status = PENDING`.

## Filter Logic

| Tab | Date Field Used | "All Orders" checked | "All Orders" unchecked |
|-----|-----------------|----------------------|-------------------------|
| **PENDING** | `booking_date` | All PENDING orders | PENDING where booking_date in [From, To] |
| **DISPATCHED** | `despatch_date` | All DISPATCHED orders | DISPATCHED where despatch_date in [From, To] |

- **Dynamic labels**: PENDING tab shows "Booking From date" / "Booking To date" (filters by `booking_date`). DISPATCHED tab shows "Dispatch From date" / "Dispatch To date" (filters by `despatch_date`).

## Data Model

```sql
orders (
  status: 'PENDING' | 'DESPATCHED',
  booking_date: DATE,    -- when order was booked
  despatch_date: DATE?   -- when order was sent (null if PENDING)
)
```
