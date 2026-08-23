import { useState, useCallback, useEffect } from 'react';
import { MenuItem, Table, Order, OrderItem, OrderPayment, InventoryItem, AuditActor } from '@/types/restaurant';
import { menuStore, tableStore, orderStore, inventoryStore, customerStore, subscribeOperations, subscribeLocalWrites, generateId } from '@/lib/store';
import { useAuth } from '@/context/AuthContext';
import { parseQty, areUnitsCompatible, convertQty } from '@/lib/units';

function actorFrom(user: { id: string; name: string; role: AuditActor['role'] } | null): AuditActor | undefined {
  if (!user) return undefined;
  return { id: user.id, name: user.name, role: user.role };
}

export function useRestaurant() {
  const { user, catalogVersion } = useAuth();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // catalogVersion bumps once AuthContext's background tenant-catalog
  // fetch resolves. `loading` (and therefore this page mounting at all)
  // doesn't wait on that fetch — without this dependency, a page that
  // mounts before it lands reads localStorage too early and is then stuck
  // with empty/stale data until a Supabase Realtime event happens to fire
  // (which may be never, e.g. in tests, or slow on a poor connection).
  useEffect(() => {
    setMenuItems(menuStore.getAll());
    setTables(tableStore.getAll());
    setOrders(orderStore.getAll());
    setInventory(inventoryStore.getAll());
  }, [refreshKey, catalogVersion]);

  // Realtime: keep orders/tables in sync across devices (KDS, mesas, POS).
  const tenantId = user?.tenantId;
  useEffect(() => {
    if (!tenantId) return;
    const unsubscribe = subscribeOperations(tenantId, refresh);
    return unsubscribe;
  }, [tenantId, refresh]);

  // Um pagamento optimista (completeOrder → orderStore.completePayment) que
  // o servidor acaba por rejeitar reverte o pedido no localStorage bem
  // depois deste hook já ter devolvido sucesso ao POSPage — sem isto o ecrã
  // ficava preso a mostrar o pedido como fechado mesmo depois do revert.
  useEffect(() => subscribeLocalWrites(refresh), [refresh]);


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

  const appendOrderItems = useCallback((orderId: string, items: OrderItem[]) => {
    const order = orderStore.getAll().find(o => o.id === orderId);
    if (!order) return false;
    const merged = [...order.items];
    items.forEach(ni => {
      const existing = merged.find(
        m => m.menuItemId === ni.menuItemId && m.status === 'pending'
          && !m.notes && !ni.notes
          && (!m.modifiers || m.modifiers.length === 0) && (!ni.modifiers || ni.modifiers.length === 0),
      );
      if (existing) {
        existing.quantity += ni.quantity;
      } else {
        merged.push(ni);
      }
    });
    const newTotal = merged.reduce((s, i) => s + i.price * i.quantity, 0);
    const newStatus: Order['status'] =
      order.status === 'completed' || order.status === 'cancelled' ? order.status : 'active';
    orderStore.update(orderId, { items: merged, total: newTotal, status: newStatus });
    items.forEach(i => inventoryStore.deductForOrder(i.menuItemId, i.quantity));
    refresh();
    return true;
  }, [refresh]);

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

  const completeOrder = useCallback(async (
    orderId: string,
    paymentMethod: Order['paymentMethod'],
    tip?: number,
    loyalty?: { customerId?: string; discount?: number; redeemedPoints?: number; packagingFee?: number },
  ) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return { ok: false as const, reason: 'not-found' as const };
    const pending = order.items.filter(i => i.status !== 'served');
    if (pending.length > 0) {
      return { ok: false as const, reason: 'unserved-items' as const, pending };
    }
    const discount = Math.max(0, loyalty?.discount ?? 0);
    const packagingFee = Math.max(0, loyalty?.packagingFee ?? 0);
    const originalSubtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const newTotal = Math.max(0, originalSubtotal - discount) + packagingFee;
    const result = await orderStore.completePayment(orderId, {
      status: 'completed',
      paid: true,
      paymentMethod,
      tip: tip || 0,
      discount: discount || undefined,
      packagingFee: packagingFee || undefined,
      total: newTotal,
      customerId: loyalty?.customerId ?? order.customerId,
      closedBy: actorFrom(user),
      closedAt: new Date().toISOString(),
    });
    if (!result.ok) {
      refresh();
      return { ok: false as const, reason: 'sync-failed' as const, error: result.error };
    }
    if (order.tableId) {
      tableStore.update(order.tableId, { status: 'free', currentOrderId: undefined });
    }
    // Redeem points: decrement adjustment (earning is automatic via order total)
    if (loyalty?.customerId && loyalty.redeemedPoints && loyalty.redeemedPoints > 0) {
      const customer = customerStore.getAll().find(c => c.id === loyalty.customerId);
      if (customer) {
        customerStore.update(customer.id, {
          pointsAdjustment: (customer.pointsAdjustment || 0) - loyalty.redeemedPoints,
        });
      }
    }
    refresh();
    return { ok: true as const };
  }, [orders, refresh, user]);

  // T4.1: dividir conta. Só regista a parcela (quem/quanto/método) — não
  // mexe em paid/total/status, que continuam a mudar só quando
  // `completeOrder` fecha o pedido de facto (a última chamada, quando as
  // parcelas já somam `targetTotal`). Isto evita duplicar a lógica de
  // desconto/taxa/fidelidade de completeOrder: o chamador (POSPage) só
  // precisa de invocar completeOrder normalmente assim que `remaining`
  // chegar a 0, exactamente como já fazia para um pagamento único.
  const addPartialPayment = useCallback((
    orderId: string,
    method: NonNullable<Order['paymentMethod']>,
    amount: number,
    targetTotal: number,
  ) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return { ok: false as const, error: 'Pedido não encontrado' };
    if (order.paid) return { ok: false as const, error: 'Pedido já foi pago' };
    const pending = order.items.filter(i => i.status !== 'served');
    if (pending.length > 0) return { ok: false as const, error: 'Há pratos por servir' };
    if (!(amount > 0)) return { ok: false as const, error: 'Valor inválido' };

    const alreadyPaid = (order.payments ?? []).reduce((s, p) => s + p.amount, 0);
    const remaining = Math.max(0, targetTotal - alreadyPaid);
    if (amount > remaining + 0.01) return { ok: false as const, error: 'Valor maior do que o em falta' };

    const payment: OrderPayment = { id: generateId(), method, amount, at: new Date().toISOString(), closedBy: actorFrom(user) };
    orderStore.addPayment(orderId, payment);
    refresh();
    return { ok: true as const, remaining: Math.max(0, remaining - amount) };
  }, [orders, refresh, user]);

  // Corrigir um engano antes de fechar a conta — só a parcela mais recente,
  // para não haver ambiguidade sobre qual remover.
  const removeLastPayment = useCallback((orderId: string) => {
    orderStore.removeLastPayment(orderId);
    refresh();
  }, [refresh]);

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

  // Um grupo que muda de mesa não devia obrigar a cancelar e recriar o
  // pedido (perdia o histórico de eventos, reimpressões, etc.) — só
  // transfere tableId/tableNumber no pedido e currentOrderId/status nas
  // duas mesas envolvidas.
  const moveOrderToTable = useCallback((orderId: string, newTableId: string) => {
    const order = orders.find(o => o.id === orderId);
    const newTable = tableStore.getAll().find(t => t.id === newTableId);
    if (!order || !order.tableId || !newTable) return { ok: false as const, error: 'Pedido ou mesa inválidos' };
    if (newTable.status !== 'free') return { ok: false as const, error: 'A mesa de destino não está livre' };

    const oldTableId = order.tableId;
    orderStore.update(orderId, { tableId: newTableId, tableNumber: newTable.number });
    tableStore.update(oldTableId, { status: 'free', currentOrderId: undefined });
    tableStore.update(newTableId, { status: 'occupied', currentOrderId: orderId });
    refresh();
    return { ok: true as const };
  }, [orders, refresh]);

  // Pedidos submetidos pelo próprio cliente (QR/entrega) entram como
  // 'awaiting-confirmation' — só chegam à Cozinha depois do Caixa confirmar
  // aqui. O stock já foi deduzido no servidor quando a RPC inseriu as
  // order_items (trigger deduct_inventory_on_order_item, corre em qualquer
  // insert independentemente do estado do pedido — mesmo mecanismo que já
  // vale para qualquer pedido criado por um membro da equipa), por isso não
  // há nada a descontar aqui, só mudar o estado.
  const confirmPendingOrder = useCallback((orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || order.status !== 'awaiting-confirmation') return;
    orderStore.update(orderId, { status: 'active' });
    refresh();
  }, [orders, refresh]);

  const rejectPendingOrder = useCallback((orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || order.status !== 'awaiting-confirmation') return;
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
  const activeOrders = orders.filter(o => !o.paid && o.status !== 'cancelled' && o.status !== 'awaiting-confirmation');
  const kitchenOrders = orders.filter(o => ['active', 'preparing'].includes(o.status) && !o.paid);
  const pendingConfirmationOrders = orders.filter(o => o.status === 'awaiting-confirmation');

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
    menuItems, tables, orders, activeOrders, kitchenOrders, pendingConfirmationOrders,
    inventory, lowStockItems,
    createOrder, appendOrderItems, updateOrder, updateOrderItemStatus, completeOrder, cancelOrder,
    moveOrderToTable, addPartialPayment, removeLastPayment,
    confirmPendingOrder, rejectPendingOrder,
    addMenuItem, updateMenuItem, deleteMenuItem,
    addInventoryItem, updateInventoryItem, deleteInventoryItem,
    addTable, updateTable, deleteTable,
    logPrint,
    refresh, generateId,
  };
}
