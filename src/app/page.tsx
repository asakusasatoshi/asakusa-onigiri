'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { HOTELS_MASTER, Hotel } from '@/data/hotels';

// 2地点間の距離（メートル）を計算
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export default function OrderPage() {
  const [selectedHotelId, setSelectedHotelId] = useState<string>('');
  const [roomNumber, setRoomNumber] = useState('');
  const [guestName, setGuestName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [deliverySlot, setDeliverySlot] = useState('08:00');
  const [quantity, setQuantity] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // GPS検出関連
  const [isLocating, setIsLocating] = useState(false);
  const [gpsNote, setGpsNote] = useState<string>('');

  const PRICE_PER_BOX = 1800;
  const selectedHotel = HOTELS_MASTER.find((h) => h.id === selectedHotelId);

  // GPSで最寄りホテルを検出
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setGpsNote('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;

        let closestHotel: Hotel = HOTELS_MASTER[0];
        let minDistance = Infinity;

        HOTELS_MASTER.forEach((hotel) => {
          if (hotel.lat && hotel.lng) {
            const dist = calculateDistance(userLat, userLng, hotel.lat, hotel.lng);
            if (dist < minDistance) {
              minDistance = dist;
              closestHotel = hotel;
            }
          }
        });

        setSelectedHotelId(closestHotel.id);
        setIsLocating(false);

        if (minDistance < 300) {
          setGpsNote(`📍 Auto-detected: Near ${closestHotel.name} (approx.${minDistance}m)`);
        } else {
          setGpsNote(`📍 Nearest hotel: ${closestHotel.name} (approx.${minDistance}m)`);
        }
      },
      () => {
        setIsLocating(false);
        alert('Could not access your location. Please select your hotel manually.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHotelId) {
      setErrorMessage('Please select your hotel.');
      return;
    }
    if (!roomNumber.trim()) {
      setErrorMessage('Please enter your room number.');
      return;
    }
    if (!guestName.trim()) {
      setErrorMessage('Please enter your name.');
      return;
    }
    if (!contactEmail.trim()) {
      setErrorMessage('Please enter your email.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const orderPayload = {
        hotel_name: selectedHotel?.nameJa || selectedHotel?.name,
        room_number: roomNumber,
        guest_name: guestName,
        contact_email: contactEmail,
        delivery_time: deliverySlot,
        quantity: quantity,
        total_price: quantity * PRICE_PER_BOX,
        status: 'pending',
      };

      const { error } = await supabase.from('orders').insert([orderPayload]);

      if (error) throw error;
      setIsSuccess(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[#faf8f5] text-stone-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-stone-200 rounded-3xl p-8 text-center space-y-6 shadow-sm">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-2xl font-bold border border-emerald-200">
            ✓
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">Order Confirmed</h1>
            <p className="text-xs text-stone-500 mt-1">ご注文を承りました</p>
          </div>

          <div className="bg-stone-50 p-5 rounded-2xl border border-stone-200 text-left text-xs space-y-2.5">
            <div className="flex justify-between">
              <span className="text-stone-500">Hotel / お届け先:</span>
              <span className="font-semibold text-stone-900">{selectedHotel?.nameJa || selectedHotel?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Room / 部屋番号:</span>
              <span className="font-semibold text-stone-900">{roomNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Delivery Time / 配達枠:</span>
              <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {deliverySlot}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Quantity / 数量:</span>
              <span className="font-semibold text-stone-900">{quantity} Box ({quantity * 2} Onigiri)</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-stone-200">
              <span className="text-stone-500">Total / 合計金額:</span>
              <span className="font-bold text-base text-stone-900">¥{(quantity * PRICE_PER_BOX).toLocaleString()}</span>
            </div>
          </div>

          <p className="text-[11px] text-stone-500 leading-relaxed">
            Freshly prepared breakfast will be delivered directly to your room or front desk at {deliverySlot}.
          </p>

          <button
            onClick={() => {
              setIsSuccess(false);
              setRoomNumber('');
            }}
            className="w-full py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold transition border border-stone-200"
          >
            Place Another Order / 別の注文をする
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] text-stone-800 py-12 px-4 flex justify-center">
      <div className="max-w-lg w-full space-y-8">
        
        {/* ヘッダー */}
        <div className="text-center space-y-2">
          <span className="text-[10px] tracking-widest uppercase px-3 py-1 bg-stone-100 text-stone-600 border border-stone-300 rounded-full font-medium">
            Authentic Japanese Morning
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">ASAKUSA ONIGIRI</h1>
          <p className="text-xs text-stone-500 max-w-sm mx-auto leading-relaxed">
            Traditional bamboo-leaf wrapped breakfast delivered fresh to your Asakusa hotel room.
          </p>
        </div>

        {/* 注文フォーム */}
        <form onSubmit={handleSubmit} className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
          
          {/* ホテル選択 & GPS自動検出 */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold tracking-wider text-stone-700 uppercase">
                1. Hotel / お届け先ホテル
              </label>
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={isLocating}
                className="text-[11px] px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 rounded-lg flex items-center gap-1 transition font-medium"
              >
                {isLocating ? 'Detecting...' : '📍 Auto-Detect (GPS)'}
              </button>
            </div>

            {gpsNote && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 font-medium">
                {gpsNote}
              </div>
            )}

            <select
              value={selectedHotelId}
              onChange={(e) => {
                setSelectedHotelId(e.target.value);
                setGpsNote('');
              }}
              required
              className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 text-xs text-stone-900 outline-none focus:border-stone-800 transition"
            >
              <option value="">-- Select Your Hotel / ホテルを選択 --</option>
              {HOTELS_MASTER.map((hotel) => (
                <option key={hotel.id} value={hotel.id}>
                  {hotel.name} ({hotel.nameJa}) - {hotel.area}
                </option>
              ))}
            </select>
          </div>

          {/* 部屋番号 & 宿泊者名 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold tracking-wider text-stone-700 uppercase">
                2. Room Number / 部屋番号
              </label>
              <input
                type="text"
                placeholder="e.g. 502"
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                required
                className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 text-xs text-stone-900 outline-none focus:border-stone-800 transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold tracking-wider text-stone-700 uppercase">
                3. Guest Name / 宿泊者名
              </label>
              <input
                type="text"
                placeholder="e.g. Satoshi Sanaka"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                required
                className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 text-xs text-stone-900 outline-none focus:border-stone-800 transition"
              />
            </div>
          </div>

          {/* メールアドレス */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold tracking-wider text-stone-700 uppercase">
              4. Email Address / 連絡先メール
            </label>
            <input
              type="email"
              placeholder="e.g. guest@example.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              required
              className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 text-xs text-stone-900 outline-none focus:border-stone-800 transition"
            />
          </div>

          {/* 配達時間スロット */}
          <div className="space-y-2">
            <label className="text-xs font-bold tracking-wider text-stone-700 uppercase">
              5. Delivery Time / 配達時間枠
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {['07:00', '08:00', '09:00', '10:00'].map((slot) => (
                <button
                  type="button"
                  key={slot}
                  onClick={() => setDeliverySlot(slot)}
                  className={`py-3 rounded-xl text-xs font-bold border transition ${
                    deliverySlot === slot
                      ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                      : 'bg-stone-50 text-stone-700 border-stone-200 hover:border-stone-400'
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>

          {/* 数量選択 & 金額 */}
          <div className="pt-4 border-t border-stone-200 flex items-center justify-between">
            <div>
              <span className="text-xs text-stone-500">Quantity / 注文数</span>
              <div className="flex items-center gap-3 mt-1.5">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-9 h-9 bg-stone-50 border border-stone-300 rounded-xl font-bold text-stone-800 hover:bg-stone-100 active:scale-95"
                >
                  -
                </button>
                <span className="text-lg font-bold w-6 text-center text-stone-900">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-9 h-9 bg-stone-50 border border-stone-300 rounded-xl font-bold text-stone-800 hover:bg-stone-100 active:scale-95"
                >
                  +
                </button>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[11px] text-stone-500">Total Amount / 合計</span>
              <div className="text-2xl font-extrabold text-stone-900 mt-0.5">
                ¥{(quantity * PRICE_PER_BOX).toLocaleString()}
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white font-bold rounded-2xl text-sm transition shadow-sm active:scale-[0.99]"
          >
            {isSubmitting ? 'Processing Order...' : `Order Breakfast / 朝食を予約する (¥${(quantity * PRICE_PER_BOX).toLocaleString()})`}
          </button>
        </form>

      </div>
    </div>
  );
}