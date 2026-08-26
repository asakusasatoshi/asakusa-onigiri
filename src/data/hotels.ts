export interface Hotel {
  id: string;
  name: string;        // 英語表記（表示・ソート用）
  nameJa: string;      // 日本語表記（配達伝票・管理用）
  address: string;     // 住所
  area: string;        // エリア
  lat: number;         // 緯度
  lng: number;         // 経度
}

// 浅草エリアの対象ホテルマスター
export const HOTELS_MASTER: Hotel[] = [
  {
    id: "apa-asakusa-ekimae",
    name: "APA Hotel Asakusa Ekimae",
    nameJa: "アパホテル〈浅草駅前〉",
    address: "東京都台東区駒形1-12-16",
    area: "Komagata 1",
    lat: 35.7088,
    lng: 139.7963,
  },
  {
    id: "asakusa-view-hotel",
    name: "Asakusa View Hotel",
    nameJa: "浅草ビューホテル",
    address: "東京都台東区西浅草3-17-1",
    area: "Nishi-Asakusa 3",
    lat: 35.7144,
    lng: 139.7917,
  },
  {
    id: "hotel-gracery-asakusa",
    name: "Hotel Gracery Asakusa",
    nameJa: "ホテルグレイスリー浅草",
    address: "東京都台東区雷門2-10-2",
    area: "Kaminarimon 2",
    lat: 35.7095,
    lng: 139.7947,
  },
  {
    id: "richmond-asakusa",
    name: "Richmond Hotel Asakusa",
    nameJa: "リッチモンドホテル浅草",
    address: "東京都台東区浅草2-7-10",
    area: "Asakusa 2",
    lat: 35.7148,
    lng: 139.7942,
  },
  {
    id: "the-gate-hotel-asakusa",
    name: "The Gate Hotel Asakusa Kaminarimon",
    nameJa: "ザ・ゲートホテル雷門 by HULIC",
    address: "東京都台東区雷門2-16-11",
    area: "Kaminarimon 2",
    lat: 35.7107,
    lng: 139.7958,
  },
];

/**
 * ホテル一覧をアルファベット昇順（A-Z）で並び替えて返す関数
 */
export const getSortedHotels = (hotels: Hotel[] = HOTELS_MASTER): Hotel[] => {
  return [...hotels].sort((a, b) => a.name.localeCompare(b.name, "en"));
};