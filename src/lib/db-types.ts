export type OrderStatus = "PENDING" | "DESPATCHED";

export interface Order {
  id: string;
  recipient_details: string;
  sender_details: string;
  booked_by: string;
  booked_mobile_no: string;
  courier_name: string;
  booking_date: string;
  despatch_date: string | null;
  status: OrderStatus;
  quantity?: number | null;
  created_at: string;
  updated_at: string;
  user_id: string;
}

export interface OrderInsert {
  recipient_details: string;
  sender_details: string;
  booked_by: string;
  booked_mobile_no: string;
  courier_name: string;
  booking_date: string;
  status: OrderStatus;
  user_id: string;
  quantity?: number | null;
}
