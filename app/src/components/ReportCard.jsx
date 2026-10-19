import { Pressable, StyleSheet, Text, View } from 'react-native';
import { levelOf, roadOf } from '../config';

const timeAgo = (t) => {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  return `${Math.floor(m / 60)}시간 전`;
};

const fmtDist = (km) => (km == null ? '' : km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`);

export default function ReportCard({ report, distanceKm, mine, myVote, onVote }) {
  const lv = levelOf(report.level);
  return (
    <View style={[s.card, { borderLeftColor: lv.color }]}>
      <View style={s.top}>
        <Text style={s.emoji}>{lv.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.head}>
            {lv.label} · 노면 {roadOf(report.road).label}
          </Text>
          <Text style={s.meta}>
            {report.nickname}{mine ? ' (나)' : ''} · {timeAgo(report.createdAt)}
            {distanceKm != null ? ` · ${fmtDist(distanceKm)}` : ''}
          </Text>
        </View>
      </View>
      {!!report.note && <Text style={s.note}>{report.note}</Text>}
      <View style={s.actions}>
        <Pressable onPress={() => onVote('confirm')} style={[s.vote, myVote === 'confirm' && s.voteOn]}>
          <Text style={[s.voteText, myVote === 'confirm' && s.voteTextOn]}>👍 맞아요 {report.confirms}</Text>
        </Pressable>
        <Pressable onPress={() => onVote('gone')} style={[s.vote, myVote === 'gone' && s.voteOn]}>
          <Text style={[s.voteText, myVote === 'gone' && s.voteTextOn]}>🫥 사라졌어요 {report.gones}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderLeftWidth: 4, shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emoji: { fontSize: 26 },
  head: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  meta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  note: { marginTop: 8, color: '#334155', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  vote: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F1F5F9' },
  voteOn: { backgroundColor: '#DBEAFE' },
  voteText: { fontSize: 13, color: '#334155' },
  voteTextOn: { color: '#1D4ED8', fontWeight: '700' },
});
