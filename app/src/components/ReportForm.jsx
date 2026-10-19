import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LEVELS, ROADS } from '../config';

export default function ReportForm({ visible, onClose, onSubmit, hasLocation }) {
  const [level, setLevel] = useState(1);
  const [road, setRoad] = useState('wet');
  const [note, setNote] = useState('');

  const submit = () => {
    onSubmit({ level, road, note: note.trim() });
    setNote('');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />
        <Text style={s.title}>지금 여기 눈 상황 제보</Text>

        <Text style={s.label}>적설</Text>
        <View style={s.row}>
          {LEVELS.map((l) => (
            <Pressable
              key={l.value}
              onPress={() => setLevel(l.value)}
              style={[s.levelBtn, level === l.value && { borderColor: l.color, backgroundColor: l.color + '1A' }]}
            >
              <Text style={s.emoji}>{l.emoji}</Text>
              <Text style={[s.levelText, level === l.value && { color: l.color, fontWeight: '700' }]}>{l.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.label}>노면</Text>
        <View style={s.chips}>
          {ROADS.map((r) => (
            <Pressable key={r.value} onPress={() => setRoad(r.value)} style={[s.chip, road === r.value && s.chipOn]}>
              <Text style={[s.chipText, road === r.value && s.chipTextOn]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.label}>메모 (선택)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="예) 언덕길 미끄러워요, 제설차 지나감"
          maxLength={200}
          style={s.input}
          multiline
        />

        {!hasLocation && <Text style={s.warn}>위치를 아직 못 받았어요. 위치 권한을 확인해주세요.</Text>}

        <Pressable style={[s.submit, !hasLocation && { opacity: 0.4 }]} onPress={submit} disabled={!hasLocation}>
          <Text style={s.submitText}>제보 보내기</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)' },
  sheet: { backgroundColor: '#fff', padding: 20, paddingBottom: 36, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  label: { fontSize: 13, color: '#64748B', marginTop: 14, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  levelBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0' },
  emoji: { fontSize: 22 },
  levelText: { fontSize: 12, color: '#334155', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#F1F5F9' },
  chipOn: { backgroundColor: '#0F172A' },
  chipText: { color: '#334155' },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, minHeight: 64, textAlignVertical: 'top' },
  warn: { color: '#DC2626', marginTop: 10, fontSize: 12 },
  submit: { marginTop: 18, backgroundColor: '#2563EB', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
