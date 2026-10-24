export type VenueId = "restaurant" | "cafe";
export type UserRole = "admin" | "waiter" | "cashier";
export type OrderStatus = "open" | "paid" | "cancelled";
export type PaymentMethod = "cash" | "card";
export type PrinterRole = "kitchen" | "checkout" | "both";
export type PrinterConnectionType = "network" | "local";

export type SystemPrinter = {
  name: string;
  driver: string;
  portName: string;
  isDefault: boolean;
  /** TCP/IP host when Windows installed the printer on a TCP/IP port. */
  host: string | null;
  port: number | null;
};
