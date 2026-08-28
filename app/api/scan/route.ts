import { NextResponse } from 'next/server';

// APIの連続アクセスに必要な待機時間（Googleの仕様で2秒必須）
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithToken(baseUrl: string, token: string = '') {
  const url = token ? `${baseUrl}&pagetoken=${token}` : baseUrl;
  const res = await fetch(url);
  return res.json();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const radius = searchParams.get('radius');

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'API key is missing' }, { status: 500 });
  }

  // 謎のキーワード指定を外し、宿泊施設（type=lodging）全体を対象にする
  const baseUrlEn = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=lodging&language=en&key=${apiKey}`;
  const baseUrlJa = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=lodging&language=ja&key=${apiKey}`;

  try {
    let allEnResults: any[] = [];
    let allJaResults: any[] = [];

    // --- 1ページ目 (最大20件) ---
    const enData1 = await fetchWithToken(baseUrlEn);
    const jaData1 = await fetchWithToken(baseUrlJa);
    allEnResults = [...(enData1.results || [])];
    allJaResults = [...(jaData1.results || [])];

    // --- 2ページ目 (最大20件追加) ---
    if (enData1.next_page_token && jaData1.next_page_token) {
      await delay(2000); // 次のページをリクエストする前に2秒待機
      const enData2 = await fetchWithToken(baseUrlEn, enData1.next_page_token);
      const jaData2 = await fetchWithToken(baseUrlJa, jaData1.next_page_token);
      allEnResults = [...allEnResults, ...(enData2.results || [])];
      allJaResults = [...allJaResults, ...(jaData2.results || [])];

      // --- 3ページ目 (最大20件追加・Googleの取得限界) ---
      if (enData2.next_page_token && jaData2.next_page_token) {
        await delay(2000);
        const enData3 = await fetchWithToken(baseUrlEn, enData2.next_page_token);
        const jaData3 = await fetchWithToken(baseUrlJa, jaData2.next_page_token);
        allEnResults = [...allEnResults, ...(enData3.results || [])];
        allJaResults = [...allJaResults, ...(jaData3.results || [])];
      }
    }

    // 英語と日本語を合体させる
    const mergedResults = allEnResults.map((enPlace: any) => {
      const jaPlace = allJaResults.find((jp: any) => jp.place_id === enPlace.place_id);
      return {
        ...enPlace,
        name_en: enPlace.name,
        name_ja: jaPlace ? jaPlace.name : null,
      };
    });

    return NextResponse.json({ results: mergedResults });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch data from Google Maps' }, { status: 500 });
  }
}