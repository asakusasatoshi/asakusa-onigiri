'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { HOTELS_MASTER } from '@/data/hotels';

interface HotelInfo {
  id?: number | string;
  name?: string;
  name_ja?: string;
  area?: string;
}

interface Order {
  id: number;
  created_at: string;
  delivery_time?: string;
  delivery_slot?: string;
  hotel_name?: string;
  hotel?: string;
  hotel_id?: number;
  hotels?: HotelInfo | null;
  room_number: string;
  guest_name?: string;
  name?: string;
  contact_email?: string;
  email?: string;
  quantity: number;
  total_price: number;
  status: string;
}

interface StoreInventory {
  id: number;
  target_date: string;
  target_stock: number;
  current_stock: number;
  sold_count: number;
}

const DELIVERY_SLOTS = ['07:00', '08:00', '09:00', '10:00'];

const STATUS_CONFIG: Record<string, { label: string; location: string; color: string }> = {
  pending: {
    label: '🟡 Received / 受注済',
    location: 'Kitchen (Not Started) / 未製造',
    color: 'bg-amber-50 text-amber-800 border-amber-300',
  },
  ready_kitchen: {
    label: '🟠 Ready (Kitchen) / 調理済',
    location: 'In Kitchen / 厨房保管',
    color: 'bg-orange-50 text-orange-800 border-orange-300',
  },
  ready_store: {
    label: '🔵 Ready (Store) / 店舗待機',
    location: 'Store Shelf / 配送棚待機',
    color: 'bg-blue-50 text-blue-800 border-blue-300',
  },
  delivering: {
    label: '🟣 Delivering / 配達中',
    location: 'With Driver / 持ち出し済',
    color: 'bg-purple-50 text-purple-800 border-purple-300',
  },
  delivered: {
    label: '🟢 Delivered / 配達完了',
    location: 'Completed / お届け完了',
    color: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  },
  cancelled: {
    label: '⚪ Cancelled / 取消',
    location: 'Void / 無効',
    color: 'bg-stone-100 text-stone-500 border-stone-300',
  },
};

function resolveArea(order: Order): string {
  if (order.hotels?.area) return order.hotels.area;

  const targetName = (order.hotels?.name || order.hotels?.name_ja || order.hotel_name || order.hotel || '').toLowerCase().replace(/\s+/g, '');
  if (!targetName) return '-';

  const matched = HOTELS_MASTER.find((h) => {
    const hName = h.name.toLowerCase().replace(/\s+/g, '');
    const hNameJa = h.nameJa.toLowerCase().replace(/\s+/g, '');
    return hName === targetName || hNameJa === targetName || targetName.includes(hNameJa) || hNameJa.includes(targetName);
  });

  return matched?.area || '-';
}

