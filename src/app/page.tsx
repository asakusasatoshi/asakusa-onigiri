'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type Hotel = {
  id: number;
  name_en: string;
  name_ja: string;
  reception_type: string;
};

export default function OrderPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotel, setSelectedHotel] = useState<string>('');
  const [roomNumber, setRoomNumber] = useState('');
  const [guestName, setGuestName] = useState('');
  const [email, setEmail] = useState('');
  const [slot, setSlot] = useState('10:00');
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // 1セットの価格（円）
  const PRICE_PER_SET = 1800;

  useEffect(() => {
    // アクティブなホテル一覧を取得
    async function fetchHotels() {
      const { data, error } = await supabase
        .from('hotels')
        .select('id, name_en, name_ja, reception_type')
        .eq('is_active', true);

      if (data && !error) {
        setHotels(data);
        if (data.length > 0) setSelectedHotel(data[0].id.toString());
      }
    }
    fetchHotels();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    // 注文データをSupabaseに登録（Stripe決済前の動作検証用）
    const { error } = await supabase.from('orders').insert([
      {
        hotel_id: parseInt(selectedHotel),
        room_number: roomNumber,
        guest_name: guestName,
        email: email,
        delivery_slot: slot,
        quantity: quantity,
        total_price: quantity * PRICE_PER_SET,
        status: 'paid', // 決済連携前のため一旦paidで記録
      },
    ]);

    setLoading(false);
    if (error) {
      setMessage('Error: ' + error.message);
    } else {
      setMessage('Order placed successfully! We are preparing your breakfast.');
      setRoomNumber('');
      setGuestName('');
      setEmail('');
    }
  };

  return (
    <main className="max-w-md mx-auto p-6 bg-stone-50 min-h-screen text-stone-900">
      <header className="mb-6 text-center border-b border-stone-200 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          CHEF GANESA
        </h1>
        <p className="text-sm text-stone-600 mt-1">
          Artisanal Tokyo Onigiri Breakfast Box
        </p>
      </header>

      {/* 今日の具材案内 */}
      <section className="bg-white p-4 rounded-lg border border-stone-200 shadow-sm mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
          Today's 4 Flavors Box (¥{PRICE_PER_SET})
        </h2>
        <ul className="text-sm space-y-1 text-stone-700">
          <li>・ Grilled Salmon (秋鮭塩焼き)</li>
          <li>・ Kishu Umeboshi (紀州南高梅)</li>
          <li>・ Spicy Takana (辛子高菜)</li>
          <li>・ Spicy Cod Roe (博多明太子)</li>
        </ul>
      </section>

      {/* 注文フォーム */}
      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-5 rounded-lg border border-stone-200 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Delivery Hotel
          </label>
          <select
            value={selectedHotel}
            onChange={(e) => setSelectedHotel(e.target.value)}
            className="w-full border border-stone-300 rounded p-2 text-sm bg-white"
            required
          >
            {hotels.length === 0 ? (
              <option value="">Loading hotels...</option>
            ) : (
              hotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name_en} ({h.name_ja})
                </option>
              ))
            )}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">
              Room Number
            </label>
            <input
              type="text"
              placeholder="e.g. 502"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              className="w-full border border-stone-300 rounded p-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">
              Delivery Slot
            </label>
            <select
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              className="w-full border border-stone-300 rounded p-2 text-sm bg-white"
            >
              <option value="10:00">10:00 AM</option>
              <option value="12:00">12:00 PM</option>
              <option value="14:00">02:00 PM</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Guest Full Name
          </label>
          <input
            type="text"
            placeholder="John Doe"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            className="w-full border border-stone-300 rounded p-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Contact Email
          </label>
          <input
            type="email"
            placeholder="john@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-stone-300 rounded p-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Quantity (Boxes)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="1"
              max="10"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 border border-stone-300 rounded p-2 text-sm text-center"
              required
            />
            <span className="text-sm font-semibold text-stone-800">
              Total: ¥{(quantity * PRICE_PER_SET).toLocaleString()}
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-4 bg-stone-900 text-white font-medium py-3 rounded-lg hover:bg-stone-800 transition disabled:opacity-50 text-sm tracking-wide"
        >
          {loading ? 'Processing...' : `Place Order (¥${(quantity * PRICE_PER_SET).toLocaleString()})`}
        </button>

        {message && (
          <p className="mt-3 text-xs text-center font-medium text-stone-700 bg-stone-100 p-2 rounded">
            {message}
          </p>
        )}
      </form>
    </main>
  );
}