import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const SNOW_PTY = [2, 3, 6, 7];
const PTY_ICON = { 0: '', 1: '🌧️', 2: '🌨️', 3: '❄️', 4: '🌦️', 5: '💧', 6: '🌨️', 7: '❄️' };

// "202610191800" -> "오늘 18시" / "내일 03시"
function label(t) {
  if (!t) return '';
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const today = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  const day = t.slice(0, 8) === today ? '오늘' : '내일';
  return `${day} ${t.slice(8, 10)}시`;
}

const ago = (t) => {
  const m = Math.floor((Date.now() - t) / 60000);
  return m < 1 ? '방금' : `${m}분 전`;
};

export default function ForecastPanel({ local, national }) {
  const [open, setOpen] = useState(false);
  const s = local?.summary;
  const snowRegions = (national?.regions || []).filter((r) => r.willSnow);

  return (
    <View style={st.wrap}>
      {/* 내 위치 예보 */}
      <Pressable onPress={() => local?.hours && setOpen((o) => !o)} style={[st.banner, s?.willSnow ? st.bannerSnow : st.bannerClear]}>
        {!local ? (
          <Text style={st.bannerText}>📡 내 위치 기상청 예보 불러오는 중…</Text>
        ) : local.error ? (
          <Text style={st.bannerText}>⚠️ 예보 오류: {local.error}</Text>
        ) : s.willSnow ? (
          <>
            <Text style={st.bannerTitle}>❄️ {label(s.start)}부터 눈 예보</Text>
            <Text style={st.bannerSub}>
              {label(s.end)}까지 · 예상 적설 {s.totalSno > 0 ? `약 ${s.totalSno}cm` : '1cm 미만'} · 강수확률 최대 {s.maxPop}%
            </Text>
          </>
        ) : (
          <Text style={st.bannerTitle}>☁️ 24시간 안에 내 위치 눈 예보 없음</Text>
        )}
        {local?.updatedAt && (
          <Text style={st.meta}>
            기상청 단기예보 · {ago(local.updatedAt)} 갱신{local.mock ? ' · 테스트 데이터' : ''} {open ? '▲' : '▼'}
          </Text>
        )}
      </Pressable>

      {/* 시간별 */}
      {open && local?.hours && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.hours}>
          {local.hours.map((h) => {
            const snow = SNOW_PTY.includes(h.pty) || h.sno > 0;
            return (
              <View key={h.time} style={[st.hour, snow && st.hourSnow]}>
                <Text style={st.hourTime}>{h.time.slice(8, 10)}시</Text>
                <Text style={st.hourIcon}>{PTY_ICON[h.pty] || '·'}</Text>
                <Text style={st.hourTmp}>{h.tmp != null ? `${h.tmp}°` : '-'}</Text>
                <Text style={st.hourPop}>{h.pop}%</Text>
                {h.sno > 0 && <Text style={st.hourSno}>{h.sno}cm</Text>}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* 전국 눈 예보 지역 */}
      {national && (
        <View style={st.national}>
          <Text style={st.natTitle}>
            24시간 내 눈 예보 지역 {snowRegions.length ? `(${snowRegions.length}곳)` : ''}
          </Text>
          {snowRegions.length === 0 ? (
            <Text style={st.natEmpty}>주요 지역에 눈 예보가 없어요.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {snowRegions.map((r) => (
                <View key={r.name} style={st.region}>
                  <Text style={st.regionName}>{r.name}</Text>
                  <Text style={st.regionSub}>{label(r.start)}~</Text>
                  <Text style={st.regionSno}>{r.totalSno > 0 ? `${r.totalSno}cm` : '<1cm'}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginTop: 10 },
  banner: { borderRadius: 14, padding: 12 },
  bannerSnow: { backgroundColor: '#DBEAFE' },
  bannerClear: { backgroundColor: '#F1F5F9' },
  bannerText: { color: '#334155' },
  bannerTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  bannerSub: { marginTop: 3, fontSize: 13, color: '#1E3A8A' },
  meta: { marginTop: 6, fontSize: 11, color: '#64748B' },
  hours: { gap: 6, paddingVertical: 8 },
  hour: { width: 52, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: '#F8FAFC' },
  hourSnow: { backgroundColor: '#E0E7FF' },
  hourTime: { fontSize: 11, color: '#64748B' },
  hourIcon: { fontSize: 18, marginVertical: 2, minHeight: 22 },
  hourTmp: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  hourPop: { fontSize: 11, color: '#2563EB' },
  hourSno: { fontSize: 11, color: '#7C3AED', fontWeight: '700' },
  national: { marginTop: 10 },
  natTitle: { fontSize: 12, color: '#64748B', marginBottom: 6, fontWeight: '600' },
  natEmpty: { fontSize: 12, color: '#94A3B8' },
  region: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', minWidth: 64 },
  regionName: { fontWeight: '800', color: '#3730A3' },
  regionSub: { fontSize: 11, color: '#6366F1', marginTop: 2 },
  regionSno: { fontSize: 12, color: '#7C3AED', fontWeight: '700' },
});