export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<StoreInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [tempTargetStock, setTempTargetStock] = useState(10);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // ポップアップ用ステート
  const [targetOrder, setTargetOrder] = useState<Order | null>(null);
  const [nextStatus, setNextStatus] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string>('');

  const fetchData = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];

    const { data: orderData } = await supabase
      .from('orders')
      .select('*, hotels(*)')
      .order('id', { ascending: false });

    if (orderData) {
      setOrders(orderData as Order[]);
    }

    let { data: invData } = await supabase
      .from('store_inventory')
      .select('*')
      .eq('target_date', today)
      .maybeSingle();

    if (!invData) {
      const { data: newInv } = await supabase
        .from('store_inventory')
        .insert([{ target_date: today, target_stock: 10, current_stock: 10, sold_count: 0 }])
        .select()
        .single();
      invData = newInv;
    }

    if (invData) {
      setInventory(invData);
      setTempTargetStock(invData.target_stock);
    }

    setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    const ordersChannel = supabase
      .channel('admin_orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchData();
      })
      .subscribe();

    const invChannel = supabase
      .channel('admin_inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_inventory' }, () => {
        fetchData();
      })
      .subscribe();

    const timer = setInterval(() => {
      fetchData();
    }, 30000);

    const handleFocus = () => {
      fetchData();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(invChannel);
      clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchData]);

  const openStatusModal = (order: Order, status: string) => {
    setTargetOrder(order);
    setNextStatus(status);
  };

  const confirmStatusChange = async () => {
    if (!targetOrder || !nextStatus) return;

    const orderId = targetOrder.id;
    const label = STATUS_CONFIG[nextStatus]?.label || nextStatus;

    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
    );

    setTargetOrder(null);

    await supabase
      .from('orders')
      .update({ status: nextStatus })
      .eq('id', orderId);

    setToastMessage(`Order #${orderId} updated to [${label}]`);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const handleSellOne = async () => {
    if (!inventory || inventory.current_stock <= 0) return;
    const nextCurrent = inventory.current_stock - 1;
    const nextSold = inventory.sold_count + 1;

    setInventory({ ...inventory, current_stock: nextCurrent, sold_count: nextSold });

    await supabase
      .from('store_inventory')
      .update({ current_stock: nextCurrent, sold_count: nextSold, updated_at: new Date().toISOString() })
      .eq('id', inventory.id);
  };

  const handleAdjustStock = async (delta: number) => {
    if (!inventory) return;
    const nextCurrent = Math.max(0, inventory.current_stock + delta);

    setInventory({ ...inventory, current_stock: nextCurrent });

    await supabase
      .from('store_inventory')
      .update({ current_stock: nextCurrent, updated_at: new Date().toISOString() })
      .eq('id', inventory.id);
  };

  const handleSaveTargetStock = async () => {
    if (!inventory) return;
    setIsEditingTarget(false);

    setInventory({ ...inventory, target_stock: tempTargetStock });

    await supabase
      .from('store_inventory')
      .update({ target_stock: tempTargetStock, updated_at: new Date().toISOString() })
      .eq('id', inventory.id);
  };

  const slotStats = DELIVERY_SLOTS.map((slot) => {
    const slotOrders = orders.filter((o) => (o.delivery_time || o.delivery_slot) === slot && o.status !== 'cancelled');
    const count = slotOrders.length;
    const totalBoxes = slotOrders.reduce((sum, o) => sum + (o.quantity || 1), 0);
    return { slot, count, totalBoxes };
  });

  const activeOrders = orders.filter((o) => o.status !== 'cancelled');
  const totalDeliveryBoxes = activeOrders.reduce((sum, o) => sum + (o.quantity || 1), 0);

  const deliveryStoreBoxes = orders
    .filter((o) => o.status === 'ready_store')
    .reduce((sum, o) => sum + (o.quantity || 1), 0);

  const totalStoreStock = inventory?.current_stock || 0;
  const takeoutFreeStock = Math.max(0, totalStoreStock - deliveryStoreBoxes);
  const targetStock = inventory?.target_stock || 10;
  const storeShortage = Math.max(0, targetStock - takeoutFreeStock);

  const pendingDeliveryBoxes = orders
    .filter((o) => !o.status || o.status === 'pending')
    .reduce((sum, o) => sum + (o.quantity || 1), 0);

  const totalSuggestBoxes = pendingDeliveryBoxes + storeShortage;

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800 p-4 md:p-8 relative">
      
      {/* 通知トースト */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-stone-900 text-white text-xs px-4 py-3 rounded-xl shadow-lg border border-stone-700 animate-bounce">
          {toastMessage}
        </div>
      )}

      {/* ステータス変更確認モーダル */}
      {targetOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-stone-200 space-y-4">
            <div>
              <h3 className="text-base font-bold text-stone-900">Confirm Status / 状態変更確認</h3>
              <p className="text-xs text-stone-500 mt-1">
                Order <span className="font-semibold text-stone-800">#{targetOrder.id}</span> ({targetOrder.guest_name || targetOrder.name})
              </p>
            </div>

            <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-500">Current / 現在:</span>
                <span className="font-medium text-stone-800">
                  {STATUS_CONFIG[targetOrder.status]?.label || '🟡 Received / 受注済'}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-stone-200">
                <span className="text-stone-500">New / 変更後:</span>
                <span className="font-bold text-stone-900 text-sm">
                  {STATUS_CONFIG[nextStatus]?.label}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Item Location / 所在:</span>
                <span className="font-semibold text-emerald-700">
                  {STATUS_CONFIG[nextStatus]?.location}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTargetOrder(null)}
                className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-xl text-xs transition"
              >
                Cancel / 取消
              </button>
              <button
                type="button"
                onClick={confirmStatusChange}
                className="flex-1 py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-semibold rounded-xl text-xs transition shadow-sm"
              >
                Update / 確定
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* ヘッダー */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-2xl shadow-sm border border-stone-200 gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-wide text-stone-900">
              ASAKUSA ONIGIRI <span className="text-sm font-normal text-stone-500">Admin Operations</span>
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">Real-time Orders & Store Inventory / リアルタイム受注・店頭在庫管理</p>
          </div>

          <div className="flex items-center gap-3">
            {/* LIVEインジケーター */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-stone-50 rounded-xl border border-stone-200 text-xs">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-bold text-emerald-700">LIVE</span>
              <span className="text-stone-400 text-[10px]">({lastUpdated || 'Syncing'})</span>
            </div>

            <button
              onClick={fetchData}
              className="px-3.5 py-1.5 bg-stone-900 text-white rounded-xl text-xs font-medium hover:bg-stone-800 transition"
            >
              Refresh / 更新
            </button>
          </div>
        </div>

        {/* 上段：キッチン製造指示 ＆ 全体サマリー */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-stone-900 text-white p-5 rounded-2xl shadow-sm md:col-span-1">
            <div className="text-xs text-stone-400 font-medium tracking-wider">
              KITCHEN SUGGEST <span className="text-[10px] text-stone-500">/ 製造指示</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold">{totalSuggestBoxes}</span>
              <span className="text-stone-300 text-sm">boxes to prepare / 箱</span>
            </div>
            <div className="mt-3 pt-3 border-t border-stone-800 text-xs text-stone-300 space-y-1">
              <div className="flex justify-between">
                <span>Delivery (Uncooked) / デリバリー未製造:</span>
                <span className="font-semibold text-amber-300">{pendingDeliveryBoxes} boxes</span>
              </div>
              <div className="flex justify-between">
                <span>Store Restock / 店頭補充必要数:</span>
                <span className="font-semibold text-white">{storeShortage} boxes</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-200">
            <div className="text-xs text-stone-500 font-medium">
              ACTIVE DELIVERY ORDERS <span className="text-[10px] text-stone-400">/ デリバリー有効受注</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-stone-900">{activeOrders.length}</span>
              <span className="text-xs text-stone-500">orders ({totalDeliveryBoxes} boxes)</span>
            </div>
            <p className="text-xs text-stone-400 mt-2">Revenue: ¥{(totalDeliveryBoxes * 1800).toLocaleString()}</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-200">
            <div className="text-xs text-stone-500 font-medium">
              TAKEOUT SOLD (TODAY) <span className="text-[10px] text-stone-400">/ 店頭販売累計</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-emerald-700">{inventory?.sold_count || 0}</span>
              <span className="text-xs text-stone-500">boxes sold / 消化</span>
            </div>
            <p className="text-xs text-stone-400 mt-2">Takeout Rev: ¥{((inventory?.sold_count || 0) * 1800).toLocaleString()}</p>
          </div>
        </div>

        {/* 中段：スロット集計 ＆ 店舗在庫コントロール */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-6 bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
            <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-4">
              Delivery by Time Slot <span className="text-xs font-normal text-stone-400">/ 配達枠別 状況</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {slotStats.map((item) => (
                <div key={item.slot} className="bg-stone-50 p-4 rounded-xl border border-stone-100 text-center">
                  <span className="text-xs font-semibold px-2.5 py-0.5 bg-stone-200 rounded-full text-stone-800">
                    {item.slot}
                  </span>
                  <div className="mt-3 text-2xl font-bold text-stone-900">
                    {item.totalBoxes} <span className="text-xs font-normal text-stone-500">box</span>
                  </div>
                  <div className="text-[11px] text-stone-400 mt-1">
                    {item.count} orders
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 店舗内在庫コントロール */}
          <div className="md:col-span-6 bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider">
                  Store Inventory & POS <span className="text-xs font-normal text-stone-400">/ 店舗在庫</span>
                </h2>
                {isEditingTarget ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={tempTargetStock}
                      onChange={(e) => setTempTargetStock(Number(e.target.value))}
                      className="w-14 px-2 py-0.5 text-xs border rounded"
                      min={0}
                    />
                    <button
                      onClick={handleSaveTargetStock}
                      className="px-2 py-0.5 bg-stone-900 text-white rounded text-xs"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditingTarget(true)}
                    className="text-xs text-stone-500 underline hover:text-stone-900"
                  >
                    Target: {inventory?.target_stock} boxes (Edit)
                  </button>
                )}
              </div>

              {/* 店舗総在庫 ＆ 内訳 */}
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 mb-4 space-y-3">
                <div className="flex justify-between items-baseline">
                  <div>
                    <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">Total Physical Shelf</span>
                    <span className="text-[10px] text-stone-400 ml-2">/ 店頭総現物</span>
                  </div>
                  <div className="text-3xl font-extrabold text-stone-900">
                    {totalStoreStock} <span className="text-xs font-normal text-stone-500">boxes</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-200 grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-lg border border-emerald-200 shadow-sm">
                    <div className="text-emerald-800 font-medium text-[11px]">
                      Takeout Free <span className="text-[10px] text-stone-400">/ 店頭販売可</span>
                    </div>
                    <div className="text-2xl font-bold text-emerald-700 mt-0.5">
                      {takeoutFreeStock} <span className="text-xs font-normal text-stone-500">boxes</span>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-blue-200 shadow-sm">
                    <div className="text-blue-800 font-medium text-[11px]">
                      Delivery Kept <span className="text-[10px] text-stone-400">/ 配達待機</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-700 mt-0.5">
                      {deliveryStoreBoxes} <span className="text-xs font-normal text-stone-500">boxes</span>
                    </div>
                  </div>
                </div>

                {/* 手動微調整ボタン */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-stone-400">Shelf Adjust / 総現物調整:</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAdjustStock(-1)}
                      className="w-7 h-7 bg-white border border-stone-300 rounded-lg font-bold text-xs text-stone-700 hover:bg-stone-100 active:scale-95"
                    >
                      -
                    </button>
                    <button
                      onClick={() => handleAdjustStock(1)}
                      className="w-7 h-7 bg-white border border-stone-300 rounded-lg font-bold text-xs text-stone-700 hover:bg-stone-100 active:scale-95"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleSellOne}
              disabled={takeoutFreeStock <= 0}
              className="w-full py-3.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white font-bold rounded-xl text-sm transition shadow-sm active:scale-[0.99]"
            >
              Sell 1 Box at Counter / 店頭で1箱販売
            </button>
          </div>
        </div>

        {/* 下段：受注一覧（日英バイリンガル表） */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
          <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-4">
            Delivery Orders List <span className="text-xs font-normal text-stone-400">/ デリバリー受注一覧</span>
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-stone-200 text-stone-400 uppercase tracking-wider">
                <tr>
                  <th className="pb-3">Status & Location / 状態・所在</th>
                  <th className="pb-3">Order ID / 時刻</th>
                  <th className="pb-3">Time Slot / 配達枠</th>
                  <th className="pb-3">Area / エリア</th>
                  <th className="pb-3">Hotel & Room / 部屋番号</th>
                  <th className="pb-3">Guest Name / 宿泊者</th>
                  <th className="pb-3 text-right">Qty / 数量</th>
                  <th className="pb-3 text-right">Total / 金額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-stone-400">
                      No active orders found / 受注データはありません
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const currentStatus = order.status || 'pending';
                    const config = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.pending;

                    const displayHotelName =
                      order.hotels?.name_ja ||
                      order.hotels?.name ||
                      order.hotel_name ||
                      order.hotel ||
                      `Hotel ID: ${order.hotel_id || 'N/A'}`;

                    const areaTag = resolveArea(order);

                    return (
                      <tr
                        key={order.id}
                        className={`hover:bg-stone-50/50 transition ${
                          currentStatus === 'cancelled' ? 'opacity-40 bg-stone-50' : ''
                        }`}
                      >
                        <td className="py-3">
                          <select
                            value={currentStatus}
                            onChange={(e) => openStatusModal(order, e.target.value)}
                            className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border outline-none cursor-pointer ${config.color}`}
                          >
                            <option value="pending">🟡 Received / 受注済</option>
                            <option value="ready_kitchen">🟠 Ready (Kitchen) / 調理済</option>
                            <option value="ready_store">🔵 Ready (Store) / 店舗待機</option>
                            <option value="delivering">🟣 Delivering / 配達中</option>
                            <option value="delivered">🟢 Delivered / 完了</option>
                            <option value="cancelled">⚪ Cancelled / 取消</option>
                          </select>
                          <div className="text-[10px] text-stone-500 mt-0.5 pl-1 font-medium">
                            {config.location}
                          </div>
                        </td>

                        <td className="py-3 text-stone-500">
                          #{order.id}
                          <div className="text-[10px] text-stone-400">
                            {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>

                        <td className="py-3">
                          <span className="font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md">
                            {order.delivery_time || order.delivery_slot || 'N/A'}
                          </span>
                        </td>

                        <td className="py-3">
                          <span className="inline-block px-2.5 py-1 text-[11px] font-semibold bg-stone-100 text-stone-700 rounded-md border border-stone-300 whitespace-nowrap">
                            {areaTag}
                          </span>
                        </td>

                        <td className="py-3">
                          <div className="font-medium text-stone-900">{displayHotelName}</div>
                          <div className="text-stone-500 text-[11px] mt-0.5">
                            Room: <span className="font-semibold text-stone-700">{order.room_number}</span>
                          </div>
                        </td>

                        <td className="py-3">
                          <div className="font-medium text-stone-900">
                            {order.guest_name || order.name || 'Guest'}
                          </div>
                          <div className="text-stone-400 text-[10px]">{order.contact_email || order.email}</div>
                        </td>

                        <td className="py-3 text-right font-semibold text-stone-900">{order.quantity} box</td>
                        <td className="py-3 text-right font-medium text-stone-900">
                          ¥{(order.quantity * 1800).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}