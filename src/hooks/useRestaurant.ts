import { useState, useCallback, useEffect } from 'react';
import { MenuItem, Table, Order, OrderItem, InventoryItem, AuditActor } from '@/types/restaurant';
import { menuStore, tableStore, orderStore, inventoryStore, seedData } from '@/lib/store';
import { useAuth } from '@/context/AuthContext';
import { parseQty, areUnitsCompatible, convertQty } from '@/lib/units';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function actorFrom(user: { id: string; name: string; role: AuditActor['role'] } | null): AuditActor | undefined {
  if (!user) return undefined;
  return { id: user.id, name: user.name, role: user.role };
}

export function useRestaurant() {
  const { user } = useAuth();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    seedData();
    setMenuItems(menuStore.getAll());
    setTables(tableStore.getAll());
    setOrders(orderStore.getAll());
    setInventory(inventoryStore.getAll());
  }, [refreshKey]);

  const createOrder = useCallback((order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>) => {
    const withActor = { ...order, createdBy: order.createdBy ?? actorFrom(user) };
    const newOrder = orderStore.add(withActor);
    if (order.tableId) {
      tableStore.update(order.tableId, { status: 'occupied', currentOrderId: newOrder.id });
    }
    // Auto-deduct inventory
    order.items.forEach(item => {
      inventoryStore.deductForOrder(item.menuItemId, item.quantity);
    });
    refresh();
    return newOrder;
  }, [refresh, user]);

  const appendEventsForItemChanges = useCallback(
    (prevItems: OrderItem[], nextItems: OrderItem[], existingEvents: import('@/types/restaurant').OrderEvent[] = []) => {
      const events = [...existingEvents];
      const actor = actorFrom(user);
      const now = new Date().toISOString();
      nextItems.forEach(next => {
        const prev = prevItems.find(p => p.id === next.id);
        if (!prev || prev.status === next.status) return;
        let type: import('@/types/restaurant').OrderEventType | null = null;
        if (next.status === 'ready') type = 'item-ready';
        else if (next.status === 'served') type = 'item-served';
        else if (next.status === 'preparing') type = 'item-preparing';
        if (!type) return;
        events.push({
          id: generateId(),
          type,
          itemId: next.id,
          itemName: next.name,
          actor,
          at: now,
        });
      });
      return events;
    },
    [user],
  );

  const updateOrder = useCallback((id: string, updates: Partial<Order>) => {
    if (updates.items) {
      const current = orderStore.getAll().find(o => o.id === id);
      if (current) {
        const newEvents = appendEventsForItemChanges(current.items, updates.items, current.events);
        orderStore.update(id, { ...updates, events: newEvents });
        refresh();
        return;
      }
    }
    orderStore.update(id, updates);
    refresh();
  }, [refresh, appendEventsForItemChanges]);

  const updateOrderItemStatus = useCallback((orderId: string, itemId: string, status: OrderItem['status']) => {
    const order = orderStore.getAll().find(o => o.id === orderId);
    if (!order) return;
    const updatedItems = order.items.map(item =>
      item.id === itemId ? { ...item, status } : item
    );
    const allReady = updatedItems.every(i => i.status === 'ready' || i.status === 'served');
    const newEvents = appendEventsForItemChanges(order.items, updatedItems, order.events);
    orderStore.update(orderId, {
      items: updatedItems,
      status: allReady ? 'ready' : 'preparing',
      events: newEvents,
    });
    refresh();
  }, [refresh, appendEventsForItemChanges]);

  const completeOrder = useCallback((orderId: string, paymentMethod: Order['paymentMethod'], tip?: number) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return { ok: false as const, reason: 'not-found' as const };
    const pending = order.items.filter(i => i.status !== 'served');
    if (pending.length > 0) {
      return { ok: false as const, reason: 'unserved-items' as const, pending };
    }
    orderStore.update(orderId, {
      status: 'completed',
      paid: true,
      paymentMethod,
      tip: tip || 0,
      closedBy: actorFrom(user),
      closedAt: new Date().toISOString(),
    });
    if (order.tableId) {
      tableStore.update(order.tableId, { status: 'free', currentOrderId: undefined });
    }
    refresh();
    return { ok: true as const };
  }, [orders, refresh, user]);

  const logPrint = useCallback(
    (orderId: string, kind: 'receipt' | 'served-items', note?: string) => {
      const order = orderStore.getAll().find(o => o.id === orderId);
      if (!order) return;
      const event: import('@/types/restaurant').OrderEvent = {
        id: generateId(),
        type: kind === 'receipt' ? 'receipt-printed' : 'served-items-printed',
        actor: actorFrom(user),
        at: new Date().toISOString(),
        note,
      };
      orderStore.update(orderId, { events: [...(order.events ?? []), event] });
      refresh();
    },
    [refresh, user],
  );

  const cancelOrder = useCallback((orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    orderStore.update(orderId, {
      status: 'cancelled',
      cancelledBy: actorFrom(user),
      cancelledAt: new Date().toISOString(),
    });
    if (order.tableId) {
      tableStore.update(order.tableId, { status: 'free', currentOrderId: undefined });
    }
    refresh();
  }, [orders, refresh, user]);

  const syncInventoryLinks = useCallback((menuItemId: string, recipe?: MenuItem['recipe']) => {
    // Map inventory id -> qty string from the recipe (e.g. "200 g", "0,25kg", "1 un")
    const qtyByInvId = new Map<string, string>();
    (recipe?.ingredients || []).forEach(i => {
      if (i.inventoryItemId) qtyByInvId.set(i.inventoryItemId, i.qty || '');
    });
    const all = inventoryStore.getAll();
    all.forEach(inv => {
      const has = inv.linkedMenuItemIds.includes(menuItemId);
      const should = qtyByInvId.has(inv.id);
      const updates: Partial<InventoryItem> = {};
      if (has && !should) {
        updates.linkedMenuItemIds = inv.linkedMenuItemIds.filter(id => id !== menuItemId);
      } else if (!has && should) {
        updates.linkedMenuItemIds = [...inv.linkedMenuItemIds, menuItemId];
      }
      if (should) {
        // Parse qty + unit and convert to the inventory unit
        const parsed = parseQty(qtyByInvId.get(inv.id) || '');
        if (parsed && areUnitsCompatible(parsed.unit, inv.unit)) {
          const converted = convertQty(parsed, inv.unit);
          if (converted != null && converted > 0 && converted !== inv.usagePerServing) {
            updates.usagePerServing = converted;
          }
        }
      }
      if (Object.keys(updates).length > 0) {
        inventoryStore.update(inv.id, updates);
      }
    });
  }, []);

  const addMenuItem = useCallback((item: Omit<MenuItem, 'id'>) => {
    const created = menuStore.add(item);
    syncInventoryLinks(created.id, created.recipe);
    refresh();
  }, [refresh, syncInventoryLinks]);

  const updateMenuItem = useCallback((id: string, updates: Partial<MenuItem>) => {
    const updated = menuStore.update(id, updates);
    if (updated) syncInventoryLinks(id, updated.recipe);
    refresh();
  }, [refresh, syncInventoryLinks]);

  const deleteMenuItem = useCallback((id: string) => {
    // remove from inventory links
    inventoryStore.getAll().forEach(inv => {
      if (inv.linkedMenuItemIds.includes(id)) {
        inventoryStore.update(inv.id, {
          linkedMenuItemIds: inv.linkedMenuItemIds.filter(x => x !== id),
        });
      }
    });
    menuStore.remove(id);
    refresh();
  }, [refresh]);

  // Inventory CRUD
  const addInventoryItem = useCallback((item: Omit<InventoryItem, 'id'>) => {
    inventoryStore.add(item);
    refresh();
  }, [refresh]);

  const updateInventoryItem = useCallback((id: string, updates: Partial<InventoryItem>) => {
    inventoryStore.update(id, updates);
    refresh();
  }, [refresh]);

  const deleteInventoryItem = useCallback((id: string) => {
    inventoryStore.remove(id);
    refresh();
  }, [refresh]);

  const lowStockItems = inventory.filter(i => i.currentStock <= i.minStock);
  const activeOrders = orders.filter(o => !o.paid && o.status !== 'cancelled');
  const kitchenOrders = orders.filter(o => ['active', 'preparing'].includes(o.status) && !o.paid);

  // Tables CRUD
  const addTable = useCallback((table: Omit<Table, 'id'>) => {
    tableStore.add(table);
    refresh();
  }, [refresh]);

  const updateTable = useCallback((id: string, updates: Partial<Table>) => {
    tableStore.update(id, updates);
    refresh();
  }, [refresh]);

  const deleteTable = useCallback((id: string) => {
    tableStore.remove(id);
    refresh();
  }, [refresh]);

  return {
    menuItems, tables, orders, activeOrders, kitchenOrders,
    inventory, lowStockItems,
    createOrder, updateOrder, updateOrderItemStatus, completeOrder, cancelOrder,
    addMenuItem, updateMenuItem, deleteMenuItem,
    addInventoryItem, updateInventoryItem, deleteInventoryItem,
    addTable, updateTable, deleteTable,
    logPrint,
    refresh, generateId,
  };
}
