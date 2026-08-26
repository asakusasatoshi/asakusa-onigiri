'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { HOTELS_MASTER, Hotel } from '@/data/hotels';

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
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [deliverySlot, setDeliverySlot] = useState('08:00');
  const [quantity, setQuantity] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // GPS検出関連
  const [isLocating, setIsLocating] = useState(false);
  const [gpsNote, setGpsNote] = useState<string>('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const PRICE_PER_BOX = 1800;
  const selectedHotel = HOTELS_MASTER.find((h) => String(h.id) === String(selectedHotelId));

  // QRコード等からのURLパラメータ自動判定 (?hotel=hotel-id)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const paramHotel = params.get('hotel');
      if (paramHotel && HOTELS_MASTER.some((h) => h.id === paramHotel)) {
        setSelectedHotelId(paramHotel);
      }
    }
  }, []);

  // エリアごとにホテルをグループ化し、エリア内を英語名（A-Z順）にソート
  const groupedHotels = useMemo(() => {
    const groups: Record<string, Hotel[]> = {};
    HOTELS_MASTER.forEach((hotel) => {
      if (!groups[hotel.area]) {
        groups[hotel.area] = [];
      }
      groups[hotel.area].push(hotel);
    });

    Object.keys(groups).forEach((area) => {
      groups[area].sort((a, b) => a.name.localeCompare(b.name));
    });

    return groups;
  }, []);

  // 常時表示される英語表記マップHTML
  const mapHtml = useMemo(() => {
    const centerLat = selectedHotel ? selectedHotel.lat : (userLocation ? userLocation.lat : 35.7147);
    const centerLng = selectedHotel ? selectedHotel.lng : (userLocation ? userLocation.lng : 139.7967);
    const zoomLevel = selectedHotel ? 17 : (userLocation ? 15 : 15);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #f5f5f4; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          .user-pulse {
            width: 14px; height: 14px; background: #2563eb; border-radius: 50%;
            border: 2px solid #ffffff; box-shadow: 0 0 10px rgba(37,99,235,0.6);
            animation: pulse 1.8s infinite;
          }
          @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7); }
            70% { box-shadow: 0 0 0 14px rgba(37, 99, 235, 0); }
            100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', { zoomControl: false }).setView([${centerLat}, ${centerLng}], ${zoomLevel});
          
          L.tileLayer('https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            attribution: '&copy; Google Maps'
          }).addTo(map);

          var bounds = [];

          ${userLocation ? `
            var userIcon = L.divIcon({ className: 'user-pulse', iconSize: [14, 14], iconAnchor: [7, 7] });
            L.marker([${userLocation.lat}, ${userLocation.lng}], { icon: userIcon })
              .addTo(map)
              .bindPopup("<b>📍 You are here</b>")
              .openPopup();
            bounds.push([${userLocation.lat}, ${userLocation.lng}]);
          ` : ''}

          ${selectedHotel ? `
            var hotelMarker = L.marker([${selectedHotel.lat}, ${selectedHotel.lng}])
              .addTo(map)
              .bindPopup("<b>🏨 ${selectedHotel.name}</b><br><span style='font-size:11px; color:#555;'>${selectedHotel.addressEn || selectedHotel.address}</span>");
            ${!userLocation ? 'hotelMarker.openPopup();' : ''}
            bounds.push([${selectedHotel.lat}, ${selectedHotel.lng}]);
          ` : ''}

          if (bounds.length === 2) {
            map.fitBounds(bounds, { padding: [35, 35], maxZoom: 17 });
          }
        </script>
      </body>
      </html>
    `;
  }, [selectedHotel, userLocation]);

  // GPSで最寄りホテルを自動検出
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

        setUserLocation({ lat: userLat, lng: userLng });

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

        setSelectedHotelId(String(closestHotel.id));
        setIsLocating(false);

        if (minDistance < 300) {
          setGpsNote(`📍 Auto-detected: Near ${closestHotel.name} (${minDistance}m)`);
        } else {
          setGpsNote(`📍 Nearest hotel in delivery zone: ${closestHotel.name} (${minDistance}m)`);
        }
      },
      () => {
        setIsLocating(false);
        alert('Could not access your location. Please select your hotel manually from the list below.');
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
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMessage('Please enter both First Name and Last Name.');
      return;
    }
    if (!contactEmail.trim()) {
      setErrorMessage('Please enter your email.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    try {
      const orderPayload = {
        hotel_name: selectedHotel?.nameJa || selectedHotel?.name,
        room_number: roomNumber,
        guest_name: fullName,
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
              <span className="text-stone-500">Guest / ご宿泊者:</span>
              <span className="font-semibold text-stone-900">{firstName} {lastName}</span>
            </div>
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
              setFirstName('');
              setLastName('');
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
          
          {/* 1. ホテル位置特定セクション */}
          <div className="space-y-3">
            <label className="text-xs font-bold tracking-wider text-stone-700 uppercase block">
              1. Delivery Location / お届け先ホテル
            </label>

            {/* メインのGPS自動検出ボタン */}
            <button
              type="button"
              onClick={handleDetectLocation}
              disabled={isLocating}
              className="w-full py-3.5 bg-stone-900 hover:bg-stone-800 active:scale-[0.99] disabled:bg-stone-300 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shadow-sm"
            >
              <span>📍</span>
              <span>{isLocating ? 'Detecting your hotel location...' : 'Auto-Detect My Hotel (GPS) / 現在地から自動検出'}</span>
            </button>

            {gpsNote && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-800 font-medium">
                {gpsNote}
              </div>
            )}

            {/* 常時表示の英語マップ */}
            <div className="rounded-2xl overflow-hidden border border-stone-200 bg-stone-100 relative shadow-inner">
              <iframe
                title="Interactive Hotel Map"
                srcDoc={mapHtml}
                className="w-full h-44 border-0"
              />
              <div className="bg-white/95 backdrop-blur-sm px-3.5 py-2 border-t border-stone-200 text-[11px] flex justify-between items-center text-stone-700">
                <div className="flex items-center gap-2 truncate">
                  {userLocation && (
                    <span className="flex items-center gap-1 text-blue-700 font-semibold shrink-0">
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span> You
                    </span>
                  )}
                  <span className="font-medium truncate">
                    {selectedHotel ? `🏨 ${selectedHotel.name}` : '📍 Asakusa Delivery Zone'}
                  </span>
                </div>
                {selectedHotel && (
                  <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shrink-0 ml-2">
                    {selectedHotel.area}
                  </span>
                )}
              </div>
            </div>

            {/* 手動選択プルダウン */}
            <div>
              <span className="text-[11px] text-stone-500 block mb-1.5 font-medium">
                Or select your hotel manually / または一覧から選択:
              </span>
              <select
                value={selectedHotelId}
                onChange={(e) => {
                  setSelectedHotelId(e.target.value);
                  setGpsNote('');
                }}
                required
                className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 text-xs text-stone-900 outline-none focus:border-stone-800 transition font-medium"
              >
                <option value="">-- Choose hotel from list (A-Z) / ホテル一覧 --</option>
                {Object.entries(groupedHotels).map(([areaName, hotels]) => (
                  <optgroup key={areaName} label={`--- ${areaName} ---`}>
                    {hotels.map((hotel) => (
                      <option key={hotel.id} value={hotel.id}>
                        {hotel.name} ({hotel.nameJa})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          {/* 2. 部屋番号 */}
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

          {/* 3 & 4. 宿泊者名 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold tracking-wider text-stone-700 uppercase">
                3. First Name / 名
              </label>
              <input
                type="text"
                placeholder="e.g. Satoshi"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 text-xs text-stone-900 outline-none focus:border-stone-800 transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold tracking-wider text-stone-700 uppercase">
                4. Last Name / 姓
              </label>
              <input
                type="text"
                placeholder="e.g. Sanaka"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 text-xs text-stone-900 outline-none focus:border-stone-800 transition"
              />
            </div>
          </div>

          {/* 5. メールアドレス */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold tracking-wider text-stone-700 uppercase">
              5. Email Address / 連絡先メール
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

          {/* 6. 配達時間スロット */}
          <div className="space-y-2">
            <label className="text-xs font-bold tracking-wider text-stone-700 uppercase">
              6. Delivery Time / 配達時間枠
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