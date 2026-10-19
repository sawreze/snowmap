import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';

import { WS_URL } from './src/config';
import { useSnowSocket } from './src/useSnowSocket';
import ReportForm from './src/components/ReportForm';
import ReportCard from './src/components/ReportCard';
import ForecastPanel from './src/components/ForecastPanel';

// 두 좌표 사이 거리(km)
const haversine = (a, b) => {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const RADII = [1, 5, 20, null]; // km, null = 전체

function Main() {
  const [nickname, setNickname] = useState('눈사람' + Math.floor(Math.random() * 1000));
  const [coords, setCoords] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [radius, setRadius] = useState(5);
  const [myVotes, setMyVotes] = useState({}); // id -> 'confirm' | 'gone'

  const {
    status, clientId, reports, online, lastError, createReport, vote,
    localForecast, nationalForecast, subscribeForecast,
  } = useSnowSocket(WS_URL, nickname);

  // 위치가 바뀌면 내 위치 기상청 예보 구독 갱신 (서버가 같은 격자는 캐시)
  useEffect(() => {
    if (coords) subscribeForecast(coords.lat, coords.lng);
  }, [coords, subscribeForecast]);

  // 위치 추적
  useEffect(() => {
    let sub;
    (async () => {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        Alert.alert('위치 권한 필요', '근처 제보를 보고 제보하려면 위치 권한이 필요해요.');
        return;
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 50 },
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude })
      );
    })();
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    if (lastError) Alert.alert('알림', lastError.message);
  }, [lastError]);

  const list = useMemo(() => {
    const withDist = reports.map((r) => ({ r, d: coords ? haversine(coords, r) : null }));
    return radius == null || !coords ? withDist : withDist.filter((x) => x.d <= radius);
  }, [reports, coords, radius]);

  const onSubmit = (form) => {
    if (!coords) return;
    createReport({ ...form, lat: coords.lat, lng: coords.lng });
    setFormOpen(false);
  };

  const onVote = (id, kind) => {
    setMyVotes((v) => ({ ...v, [id]: v[id] === kind ? undefined : kind }));
    vote(id, kind);
  };

  const dot = { open: '#22C55E', connecting: '#F59E0B', closed: '#EF4444' }[status];
  const statusLabel = { open: `실시간 연결됨 · ${online}명 접속`, connecting: '연결 중…', closed: '연결 끊김 · 재시도 중' }[status];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <Text style={s.logo}>❄️ snowweb</Text>
        <View style={s.statusRow}>
          <View style={[s.dot, { backgroundColor: dot }]} />
          <Text style={s.statusText}>{statusLabel}</Text>
        </View>
        <TextInput value={nickname} onChangeText={setNickname} maxLength={20} style={s.nick} placeholder="닉네임" />
        <ForecastPanel local={localForecast} national={nationalForecast} />
        <View style={s.filters}>
          {RADII.map((km) => (
            <Pressable key={String(km)} onPress={() => setRadius(km)} style={[s.filter, radius === km && s.filterOn]}>
              <Text style={[s.filterText, radius === km && s.filterTextOn]}>{km == null ? '전체' : `${km}km`}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={list}
        keyExtractor={(x) => x.r.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <ReportCard
            report={item.r}
            distanceKm={item.d}
            mine={item.r.authorId === clientId}
            myVote={myVotes[item.r.id]}
            onVote={(kind) => onVote(item.r.id, kind)}
          />
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>⛄</Text>
            <Text style={s.emptyText}>{radius ? `${radius}km 안에 제보가 없어요.` : '아직 제보가 없어요.'}</Text>
            <Text style={s.emptySub}>첫 번째로 지금 상황을 알려주세요!</Text>
          </View>
        }
      />

      <Pressable style={s.fab} onPress={() => setFormOpen(true)}>
        <Text style={s.fabText}>＋ 제보하기</Text>
      </Pressable>

      <ReportForm visible={formOpen} onClose={() => setFormOpen(false)} onSubmit={onSubmit} hasLocation={!!coords} />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F1F5F9' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  logo: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 12, color: '#64748B' },
  nick: { marginTop: 10, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 10 },
  filter: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F1F5F9' },
  filterOn: { backgroundColor: '#2563EB' },
  filterText: { color: '#334155', fontSize: 13 },
  filterTextOn: { color: '#fff', fontWeight: '700' },
  list: { padding: 16, paddingBottom: 100 },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { marginTop: 10, fontSize: 15, color: '#334155', fontWeight: '600' },
  emptySub: { marginTop: 4, color: '#64748B' },
  fab: { position: 'absolute', right: 20, bottom: 32, backgroundColor: '#2563EB', paddingHorizontal: 22, paddingVertical: 14, borderRadius: 999, shadowColor: '#1D4ED8', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
