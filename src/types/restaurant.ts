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
  image?: string; // storage path — herda a imagem do ingrediente do inventário quando ligado (inventoryItemId)
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
  status: 'awaiting-confirmation' | 'active' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  customerName?: string;
  customerPhone?: string;
  customerId?: string;
  /** Snapshot da morada usada neste pedido — só para 'delivery' submetido pelo próprio cliente. */
  deliveryAddress?: string;
  createdAt: string;
  updatedAt: string;
  total: number;
  discount?: number;
  tip?: number;
  packagingFee?: number; // taxa de embalagem — só para takeaway/entrega, já incluída em `total`
  paymentMethod?: 'cash' | 'card' | 'mobile-money';
  paid: boolean;
  createdBy?: AuditActor;
  closedBy?: AuditActor;
  cancelledBy?: AuditActor;
  closedAt?: string;
  cancelledAt?: string;
  events?: OrderEvent[];
  /** Conta dividida em parcelas — cada uma com o seu próprio método. Não
   *  substitui `total`/`paymentMethod`/`paid` (que continuam a reflectir o
   *  resumo final quando o pedido fecha); é só o rasto de como foi
   *  efectivamente cobrado. Ver T4.1. */
  payments?: OrderPayment[];
}

export interface OrderPayment {
  id: string;
  method: 'cash' | 'card' | 'mobile-money';
  amount: number;
  at: string;
  closedBy?: AuditActor;
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
  icon?: string; // emoji
  image?: string; // storage path — sobrepõe o icon quando presente
}

export type UserRole = 'waiter' | 'cashier' | 'kitchen' | 'manager' | 'admin' | 'superadmin';

export interface Staff {
  id: string;
  name: string;
  role: UserRole;
  pin?: string;
}

export type BillingPlan =
  | 'monthly' | 'quarterly' | 'semiannual' | 'annual'
  | 'basic-monthly' | 'basic-quarterly' | 'basic-semiannual' | 'basic-annual';
export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'blocked';

export interface Subscription {
  plan: BillingPlan | null;
  status: SubscriptionStatus;
  startedAt?: string;
  expiresAt?: string;
  lastPaymentRef?: string;
  blockedByAdmin?: boolean;
  blockReason?: string;
  history?: { plan: BillingPlan; paidAt: string; ref?: string; price?: number }[];
}

export interface Tenant {
  id: string;
  name: string;
  ownerEmail: string;
  ownerPhone?: string;
  licenseKey: string;
  createdAt: string;
  subscription: Subscription;
}

export interface Account {
  id: string;
  /** @deprecated use tenantIds; kept for retro-compat during migration */
  tenantId: string;
  /** All tenants owned by this account. The primary/active one is `tenantId` fallback. */
  tenantIds?: string[];
  email: string;
  passwordHash: string;
  /** 'admin' owns tenants (formerly 'manager'); 'superadmin' owns the platform. */
  role: 'admin' | 'superadmin';
  name: string;
  phone?: string;
  createdAt: string;
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

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  nuit?: string;
  birthday?: string; // 'MM-DD' or full ISO
  notes?: string;
  /** Morada de entrega guardada — reutilizada como sugestão em pedidos de entrega futuros. */
  address?: string;
  pointsAdjustment: number; // manual additions/redemptions
  createdAt: string;
}

export type ExpenseCategory = 'water' | 'energy' | 'other';

/**
 * Despesa (água, energia, renda, ou uma compra pontual) em MT.
 * Recorrente: `amount` é o valor mensal actual — o histórico de valores
 * passados vive em expense_amount_history (ver src/lib/expenses.ts), usado
 * por Relatórios para não reescrever o lucro de meses já fechados quando o
 * valor muda. Pontual (recurring: false): `amount` é o valor único gasto em
 * `expenseDate`, sem histórico — entra só no período que contém essa data.
 */
export interface Expense {
  id: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  recurring: boolean;
  expenseDate?: string;
  createdAt: string;
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
