'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const HOTEL_NAMES: Record<number, string> = {
  1: 'Sakura Hostel Asakusa (サクラホステル浅草)',
  2: 'Richmond Hotel Premier Asakusa (リッチモンドホテルプレミア浅草)',
  3: 'Richmond Hotel Asakusa (リッチモンドホテル浅草)',
  4: 'Onyado Nono Asakusa Hot Springs (天然温泉 凌雲の湯 御宿 野乃 浅草)',
  5: 'Onyado Nono Asakusa Bettei (天然温泉 凌雲の湯 御宿 野乃 浅草別邸)',
  6: 'Asakusa View Hotel Annex Rokku (浅草ビューホテル アネックス 六区)',
  7: 'Hotel Keihan Asakusa (ホテル京阪 浅草)',
  8: 'Asakusa View Hotel (浅草ビューホテル)',
  9: 'Hotel Tavinos Asakusa (ホテルタビノス浅草)',
  10: 'THE KANZASHI TOKYO ASAKUSA (ザ カンザシ 東京浅草)',
  11: 'TOSEI HOTEL COCONE ASAKUSA (トーセイホテル ココネ浅草)',
  12: 'Smile Hotel Asakusa (スマイルホテル浅草)',
  13: 'MUSTARD HOTEL ASAKUSA 1 (マスタードホテル浅草1)',
  14: 'MUSTARD HOTEL ASAKUSA 2 (マスタードホテル浅草2)',
  15: 'Dormy Inn Express Asakusa (展望大浴場 あさひ湯 ドーミーイン EXPRESS 浅草)',
  16: 'THE GATE HOTEL Asakusa Kaminarimon by HULIC (ザ・ゲートホテル雷門 by HULIC)',
};

interface Order {
  id: number;
  created_at: string;
  hotel_id: number;
  room_number: string;
  delivery_slot: string;
  guest_name: string;
  contact_email?: string;
  quantity: number;
  total_price: number;
  status: string;
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const adminPass = process.env.NEXT_PUBLIC_ADMIN_PASSCODE || '1234';

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === adminPass) {
      setIsAuthenticated(true);
      setErrorMsg('');
      fetchOrders();
    } else {
      setErrorMsg('パスコードが正しくありません');
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setOrders(data);
    }
    setLoading(false);
  };

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-neutral-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl">
          <h1 className="text-xl font-bold text-neutral-800 text-center mb-6 tracking-wide">
            管理者ログイン
          </h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">
                PASSCODE
              </label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="4桁のパスコード"
                className="w-full px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900 text-center tracking-widest text-lg"
                autoFocus
              />
            </div>
            {errorMsg && (
              <p className="text-red-500 text-xs text-center font-medium">
                {errorMsg}
              </p>
            )}
            <button
              type="submit"
              className="w-full bg-neutral-900 text-white font-medium py-3 rounded-xl hover:bg-neutral-800 transition"
            >
              ログイン
            </button>
          </form>
        </div>
      </main>
    );
  }

  const totalOrders = orders.length;
  const totalBoxes = orders.reduce((sum, o) => sum + o.quantity, 0);
  const totalSales = orders.reduce((sum, o) => sum + o.total_price, 0);

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900 p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-800">
              浅草おにぎり 朝食受注管理
            </h1>
            <p className="text-xs text-neutral-500 mt-1">リアルタイム受注ダッシュボード</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchOrders}
              disabled={loading}
              className="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-medium hover:bg-neutral-50 transition shadow-sm"
            >
              {loading ? '更新中...' : '最新情報に更新'}
            </button>
            <button
              onClick={() => setIsAuthenticated(false)}
              className="px-4 py-2 bg-neutral-200 rounded-xl text-xs font-medium text-neutral-700 hover:bg-neutral-300 transition"
            >
              ログアウト
            </button>
          </div>
        </div>

        {/* サマリーカード */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              総注文数
            </span>
            <div className="text-3xl font-bold mt-2 text-neutral-900">
              {totalOrders} <span className="text-sm font-normal text-neutral-500">件</span>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              合計提供個数
            </span>
            <div className="text-3xl font-bold mt-2 text-neutral-900">
              {totalBoxes} <span className="text-sm font-normal text-neutral-500">箱</span>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              合計売上
            </span>
            <div className="text-3xl font-bold mt-2 text-neutral-900">
              ¥{totalSales.toLocaleString()}
            </div>
          </div>
        </div>

        {/* 受注一覧 */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
            <h2 className="text-base font-bold text-neutral-800">受注一覧</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50/50 text-neutral-400 text-xs uppercase font-medium border-b border-neutral-100">
                <tr>
                  <th className="px-6 py-3">ID / 受注日時</th>
                  <th className="px-6 py-3">配達時間</th>
                  <th className="px-6 py-3">ホテル / 部屋番号</th>
                  <th className="px-6 py-3">宿泊者名</th>
                  <th className="px-6 py-3">数量</th>
                  <th className="px-6 py-3">金額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-700">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-neutral-400 text-xs">
                      まだ注文データがありません
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const hotelName = HOTEL_NAMES[order.hotel_id] || `ホテルID: ${order.hotel_id}`;
                    return (
                      <tr key={order.id} className="hover:bg-neutral-50/50 transition">
                        <td className="px-6 py-4">
                          <div className="font-bold text-neutral-900">#{order.id}</div>
                          <div className="text-xs text-neutral-400 mt-0.5">
                            {new Date(order.created_at).toLocaleString('ja-JP', {
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-block px-2.5 py-1 bg-amber-50 text-amber-800 text-xs font-semibold rounded-full border border-amber-200">
                            {order.delivery_slot}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-neutral-800">
                            {hotelName}
                          </div>
                          <div className="text-xs text-neutral-600 mt-0.5 font-medium">
                            部屋番号: {order.room_number}
                          </div>
                        </td>
                        <td className="px-6 py-4">
            <div className="font-medium text-neutral-900">{order.guest_name}</div>
            {(order.email || order.contact_email) && (
              <div className="text-xs text-neutral-400">{order.email || order.contact_email}</div>
            )}
          </td>
                        <td className="px-6 py-4 font-semibold text-neutral-900">
                          {order.quantity} 箱
                        </td>
                        <td className="px-6 py-4 font-bold text-neutral-900">
                          ¥{order.total_price.toLocaleString()}
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
    </main>
  );
}