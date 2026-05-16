// Core types for the restaurant management system

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  description?: string;
  image?: string;
  modifiers?: Modifier[];
  available: boolean;
  recipe?: Recipe;
}

export interface RecipeIngredient {
  name: string;
  qty: string;
  icon?: string;
  inventoryItemId?: string;
}

export interface RecipeStep {
  label: string;
  icon?: string;
}

export interface Recipe {
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  temp?: string;
}

export interface Modifier {
  id: string;
  name: string;
  price: number;
}

export interface Table {
  id: string;
  number: number;
  seats: number;
  status: 'free' | 'occupied' | 'reserved';
  currentOrderId?: string;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
  modifiers?: Modifier[];
  notes?: string;
  status: 'pending' | 'preparing' | 'ready' | 'served';
}

export interface Order {
  id: string;
  tableId?: string;
  tableNumber?: number;
  type: 'dine-in' | 'takeaway' | 'delivery';
  items: OrderItem[];
  status: 'active' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  customerName?: string;
  customerPhone?: string;
  createdAt: string;
  updatedAt: string;
  total: number;
  discount?: number;
  tip?: number;
  paymentMethod?: 'cash' | 'card' | 'mobile-money';
  paid: boolean;
  createdBy?: AuditActor;
  closedBy?: AuditActor;
  cancelledBy?: AuditActor;
  closedAt?: string;
  cancelledAt?: string;
  events?: OrderEvent[];
}

export type OrderEventType =
  | 'item-ready'
  | 'item-served'
  | 'item-preparing'
  | 'item-pending'
  | 'receipt-printed'
  | 'served-items-printed';

export interface OrderEvent {
  id: string;
  type: OrderEventType;
  itemId?: string;
  itemName?: string;
  actor?: AuditActor;
  at: string; // ISO
  note?: string;
}

export interface AuditActor {
  id: string;
  name: string;
  role: UserRole;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string; // e.g. 'kg', 'un', 'L'
  currentStock: number;
  minStock: number;
  costPerUnit: number;
  linkedMenuItemIds: string[]; // menu items that consume this ingredient
  usagePerServing: number; // how much is consumed per serving
}

export type UserRole = 'waiter' | 'cashier' | 'kitchen' | 'manager' | 'admin';

export interface Staff {
  id: string;
  name: string;
  role: UserRole;
  pin?: string;
}

export interface SecurityAlert {
  id: string;
  type: 'failed-pin';
  message: string;
  attemptedPin: string;
  attempts: number;
  createdAt: string;
  read: boolean;
}

export interface Shift {
  id: string;
  staffId: string;
  staffName: string;
  staffRole: UserRole;
  clockIn: string; // ISO
  clockOut?: string; // ISO
  notes?: string;
}
