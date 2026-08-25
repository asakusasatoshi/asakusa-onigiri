'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface Hotel {
  id: number;
  name: string;
}

interface Order {
  id: number;
  created_at: string;
  order_date: string;
  delivery_slot: string;
  hotel_id: number;
  room_number: string;
  guest_name?: string;
  contact_email?: string;
  quantity: number;
  total_price: number;
  status?: string;
}

export default function AdminPage() {
  const [passcode, setPasscode] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [hotels, setHotels] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const targetPasscode = process.env.NEXT_PUBLIC_ADMIN_PASSCODE || '1234';

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === targetPasscode) {
      setIsAuthenticated(true);
      setErrorMsg('');
      loadData();
    } else {
      setErrorMsg('パスコードが正しくありません');
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // ホテル一覧取得
      const { data: hotelList } = await supabase.from('hotels').select('id, name');
      const hotelMap: Record<number, string> = {};
      if (hotelList) {
        hotelList.forEach((h: Hotel) => {
          hotelMap[h.id] = h.name;
        });
        setHotels(hotelMap);
      }

      // 注文一覧取得（新しい順）
      const { data: orderList, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('注文取得エラー:', error);
      } else if (orderList) {
        setOrders(orderList);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f7f5f0] flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#e5e0d8] w-full max-w-sm">
          <h1 className="text-xl font-bold text-[#2d2926] text-center mb-6 tracking-wide">
            管理者ログイン
          </h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                パスコード (初期値: 1234)
              </label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="4桁の数字"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-[#8c7355]"
                autoFocus
              />
            </div>
            {errorMsg && (
              <p className="text-red-500 text-xs text-center">{errorMsg}</p>
            )}
            <button
              type="submit"
              className="w-full bg-[#2d2926] text-white py-2.5 rounded-lg font-medium hover:bg-black transition-colors"
            >
              ログイン
            </button>
          </form>
        </div>
      </div>
    );
  }

  const totalSales = orders.reduce((sum, o) => sum + (o.total_price || 0), 0);
  const totalBoxes = orders.reduce((sum, o) => sum + (o.quantity || 0), 0);

  return (
    <div className="min-h-screen bg-[#f7f5f0] p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-[#e5e0d8] gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#2d2926] tracking-tight">
              浅草おにぎり 朝食受注管理
            </h1>
            <p className="text-sm text-gray-500 mt-1">リアルタイム受注ダッシュボード</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={loading}
              className="px-4 py-2 bg-white border border-[#d6d0c7] text-[#2d2926] rounded-lg text-sm font-medium hover:bg-gray-50 shadow-sm"
            >
              {loading ? '更新中...' : '最新情報に更新'}
            </button>
            <button
              onClick={() => setIsAuthenticated(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300"
            >
              ログアウト
            </button>
          </div>
        </div>

        {/* 集計サマリー */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 my-6">
          <div className="bg-white p-5 rounded-xl border border-[#e5e0d8] shadow-sm">
            <span className="text-xs font-semibold text-gray-500 block">総注文数</span>
            <span className="text-2xl font-bold text-[#2d2926] mt-1 block">{orders.length} 件</span>
          </div>
          <div className="bg-white p-5 rounded-xl border border-[#e5e0d8] shadow-sm">
            <span className="text-xs font-semibold text-gray-500 block">合計提供個数</span>
            <span className="text-2xl font-bold text-[#8c7355] mt-1 block">{totalBoxes} 箱</span>
          </div>
          <div className="bg-white p-5 rounded-xl border border-[#e5e0d8] shadow-sm col-span-2 sm:col-span-1">
            <span className="text-xs font-semibold text-gray-500 block">合計売上</span>
            <span className="text-2xl font-bold text-[#2d2926] mt-1 block">¥{totalSales.toLocaleString()}</span>
          </div>
        </div>

        {/* 注文一覧テーブル */}
        <div className="bg-white rounded-xl border border-[#e5e0d8] shadow-sm overflow-hidden">
          <div className="p-4 border-b border-[#e5e0d8] bg-[#faf9f6]">
            <h2 className="font-bold text-[#2d2926] text-sm">受注一覧</h2>
          </div>

          {orders.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">
              現在注文はありません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#e5e0d8] text-xs font-semibold text-gray-500 uppercase bg-[#faf9f6]">
                    <th className="p-3.5">ID / 受注日時</th>
                    <th className="p-3.5">配達時間</th>
                    <th className="p-3.5">ホテル / 部屋番号</th>
                    <th className="p-3.5">宿泊者名</th>
                    <th className="p-3.5 text-center">数量</th>
                    <th className="p-3.5 text-right">金額</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eee9e0]">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-[#faf9f7] transition-colors">
                      <td className="p-3.5">
                        <div className="font-semibold text-gray-900">#{o.id}</div>
                        <div className="text-xs text-gray-400">
                          {new Date(o.created_at).toLocaleString('ja-JP', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className="inline-block px-2.5 py-1 bg-[#f3efe8] text-[#6b5840] font-semibold text-xs rounded-full">
                          {o.delivery_slot}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="font-medium text-gray-800">
                          {hotels[o.hotel_id] || `ホテルID: ${o.hotel_id}`}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          部屋番号: <span className="font-semibold text-gray-700">{o.room_number || '-'}</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-gray-700">
                        <div>{o.guest_name || '-'}</div>
                        {o.contact_email && (
                          <div className="text-xs text-gray-400">{o.contact_email}</div>
                        )}
                      </td>
                      <td className="p-3.5 text-center font-bold text-gray-800">
                        {o.quantity} 箱
                      </td>
                      <td className="p-3.5 text-right font-bold text-[#8c7355]">
                        ¥{o.total_price?.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}