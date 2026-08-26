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
    label: '受注済み（未着手）',
    location: '未製造',
    color: 'bg-amber-50 text-amber-800 border-amber-300',
  },
  ready_kitchen: {
    label: '準備完了（キッチン）',
    location: '厨房・仕上がり済',
    color: 'bg-orange-50 text-orange-800 border-orange-300',
  },
  ready_store: {
    label: '準備完了（店舗待機）',
    location: '店頭・配送棚待機',
    color: 'bg-blue-50 text-blue-800 border-blue-300',
  },
  delivering: {
    label: '配達中（持ち出し済）',
    location: 'ドライバー配送中',
    color: 'bg-purple-50 text-purple-800 border-purple-300',
  },
  delivered: {
    label: '配達完了',
    location: 'お届け完了',
    color: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  },
  cancelled: {
    label: 'キャンセル',
    location: '無効',
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

  // データ取得関数
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

    // 1. Supabase Realtime 監視
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

    // 2. 30秒ごとの自動ポーリング
    const timer = setInterval(() => {
      fetchData();
    }, 30000);

    // 3. 画面に復帰した時の即時更新
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

    setToastMessage(`受注 #${orderId} のステータスを「${label}」に更新しました`);
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

      {/* ステータス変更確認ポップアップ */}
      {targetOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-stone-200 space-y-4">
            <div>
              <h3 className="text-base font-bold text-stone-900">ステータス・所在の変更確認</h3>
              <p className="text-xs text-stone-500 mt-1">
                受注番号 <span className="font-semibold text-stone-800">#{targetOrder.id}</span>（{targetOrder.guest_name || targetOrder.name} 様）
              </p>
            </div>

            <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-500">変更前:</span>
                <span className="font-medium text-stone-800">
                  {STATUS_CONFIG[targetOrder.status]?.label || '受注済み（未着手）'}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-stone-200">
                <span className="text-stone-500">変更後:</span>
                <span className="font-bold text-stone-900 text-sm">
                  {STATUS_CONFIG[nextStatus]?.label}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">商品の所在:</span>
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
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirmStatusChange}
                className="flex-1 py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-semibold rounded-xl text-xs transition shadow-sm"
              >
                変更を確定する
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* ヘッダー */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-2xl shadow-sm border border-stone-200 gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-wide text-stone-900">ASAKUSA ONIGIRI 管理システム</h1>
            <p className="text-xs text-stone-500 mt-1">リアルタイム受注 ＆ 店頭在庫オペレーション</p>
          </div>

          <div className="flex items-center gap-3">
            {/* LIVEインジケーター */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-stone-50 rounded-xl border border-stone-200 text-xs">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-bold text-emerald-700">LIVE</span>
              <span className="text-stone-400 text-[10px]">({lastUpdated || '同期中'})</span>
            </div>

            <button
              onClick={fetchData}
              className="px-3.5 py-1.5 bg-stone-900 text-white rounded-xl text-xs font-medium hover:bg-stone-800 transition"
            >
              今すぐ更新
            </button>
          </div>
        </div>

        {/* 上段：キッチン製造サジェスト ＆ 全体サマリー */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-stone-900 text-white p-5 rounded-2xl shadow-sm md:col-span-1">
            <span className="text-xs text-stone-400 font-medium">KITCHEN SUGGEST / 製造指示</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold">{totalSuggestBoxes}</span>
              <span className="text-stone-300 text-sm">箱 製造必要</span>
            </div>
            <div className="mt-3 pt-3 border-t border-stone-800 text-xs text-stone-300 space-y-1">
              <div className="flex justify-between">
                <span>デリバリー未着手分:</span>
                <span className="font-semibold text-amber-300">{pendingDeliveryBoxes} 箱</span>
              </div>
              <div className="flex justify-between">
                <span>店頭フリー補充必要数:</span>
                <span className="font-semibold text-white">{storeShortage} 箱</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-200">
            <span className="text-xs text-stone-500 font-medium">デリバリー総受注（有効）</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-stone-900">{activeOrders.length}</span>
              <span className="text-xs text-stone-500">件 ({totalDeliveryBoxes} 箱)</span>
            </div>
            <p className="text-xs text-stone-400 mt-2">売上: ¥{(totalDeliveryBoxes * 1800).toLocaleString()}</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-200">
            <span className="text-xs text-stone-500 font-medium">店頭テイクアウト販売累計</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-emerald-700">{inventory?.sold_count || 0}</span>
              <span className="text-xs text-stone-500">箱 消化</span>
            </div>
            <p className="text-xs text-stone-400 mt-2">店頭売上: ¥{((inventory?.sold_count || 0) * 1800).toLocaleString()}</p>
          </div>
        </div>

        {/* 中段：デリバリースロット集計 ＆ 店頭在庫コントロール */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-6 bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
            <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-4">
              配達スロット別 受注状況
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {slotStats.map((item) => (
                <div key={item.slot} className="bg-stone-50 p-4 rounded-xl border border-stone-100 text-center">
                  <span className="text-xs font-semibold px-2.5 py-0.5 bg-stone-200 rounded-full text-stone-800">
                    {item.slot}
                  </span>
                  <div className="mt-3 text-2xl font-bold text-stone-900">
                    {item.totalBoxes} <span className="text-xs font-normal text-stone-500">箱</span>
                  </div>
                  <div className="text-[11px] text-stone-400 mt-1">
                    {item.count} 件の配達
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
                  店舗内在庫コントロール
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
                      保存
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditingTarget(true)}
                    className="text-xs text-stone-500 underline hover:text-stone-900"
                  >
                    目標キープ: {inventory?.target_stock}箱 (変更)
                  </button>
                )}
              </div>

              {/* 店舗総在庫 ＆ 内訳 */}
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 mb-4 space-y-3">
                <div className="flex justify-between items-baseline">
                  <div>
                    <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">店舗内 総現物在庫</span>
                    <span className="text-[10px] text-stone-400 ml-2">（棚にある現物の合計）</span>
                  </div>
                  <div className="text-3xl font-extrabold text-stone-900">
                    {totalStoreStock} <span className="text-xs font-normal text-stone-500">箱</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-200 grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-lg border border-emerald-200 shadow-sm">
                    <div className="text-emerald-800 font-medium text-[11px]">店頭テイクアウト用（フリー）</div>
                    <div className="text-2xl font-bold text-emerald-700 mt-0.5">
                      {takeoutFreeStock} <span className="text-xs font-normal text-stone-500">箱 販売可</span>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-blue-200 shadow-sm">
                    <div className="text-blue-800 font-medium text-[11px]">デリバリー待機用（キープ）</div>
                    <div className="text-2xl font-bold text-blue-700 mt-0.5">
                      {deliveryStoreBoxes} <span className="text-xs font-normal text-stone-500">箱</span>
                    </div>
                  </div>
                </div>

                {/* 手動微調整ボタン */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-stone-400">総現物在庫の棚卸調整:</span>
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
              店頭で1箱販売（売上計上＆在庫-1）
            </button>
          </div>
        </div>

        {/* 下段：受注一覧 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
          <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-4">
            デリバリー受注一覧
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-stone-200 text-stone-400 uppercase tracking-wider">
                <tr>
                  <th className="pb-3">ステータス / 所在</th>
                  <th className="pb-3">ID / 受注時刻</th>
                  <th className="pb-3">配達枠</th>
                  <th className="pb-3">エリア</th>
                  <th className="pb-3">お届け先ホテル / 部屋番号</th>
                  <th className="pb-3">宿泊者名</th>
                  <th className="pb-3 text-right">数量</th>
                  <th className="pb-3 text-right">金額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-stone-400">
                      現在、受注データはありません
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
                      `ホテルID: ${order.hotel_id || '未設定'}`;

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
                            <option value="pending">🟡 受注済み（未着手）</option>
                            <option value="ready_kitchen">🟠 準備完了（キッチン保管）</option>
                            <option value="ready_store">🔵 準備完了（店舗待機）</option>
                            <option value="delivering">🟣 配達中（持ち出し済）</option>
                            <option value="delivered">🟢 配達完了</option>
                            <option value="cancelled">⚪ キャンセル</option>
                          </select>
                          <div className="text-[10px] text-stone-500 mt-0.5 pl-1">
                            所在: <span className="font-medium text-stone-700">{config.location}</span>
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
                            {order.delivery_time || order.delivery_slot || '未設定'}
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
                            部屋番号: <span className="font-semibold text-stone-700">{order.room_number}</span>
                          </div>
                        </td>

                        <td className="py-3">
                          <div className="font-medium text-stone-900">
                            {order.guest_name || order.name || 'ゲスト名'}
                          </div>
                          <div className="text-stone-400 text-[10px]">{order.contact_email || order.email}</div>
                        </td>

                        <td className="py-3 text-right font-semibold text-stone-900">{order.quantity} 箱</td>
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