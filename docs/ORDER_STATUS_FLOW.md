# Order Status Flow - Technical Architecture

## Business Definitions

| Status | Meaning | despatch_date | User Action |
|--------|---------|---------------|-------------|
| **PENDING** | Order booked, not yet sent to courier | `null` | Order is in pipeline, awaiting packing/dispatch |
| **DESPATCHED** | Order sent/shipped to courier | Set when dispatched | Order has left premises |

## State Transition

```
[Add New Order] → PENDING ←→ DESPATCHED
       ↓              ↑
[Mark as Despatched]  |
       ↓              |
   DESPATCHED ────────┘
[Move to Pending] (undo)
```

- **PENDING → DESPATCHED**: User clicks "Despatch". Sets `despatch_date = today`, `status = DESPATCHED`.
- **DESPATCHED → PENDING**: User clicks "Move to Pending" (e.g. clicked Despatch by mistake). Sets `despatch_date = null`, `status = PENDING`.

## Filter Logic

| Tab | Date Field Used | "All Orders" checked | "All Orders" unchecked |
|-----|-----------------|----------------------|-------------------------|
| **PENDING** | `booking_date` | All PENDING orders | PENDING where booking_date in [From, To] |
| **DESPATCHED** | `despatch_date` | All DESPATCHED orders | DESPATCHED where despatch_date in [From, To] |

- **Dynamic labels**: PENDING tab shows "Booking From date" / "Booking To date" (filters by `booking_date`). DESPATCHED tab shows "Despatch From date" / "Despatch To date" (filters by `despatch_date`).

## Data Model

```sql
orders (
  status: 'PENDING' | 'DESPATCHED',
  booking_date: DATE,    -- when order was booked
  despatch_date: DATE?   -- when order was sent (null if PENDING)
)
```
