export type OrderStatus = "PENDING" | "DESPATCHED";
export type OrderSource = "manual" | "website";
/** Website orders only: paid checkout vs unpaid / failed / pending attempt. */
export type OrderPaymentStatus = "paid" | "unpaid";

export type WebsiteOrderLineItem = {
  productId?: string | null;
  name: string;
  productCode?: string | null;
  quantity: number;
  imageUrl?: string | null;
  unitPrice?: number | null;
};

export interface Order {
  id: string;
  recipient_details: string;
  sender_details: string;
  booked_by: string;
  booked_mobile_no: string;
  courier_name: string;
  booking_date: string;
  despatch_date: string | null;
  /** Full instant when marked DESPATCHED (IST display). */
  despatched_at?: string | null;
  status: OrderStatus;
  quantity?: number | null;
  tracking_number?: string | null;
  order_source?: OrderSource | null;
  external_order_id?: string | null;
  payment_status?: OrderPaymentStatus | null;
  website_line_items?: WebsiteOrderLineItem[] | null;
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
  order_source?: OrderSource;
  external_order_id?: string | null;
  payment_status?: OrderPaymentStatus | null;
  website_line_items?: WebsiteOrderLineItem[] | null;
  /** Shop placed/paid instant when importing website orders (not sync time). */
  created_at?: string;
}
