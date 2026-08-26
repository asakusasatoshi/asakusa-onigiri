'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { HOTELS_MASTER } from '@/data/hotels';

interface Order {
  id: number;
  created_at: string;
  hotel_name?: string;
  hotel?: string;
  hotel_id?: string;
  room_number?: string;
  room?: string;
  guest_name?: string;
  name?: string;
  contact_email?: string;
  email?: string;
  delivery_time?: string;
  delivery_slot?: string;
  slot?: string;
  quantity?: number;
  qty?: number;
  total_price?: number;
  price?: number;
  status: string;
}

interface StoreInventory {
  id?: number;
  target_date: string;
  target_stock: number;
  current_stock: number;
  sold_count: number;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'operations' | 'settings'>('operations');
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<StoreInventory>({
    target_date: new Date().toISOString().split('T')[0],
    target_stock: 10,
    current_stock: 10,
    sold_count: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // === Settings State ===
  const [settings, setSettings] = useState({
    item_price: 1500,
    delivery_fee: 150,
    tax_amount: 150,
    delivery_radius_km: 2.5,
    is_open: true,
    limit_0700: 10,
    limit_0800: 15,
    limit_0900: 15,
    limit_1000: 10,
    slot_0700_active: true,
    slot_0800_active: true,
    slot_0900_active: true,
    slot_1000_active: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const fetchAllData = useCallback(async () => {
    // 1. Orders
    const { data: orderData, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .order('id', { ascending: false });
    if (orderData && !orderErr) setOrders(orderData as Order[]);

    // 2. Inventory
    const today = new Date().toISOString().split('T')[0];
    const { data: invData } = await supabase
      .from('store_inventory')
      .select('*')
      .eq('target_date', today)
      .maybeSingle();

    if (invData) {
      setInventory(invData);
    } else {
      const initInv = { target_date: today, target_stock: 10, current_stock: 10, sold_count: 0 };
      const { data: createdInv } = await supabase.from('store_inventory').insert([initInv]).select().maybeSingle();
      if (createdInv) setInventory(createdInv);
    }

    // 3. Settings
    const { data: setData } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 'default_settings')
      .maybeSingle();
    if (setData) setSettings(setData);

    setLastUpdated(new Date().toLocaleTimeString('ja-JP'));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 15000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  // オペレーション集計
  const activeOrders = useMemo(() => orders.filter((o) => o.status !== 'cancelled'), [orders]);
  const activeDeliveryBoxes = useMemo(() => activeOrders.reduce((sum, o) => sum + (o.quantity || o.qty || 1), 0), [activeOrders]);
  const deliveryRevenue = useMemo(() => activeOrders.reduce((sum, o) => sum + (o.total_price || o.price || 0), 0), [activeOrders]);

  const slotStats = useMemo(() => {
    const stats: Record<string, { boxes: number; orders: number }> = {
      '07:00': { boxes: 0, orders: 0 },
      '08:00': { boxes: 0, orders: 0 },
      '09:00': { boxes: 0, orders: 0 },
      '10:00': { boxes: 0, orders: 0 },
    };
    activeOrders.forEach((o) => {
      const slot = o.delivery_time || o.delivery_slot || o.slot || '08:00';
      if (!stats[slot]) stats[slot] = { boxes: 0, orders: 0 };
      stats[slot].boxes += o.quantity || o.qty || 1;
      stats[slot].orders += 1;
    });
    return stats;
  }, [activeOrders]);

  // 1. 店頭にすでに届いていて、デリバリー用に確保（取り置き）されている箱数 (ready_store)
  const deliveryKeptBoxes = useMemo(() => {
    return orders
      .filter((o) => o.status === 'ready_store')
      .reduce((sum, o) => sum + (o.quantity || o.qty || 1), 0);
  }, [orders]);

  // 2. キッチン側でまだ製造が必要な箱数 (pending, confirmed, ready_kitchen, cooking)
  const deliveryUncookedBoxes = useMemo(() => {
    return orders
      .filter((o) => o.status === 'pending' || o.status === 'confirmed' || o.status === 'ready_kitchen' || o.status === 'cooking')
      .reduce((sum, o) => sum + (o.quantity || o.qty || 1), 0);
  }, [orders]);

  // 3. 店頭販売可能数 = 店頭総現物 - 店頭デリバリー取り置き分
  const takeoutAvailable = Math.max(0, inventory.current_stock - deliveryKeptBoxes);
  
  // 4. 店頭補充必要数
  const storeRestockNeeded = Math.max(0, inventory.target_stock - takeoutAvailable);
  
  // 5. キッチン指示数 = デリバリー未製造 + 店頭補充必要数
  const kitchenSuggestBoxes = deliveryUncookedBoxes + storeRestockNeeded;

  // ステータス更新
  const handleUpdateStatus = async (orderId: number, nextStatus: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o));
    const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', orderId);
    if (error) {
      alert('ステータス更新に失敗しました: ' + error.message);
      fetchAllData();
    }
  };

  const handleShelfChange = async (delta: number) => {
    const newStock = Math.max(0, inventory.current_stock + delta);
    setInventory((prev) => ({ ...prev, current_stock: newStock }));
    await supabase.from('store_inventory').update({ current_stock: newStock }).eq('target_date', inventory.target_date);
  };

  const handleSellCounter = async () => {
    if (takeoutAvailable <= 0) {
      alert('店頭販売可能分がありません。現物を補充してください。');
      return;
    }
    const newStock = Math.max(0, inventory.current_stock - 1);
    const newSold = inventory.sold_count + 1;
    setInventory((prev) => ({ ...prev, current_stock: newStock, sold_count: newSold }));
    await supabase.from('store_inventory').update({ current_stock: newStock, sold_count: newSold }).eq('target_date', inventory.target_date);
  };

  // 設定保存
  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveMessage('');
    const { error } = await supabase
      .from('settings')
      .update({
        item_price: settings.item_price,
        delivery_fee: settings.delivery_fee,
        tax_amount: settings.tax_amount,
        delivery_radius_km: settings.delivery_radius_km,
        is_open: settings.is_open,
        limit_0700: settings.limit_0700,
        limit_0800: settings.limit_0800,
        limit_0900: settings.limit_0900,
        limit_1000: settings.limit_1000,
        slot_0700_active: settings.slot_0700_active,
        slot_0800_active: settings.slot_0800_active,
        slot_0900_active: settings.slot_0900_active,
        slot_1000_active: settings.slot_1000_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'default_settings');

    setIsSaving(false);
    if (error) {
      setSaveMessage('❌ Error saving settings: ' + error.message);
    } else {
      setSaveMessage('✓ Settings saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  const handleSettingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : Number(value),
    }));
  };

  // ホテル名の解決ヘルパー
  const getHotelDisplayName = (order: Order) => {
    const raw = order.hotel_name || order.hotel || order.hotel_id || '';
    const found = HOTELS_MASTER.find((h) => String(h.id) === String(raw) || h.name === raw || h.nameJa === raw);
    if (found) {
      return `${found.nameJa || found.name}`;
    }
    return raw || 'Hotel Unspecified';
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#f5f5f4] text-stone-500 font-medium">Loading Operations Data...</div>;
  }

  return (
    <div className="min-h-screen bg-[#f5f5f4] text-stone-800 font-sans pb-20">
      
      {/* 上部ヘッダー ＆ タブバー */}
      <div className="bg-white border-b border-stone-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight text-stone-900">ASAKUSA ONIGIRI</h1>
            <span className="text-[10px] px-2 py-0.5 bg-stone-100 text-stone-600 rounded border border-stone-200 font-semibold uppercase">
              Admin Console
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200">
              <button
                onClick={() => setActiveTab('operations')}
                className={`px-5 py-2 rounded-lg text-xs font-bold transition ${
                  activeTab === 'operations'
                    ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                📦 Operations (現場管理)
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-5 py-2 rounded-lg text-xs font-bold transition ${
                  activeTab === 'settings'
                    ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                ⚙️ Settings (設定)
              </button>
            </div>

            <button
              onClick={fetchAllData}
              className="text-xs bg-white hover:bg-stone-50 text-stone-700 px-3 py-2 rounded-xl border border-stone-300 font-semibold flex items-center gap-1 transition shadow-2xs"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Refresh ({lastUpdated})
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        
        {/* =========================================
            1. OPERATIONS TAB (現場オペレーション画面)
            ========================================= */}
        {activeTab === 'operations' && (
          <div className="space-y-6">
            
            {/* 上段3カラムサマリー */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* キッチン製造指示 */}
              <div className="bg-stone-900 text-white p-5 rounded-2xl shadow-sm space-y-3">
                <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold block">
                  KITCHEN SUGGEST / 製造指示
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-white">{kitchenSuggestBoxes}</span>
                  <span className="text-xs text-stone-300">boxes to prepare / 箱</span>
                </div>
                <div className="pt-3 border-t border-stone-800 space-y-1 text-[11px] text-stone-300">
                  <div className="flex justify-between">
                    <span>Delivery (Uncooked) / デリバリー未製造:</span>
                    <span className="font-bold text-amber-400">{deliveryUncookedBoxes} boxes</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Store Restock / 店頭補充必要数:</span>
                    <span className="font-bold text-emerald-400">{storeRestockNeeded} boxes</span>
                  </div>
                </div>
              </div>

              {/* デリバリー有効受注 */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
                <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold block">
                  ACTIVE DELIVERY ORDERS / デリバリー有効受注
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-stone-900">{activeOrders.length}</span>
                  <span className="text-xs text-stone-500">orders ({activeDeliveryBoxes} boxes)</span>
                </div>
                <div className="pt-3 border-t border-stone-100 text-[11px] text-stone-600">
                  Revenue: <span className="font-bold text-stone-900">¥{deliveryRevenue.toLocaleString()}</span>
                </div>
              </div>

              {/* 店頭販売累計 */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
                <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold block">
                  TAKEOUT SOLD (TODAY) / 店頭販売累計
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-stone-900">{inventory.sold_count}</span>
                  <span className="text-xs text-stone-500">boxes sold / 消化</span>
                </div>
                <div className="pt-3 border-t border-stone-100 text-[11px] text-stone-600">
                  Takeout Rev: <span className="font-bold text-stone-900">¥{(inventory.sold_count * (settings.item_price + settings.tax_amount)).toLocaleString()}</span>
                </div>
              </div>

            </div>

            {/* 中段：時間枠別状況 ＆ 店頭在庫POS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* 配達枠別 状況 */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                <span className="text-xs font-bold text-stone-700 uppercase tracking-wider block">
                  DELIVERY BY TIME SLOT / 配達枠別 状況
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {['07:00', '08:00', '09:00', '10:00'].map((slot) => (
                    <div key={slot} className="bg-stone-50 p-3 rounded-xl border border-stone-200 text-center">
                      <span className="text-[11px] font-bold text-stone-600 block">{slot}</span>
                      <div className="text-xl font-extrabold text-stone-900 my-1">{slotStats[slot]?.boxes || 0} <span className="text-[10px] font-normal text-stone-500">box</span></div>
                      <span className="text-[10px] text-stone-400 block">{slotStats[slot]?.orders || 0} orders</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 店頭在庫 & POS */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                    STORE INVENTORY & POS / 店頭在庫
                  </span>
                  <span className="text-[11px] text-stone-500">
                    Target: {inventory.target_stock} boxes
                  </span>
                </div>

                <div className="flex items-baseline justify-between bg-stone-50 p-3.5 rounded-xl border border-stone-200">
                  <span className="text-xs font-bold text-stone-600">TOTAL PHYSICAL SHELF / 店頭総現物</span>
                  <span className="text-2xl font-extrabold text-stone-900">{inventory.current_stock} <span className="text-xs font-normal text-stone-500">boxes</span></span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <span className="text-[10px] text-emerald-800 font-bold block">Takeout Free / 店頭販売可</span>
                    <span className="text-lg font-bold text-emerald-900">{takeoutAvailable} boxes</span>
                  </div>
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <span className="text-[10px] text-blue-800 font-bold block">Delivery Kept / 配送待機</span>
                    <span className="text-lg font-bold text-blue-900">{deliveryKeptBoxes} boxes</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs text-stone-500 font-medium">Shelf Adjust / 総現物調整:</span>
                  <div className="flex gap-2">
                    <button onClick={() => handleShelfChange(-1)} className="w-8 h-8 bg-stone-100 border border-stone-300 rounded-lg font-bold hover:bg-stone-200">-</button>
                    <button onClick={() => handleShelfChange(1)} className="w-8 h-8 bg-stone-100 border border-stone-300 rounded-lg font-bold hover:bg-stone-200">+</button>
                  </div>
                </div>

                <button
                  onClick={handleSellCounter}
                  className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 active:scale-[0.99] text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  Sell 1 Box at Counter / 店頭で1箱販売
                </button>
              </div>

            </div>

            {/* 下段：デリバリー受注一覧テーブル */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
              <span className="text-xs font-bold text-stone-700 uppercase tracking-wider block">
                DELIVERY ORDERS LIST / デリバリー受注一覧
              </span>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-700 border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-400 uppercase text-[10px]">
                      <th className="py-2.5 px-3">ID</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Slot</th>
                      <th className="py-2.5 px-3">Hotel / お届け先</th>
                      <th className="py-2.5 px-3">Room</th>
                      <th className="py-2.5 px-3">Guest / お名前</th>
                      <th className="py-2.5 px-3 text-right">Qty</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                      <th className="py-2.5 px-3 text-center">Action / ステータス変更</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {orders.map((o) => {
                      const displayHotel = getHotelDisplayName(o);
                      const displaySlot = o.delivery_time || o.delivery_slot || o.slot || '08:00';
                      const displayRoom = o.room_number || o.room || '-';
                      const displayGuest = o.guest_name || o.name || '-';
                      const displayEmail = o.contact_email || o.email || '';
                      const displayQty = o.quantity || o.qty || 1;
                      const displayTotal = o.total_price || o.price || (displayQty * 1800);

                      return (
                        <tr key={o.id} className="hover:bg-stone-50 transition">
                          <td className="py-3 px-3 font-mono font-bold text-stone-400 text-[11px]">#{o.id}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              o.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                              o.status === 'ready_store' ? 'bg-blue-100 text-blue-800' :
                              o.status === 'ready_kitchen' || o.status === 'cooking' ? 'bg-amber-100 text-amber-800' :
                              o.status === 'cancelled' ? 'bg-stone-200 text-stone-500' : 'bg-stone-100 text-stone-700'
                            }`}>
                              {o.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-bold text-stone-900">{displaySlot}</td>
                          <td className="py-3 px-3 font-semibold text-stone-800">{displayHotel}</td>
                          <td className="py-3 px-3 font-mono text-stone-900 font-bold">{displayRoom}</td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-stone-900">{displayGuest}</div>
                            {displayEmail && <div className="text-[10px] text-stone-400">{displayEmail}</div>}
                          </td>
                          <td className="py-3 px-3 text-right font-bold">{displayQty}</td>
                          <td className="py-3 px-3 text-right font-bold text-stone-900">¥{displayTotal.toLocaleString()}</td>
                          <td className="py-3 px-3 text-center">
                            <select
                              value={o.status}
                              onChange={(e) => handleUpdateStatus(o.id, e.target.value)}
                              className="bg-stone-50 border border-stone-300 rounded-lg px-2 py-1 text-[11px] font-semibold text-stone-800 outline-none focus:border-stone-900"
                            >
                              <option value="pending">pending (受注)</option>
                              <option value="ready_kitchen">ready_kitchen (調理指示)</option>
                              <option value="ready_store">ready_store (店舗待機)</option>
                              <option value="cooking">cooking (調理中)</option>
                              <option value="delivering">delivering (配達中)</option>
                              <option value="delivered">delivered (配達完了)</option>
                              <option value="cancelled">cancelled (取消)</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* =========================================
            2. SETTINGS TAB (設定コントロールパネル)
            ========================================= */}
        {activeTab === 'settings' && (
          <div className="max-w-3xl mx-auto space-y-6">
            
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-stone-900">Store Settings & Limits</h2>
              <button
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="bg-stone-900 hover:bg-stone-800 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-sm transition active:scale-95 disabled:bg-stone-400"
              >
                {isSaving ? 'Saving...' : 'Save All Settings'}
              </button>
            </div>
            
            {saveMessage && (
              <div className={`p-3 rounded-xl text-xs font-bold text-center ${saveMessage.includes('Error') ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'}`}>
                {saveMessage}
              </div>
            )}

            {/* 1. 全体営業ステータス */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                1. Store Master Status (店舗全体ステータス)
              </h3>
              <div className="flex items-center justify-between p-3.5 bg-stone-50 rounded-xl border border-stone-200">
                <div>
                  <div className="text-xs font-bold text-stone-900">Accept New Orders (新規受付ON/OFF)</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">OFFにすると全時間帯が一括で受付終了となり、お客さんの注文を停止します。</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input type="checkbox" name="is_open" checked={settings.is_open} onChange={handleSettingChange} className="sr-only peer" />
                  <div className="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>
            </div>

            {/* 2. 料金設定 */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                2. Price & Taxes (料金設定)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Item Price (本体価格 /箱)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">¥</span>
                    <input type="number" name="item_price" value={settings.item_price} onChange={handleSettingChange} className="w-full pl-7 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Delivery Fee (配達料 /注文)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">¥</span>
                    <input type="number" name="delivery_fee" value={settings.delivery_fee} onChange={handleSettingChange} className="w-full pl-7 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Tax Amount (諸税 /箱)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">¥</span>
                    <input type="number" name="tax_amount" value={settings.tax_amount} onChange={handleSettingChange} className="w-full pl-7 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900" />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. 配達エリア設定 */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                3. Delivery Coverage (配達可能エリア)
              </h3>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] font-bold text-stone-600">Delivery Radius (配達半径 km)</label>
                  <span className="font-extrabold text-sm text-stone-900">{Number(settings.delivery_radius_km).toFixed(1)} km</span>
                </div>
                <input type="range" name="delivery_radius_km" min="1.0" max="5.0" step="0.1" value={settings.delivery_radius_km} onChange={handleSettingChange} className="w-full accent-stone-900" />
                <p className="text-[10px] text-stone-400 mt-1">※半径を変更すると、フロント画面のホテル選択一覧が自動で絞り込まれます。</p>
              </div>
            </div>

            {/* 4. 時間枠・上限設定 */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                4. Time Slot Capacity & Control (時間枠の受付上限 ＆ 強制停止)
              </h3>
              <p className="text-[10px] text-stone-400">スイッチをOFFにすると、上限に達していなくても即座に「SOLD OUT」にできます。</p>
              
              <div className="space-y-2.5">
                {['0700', '0800', '0900', '1000'].map((slot) => (
                  <div key={slot} className={`flex items-center justify-between p-3 rounded-xl border transition ${settings[`slot_${slot}_active` as keyof typeof settings] ? 'bg-stone-50 border-stone-200' : 'bg-rose-50/40 border-rose-200'}`}>
                    <div className="flex items-center gap-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name={`slot_${slot}_active`} checked={Boolean(settings[`slot_${slot}_active` as keyof typeof settings])} onChange={handleSettingChange} className="sr-only peer" />
                        <div className="w-9 h-5 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                      </label>
                      <span className={`text-xs font-bold ${settings[`slot_${slot}_active` as keyof typeof settings] ? 'text-stone-900' : 'text-stone-400 line-through'}`}>
                        {slot.slice(0, 2)}:{slot.slice(2)} Delivery Slot
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-stone-500">Max:</span>
                      <input type="number" name={`limit_${slot}`} value={Number(settings[`limit_${slot}` as keyof typeof settings])} onChange={handleSettingChange} className="w-16 px-2 py-1 bg-white border border-stone-300 rounded-lg text-xs font-bold outline-none focus:border-stone-900 text-center" />
                      <span className="text-[10px] text-stone-400">boxes</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}