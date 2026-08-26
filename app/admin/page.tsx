'use client';

import React, { useEffect, useState } from 'react';
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

// ホテル名やIDからエリアを堅牢に判定する関数
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

  const fetchData = async () => {
    setLoading(true);
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

    setLoading(false);
  };

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

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(invChannel);
    };
  }, []);

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
    const slotOrders = orders.filter((o) => (o.delivery_time || o.delivery_slot) === slot);
    const count = slotOrders.length;
    const totalBoxes = slotOrders.reduce((sum, o) => sum + (o.quantity || 1), 0);
    return { slot, count, totalBoxes };
  });

  const totalDeliveryBoxes = orders.reduce((sum, o) => sum + (o.quantity || 1), 0);
  const storeShortage = inventory ? Math.max(0, inventory.target_stock - inventory.current_stock) : 0;
  const totalSuggestBoxes = totalDeliveryBoxes + storeShortage;

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* ヘッダー */}
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
          <div>
            <h1 className="text-2xl font-bold tracking-wide text-stone-900">ASAKUSA ONIGIRI 管理システム</h1>
            <p className="text-xs text-stone-500 mt-1">リアルタイム受注 ＆ 店頭在庫オペレーション</p>
          </div>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-medium hover:bg-stone-800 transition"
          >
            最新情報に更新
          </button>
        </div>

        {/* 上段：キッチン製造サジェスト ＆ 全体サマリー */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-stone-900 text-white p-5 rounded-2xl shadow-sm md:col-span-1">
            <span className="text-xs text-stone-400 font-medium">KITCHEN SUGGEST / 製造指示</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold">{totalSuggestBoxes}</span>
              <span className="text-stone-300 text-sm">箱 必要</span>
            </div>
            <div className="mt-3 pt-3 border-t border-stone-800 text-xs text-stone-300 space-y-1">
              <div className="flex justify-between">
                <span>デリバリー総数:</span>
                <span className="font-semibold text-white">{totalDeliveryBoxes} 箱</span>
              </div>
              <div className="flex justify-between">
                <span>店頭補充必要数:</span>
                <span className="font-semibold text-white">{storeShortage} 箱</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-200">
            <span className="text-xs text-stone-500 font-medium">デリバリー総受注</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-stone-900">{orders.length}</span>
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

        {/* 中段：デリバリースロット集計 ＆ 店頭クイックPOS */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-7 bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
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

          <div className="md:col-span-5 bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider">
                  店頭在庫コントロール
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

              <div className="flex items-center justify-between bg-stone-50 p-4 rounded-xl border border-stone-100 mb-4">
                <div>
                  <span className="text-xs text-stone-500">現在の店頭棚在庫</span>
                  <div className="text-3xl font-extrabold text-stone-900 mt-0.5">
                    {inventory?.current_stock} <span className="text-xs font-normal text-stone-500">箱</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAdjustStock(-1)}
                    className="w-10 h-10 bg-white border border-stone-300 rounded-xl font-bold text-stone-700 hover:bg-stone-100 active:scale-95"
                  >
                    -
                  </button>
                  <button
                    onClick={() => handleAdjustStock(1)}
                    className="w-10 h-10 bg-white border border-stone-300 rounded-xl font-bold text-stone-700 hover:bg-stone-100 active:scale-95"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleSellOne}
              disabled={!inventory || inventory.current_stock <= 0}
              className="w-full py-3.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white font-bold rounded-xl text-sm transition shadow-sm active:scale-[0.99]"
            >
              店頭で1箱販売（売上計上＆在庫-1）
            </button>
          </div>
        </div>

        {/* 下段：受注一覧（エリア専用列を新設） */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
          <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-4">
            デリバリー受注一覧
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-stone-200 text-stone-400 uppercase tracking-wider">
                <tr>
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
                    <td colSpan={7} className="py-8 text-center text-stone-400">
                      現在、受注データはありません
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const displayHotelName =
                      order.hotels?.name_ja ||
                      order.hotels?.name ||
                      order.hotel_name ||
                      order.hotel ||
                      `ホテルID: ${order.hotel_id || '未設定'}`;

                    const areaTag = resolveArea(order);

                    return (
                      <tr key={order.id} className="hover:bg-stone-50/50">
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
                          <div className="text-stone-500 text-[11px] mt-0.5">部屋番号: <span className="font-semibold text-stone-700">{order.room_number}</span></div>
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