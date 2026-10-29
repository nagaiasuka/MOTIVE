import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  isHealthDataAvailable,
  queryStatisticsCollectionForQuantity,
  queryWorkoutSamples,
  requestAuthorization,
  WorkoutActivityType,
} from '@kingstinct/react-native-healthkit';

type FoodEntry = { id: string; name: string; kcal: number; meal: string };
type StrengthEntry = {
  id: string;
  name: string;
  minutes: number;
  sets: number;
  reps: number;
  kcal: number;
  alsoInHealth: boolean;
};
type HealthWorkoutEntry = {
  id: string;
  activityName: string;
  startDate: string;
  endDate: string;
  durationMinutes: number;
};
type DayLog = {
  weight?: number;
  foods: FoodEntry[];
  strength: StrengthEntry[];
  healthSteps?: number;
  healthActiveKcal?: number;
  healthSyncedAt?: string;
  healthWorkouts: HealthWorkoutEntry[];
};
type Profile = {
  heightCm: number;
  ageYears: number;
  startWeight: number;
  targetWeight: number;
  dailyKcalTarget: number;
  targetDate: string;
};
type AppData = { logs: Record<string, DayLog>; profile?: Profile };
type Tab = 'today' | 'record' | 'trends' | 'settings';
type EntryModal = 'food' | 'weight' | 'strength' | null;

const STORAGE_KEY = 'motive.v1.data';
const DEFAULT_PROFILE: Profile = {
  heightCm: 170,
  ageYears: 30,
  startWeight: 80,
  targetWeight: 75,
  dailyKcalTarget: 2000,
  targetDate: '2027-06-01',
};
const COLORS = {
  bg: '#07111F',
  surface: '#101D2D',
  surface2: '#17263A',
  line: '#26374C',
  text: '#F4F7FB',
  muted: '#93A4B8',
  orange: '#FF7849',
  mint: '#58D6B0',
  blue: '#74A9FF',
  yellow: '#F5C76B',
  red: '#FF7D82',
};

const dateKey = (now: Date) => {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const todayKey = () => dateKey(new Date());
const blankDay = (): DayLog => ({ foods: [], strength: [], healthWorkouts: [] });
const newId = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const num = (value: string, fallback = 0) => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const formatDate = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return `${month}月${day}日（${'日月火水木金土'[new Date(year, month - 1, day).getDay()]}）`;
};
const bmrFor = (weight: number, profile: Profile) =>
  Math.round(10 * weight + 6.25 * profile.heightCm - 5 * profile.ageYears + 5);
const workoutNameFor = (activityType: WorkoutActivityType) => {
  const name = WorkoutActivityType[activityType] ?? '';
  const labels: Record<string, string> = {
    traditionalStrengthTraining: '筋力トレーニング',
    functionalStrengthTraining: '筋力トレーニング',
    walking: 'ウォーキング',
    running: 'ランニング',
    cycling: 'サイクリング',
    hiking: 'ハイキング',
    swimming: '水泳',
    yoga: 'ヨガ',
  };
  return labels[name] ?? 'ワークアウト';
};

function App() {
  const [data, setData] = useState<AppData>({ logs: {}, profile: DEFAULT_PROFILE });
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('today');
  const [modal, setModal] = useState<EntryModal>(null);
  const [foodName, setFoodName] = useState('');
  const [foodKcal, setFoodKcal] = useState('');
  const [foodMeal, setFoodMeal] = useState('昼食');
  const [weightValue, setWeightValue] = useState('');
  const [strengthName, setStrengthName] = useState('');
  const [strengthMinutes, setStrengthMinutes] = useState('30');
  const [strengthSets, setStrengthSets] = useState('3');
  const [strengthReps, setStrengthReps] = useState('10');
  const [strengthAlsoInHealth, setStrengthAlsoInHealth] = useState(false);
  const [healthSyncing, setHealthSyncing] = useState(false);

  const dayKey = todayKey();
  const profile = data.profile ?? DEFAULT_PROFILE;
  const today = data.logs[dayKey] ?? blankDay();
  const latestWeight = useMemo(() => {
    const dated = Object.entries(data.logs)
      .filter(([, log]) => typeof log.weight === 'number')
      .sort(([a], [b]) => b.localeCompare(a));
    return dated[0]?.[1].weight ?? profile.startWeight;
  }, [data.logs, profile.startWeight]);
  const intake = today.foods.reduce((sum, item) => sum + item.kcal, 0);
  const manualStrengthKcal = today.strength.reduce((sum, item) => sum + (item.alsoInHealth ? 0 : item.kcal), 0);
  const activeKcal = (today.healthActiveKcal ?? 0) + manualStrengthKcal;
  const bmr = bmrFor(latestWeight, profile);
  const totalBurn = bmr + activeKcal;
  const net = intake - totalBurn;

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!mounted) return;
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<AppData>;
          setData({
            logs: parsed.logs ?? {},
            profile: { ...DEFAULT_PROFILE, ...(parsed.profile ?? {}) },
          });
        } else {
          setData({ logs: {}, profile: DEFAULT_PROFILE });
        }
      })
      .catch(() => Alert.alert('読み込みエラー', '保存データを読み込めませんでした。'))
      .finally(() => mounted && setReady(true));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {
      Alert.alert('保存エラー', '端末への保存に失敗しました。空き容量をご確認ください。');
    });
  }, [data, ready]);

  const updateToday = (patch: Partial<DayLog>) => {
    setData((current) => {
      const existing = current.logs[dayKey] ?? blankDay();
      return { ...current, logs: { ...current.logs, [dayKey]: { ...existing, ...patch } } };
    });
  };

  const closeModal = () => {
    setModal(null);
    setFoodName(''); setFoodKcal(''); setWeightValue(''); setStrengthName('');
    setStrengthAlsoInHealth(false);
  };

  const saveFood = () => {
    const kcal = num(foodKcal, -1);
    if (!foodName.trim() || kcal < 0) {
      Alert.alert('入力を確認', '食品名とカロリーを入力してください。');
      return;
    }
    updateToday({ foods: [...today.foods, { id: newId(), name: foodName.trim(), kcal, meal: foodMeal }] });
    closeModal();
  };

  const saveWeight = () => {
    const weight = num(weightValue, -1);
    if (weight < 30 || weight > 300) {
      Alert.alert('入力を確認', '体重をkgで入力してください。');
      return;
    }
    updateToday({ weight });
    closeModal();
  };

  const saveStrength = () => {
    if (!strengthName.trim()) {
      Alert.alert('入力を確認', '種目名を入力してください。');
      return;
    }
    const minutes = Math.max(1, num(strengthMinutes, 30));
    // Rough 3.5 MET estimate; shown as an estimate, not a measured value.
    const kcal = Math.round(3.5 * 3.5 * latestWeight / 200 * minutes);
    const entry: StrengthEntry = {
      id: newId(), name: strengthName.trim(), minutes, kcal,
      sets: Math.max(1, num(strengthSets, 3)), reps: Math.max(1, num(strengthReps, 10)),
      alsoInHealth: strengthAlsoInHealth,
    };
    updateToday({ strength: [...today.strength, entry] });
    closeModal();
  };

  const syncAppleHealth = async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert('iPhoneで利用できます', 'Appleヘルスケアとの同期はiOS版で行えます。');
      return;
    }
    setHealthSyncing(true);
    try {
      if (!isHealthDataAvailable()) {
        Alert.alert('ヘルスケアを利用できません', 'この端末ではAppleヘルスケアを利用できません。');
        return;
      }
      await requestAuthorization({
        toRead: [
          'HKQuantityTypeIdentifierStepCount',
          'HKQuantityTypeIdentifierActiveEnergyBurned',
          'HKWorkoutTypeIdentifier',
        ],
      });
      const now = new Date();
      const anchorDate = new Date(now);
      anchorDate.setHours(0, 0, 0, 0);
      const startDate = new Date(anchorDate);
      startDate.setDate(startDate.getDate() - 6);
      const dateFilter = { date: { startDate, endDate: now } };
      const [stepBuckets, energyBuckets, workouts] = await Promise.all([
        queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], anchorDate, { day: 1 }, {
          filter: dateFilter,
          unit: 'count',
        }),
        queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierActiveEnergyBurned', ['cumulativeSum'], anchorDate, { day: 1 }, {
          filter: dateFilter,
          unit: 'kcal',
        }),
        queryWorkoutSamples({ limit: 0, filter: dateFilter }),
      ]);
      const stepsByDay = new Map<string, number>();
      for (const bucket of stepBuckets) {
        if (bucket.startDate) stepsByDay.set(dateKey(bucket.startDate), Math.round(bucket.sumQuantity?.quantity ?? 0));
      }
      const energyByDay = new Map<string, number>();
      for (const bucket of energyBuckets) {
        if (bucket.startDate) energyByDay.set(dateKey(bucket.startDate), Math.round(bucket.sumQuantity?.quantity ?? 0));
      }
      const workoutsByDay = new Map<string, HealthWorkoutEntry[]>();
      for (const workout of workouts) {
        const key = dateKey(workout.startDate);
        const items = workoutsByDay.get(key) ?? [];
        items.push({
          id: workout.uuid,
          activityName: workoutNameFor(workout.workoutActivityType),
          startDate: workout.startDate.toISOString(),
          endDate: workout.endDate.toISOString(),
          durationMinutes: Math.round(workout.duration.quantity / 60),
        });
        workoutsByDay.set(key, items);
      }
      const syncedDays = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(startDate);
        date.setDate(date.getDate() + index);
        return dateKey(date);
      });
      setData((current) => {
        const logs = { ...current.logs };
        for (const key of syncedDays) {
          logs[key] = {
            ...blankDay(),
            ...(logs[key] ?? {}),
            healthSteps: stepsByDay.get(key) ?? 0,
            healthActiveKcal: energyByDay.get(key) ?? 0,
            healthSyncedAt: now.toISOString(),
            healthWorkouts: workoutsByDay.get(key) ?? [],
          };
        }
        return { ...current, logs };
      });
      const todaySteps = stepsByDay.get(dayKey) ?? 0;
      if (stepBuckets.length === 0 && energyBuckets.length === 0 && workouts.length === 0) {
        Alert.alert('同期しましたがデータはありません', '対象期間の記録がないか、ヘルスケアの読み取りが許可されていない可能性があります。「設定」→「ヘルスケア」からMOTIVEのアクセスを確認してください。');
      } else {
        Alert.alert('過去7日分を同期しました', `今日の歩数 ${todaySteps.toLocaleString()}歩、ワークアウト ${workouts.length}件を取得しました。`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '同期に失敗しました。';
      Alert.alert('同期できませんでした', `${message}\n\niPhoneの「設定」→「ヘルスケア」からMOTIVEのアクセスを確認してください。`);
    } finally {
      setHealthSyncing(false);
    }
  };

  const removeFood = (id: string) => updateToday({ foods: today.foods.filter((item) => item.id !== id) });
  const removeStrength = (id: string) => updateToday({ strength: today.strength.filter((item) => item.id !== id) });

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
        <View style={styles.appHeader}>
          <View>
            <Text style={styles.brand}>MOTIVE</Text>
            <Text style={styles.brandSub}>変化の原動力を、記録する。</Text>
          </View>
          <View style={styles.avatar}><Text style={styles.avatarText}>ME</Text></View>
        </View>
        <View style={styles.content}>
          {tab === 'today' && <TodayScreen
            dayKey={dayKey} latestWeight={latestWeight} intake={intake} bmr={bmr} profile={profile}
            activeKcal={activeKcal} totalBurn={totalBurn} net={net} today={today}
            onAdd={(kind) => setModal(kind)} onTab={setTab} onSyncHealth={syncAppleHealth}
            healthSyncing={healthSyncing}
          />}
          {tab === 'record' && <RecordScreen
            dayKey={dayKey} today={today} intake={intake} onAdd={(kind) => setModal(kind)}
            onRemoveFood={removeFood} onRemoveStrength={removeStrength} onSyncHealth={syncAppleHealth}
            onWeight={() => { setWeightValue(String(today.weight ?? latestWeight)); setModal('weight'); }}
          />}
          {tab === 'trends' && <TrendsScreen data={data} latestWeight={latestWeight} profile={profile} />}
          {tab === 'settings' && <SettingsScreen latestWeight={latestWeight} profile={profile} onSave={(nextProfile) => setData((current) => ({ ...current, profile: nextProfile }))} />}
        </View>
        <View style={styles.tabBar}>
          <TabButton label="今日" icon="◉" active={tab === 'today'} onPress={() => setTab('today')} />
          <TabButton label="記録" icon="＋" active={tab === 'record'} onPress={() => setTab('record')} />
          <TabButton label="推移" icon="⌁" active={tab === 'trends'} onPress={() => setTab('trends')} />
          <TabButton label="設定" icon="⚙" active={tab === 'settings'} onPress={() => setTab('settings')} />
        </View>
        <EntryDialog
          modal={modal} onClose={closeModal} onSaveFood={saveFood} onSaveWeight={saveWeight}
          onSaveStrength={saveStrength} foodName={foodName} setFoodName={setFoodName}
          foodKcal={foodKcal} setFoodKcal={setFoodKcal} foodMeal={foodMeal} setFoodMeal={setFoodMeal}
          weightValue={weightValue} setWeightValue={setWeightValue} strengthName={strengthName}
          setStrengthName={setStrengthName} strengthMinutes={strengthMinutes}
          setStrengthMinutes={setStrengthMinutes} strengthSets={strengthSets} setStrengthSets={setStrengthSets}
          strengthReps={strengthReps} setStrengthReps={setStrengthReps} latestWeight={latestWeight}
          strengthAlsoInHealth={strengthAlsoInHealth} setStrengthAlsoInHealth={setStrengthAlsoInHealth}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function TodayScreen(props: {
  dayKey: string; latestWeight: number; intake: number; bmr: number; activeKcal: number; profile: Profile;
  totalBurn: number; net: number; today: DayLog; onAdd: (kind: EntryModal) => void; onTab: (tab: Tab) => void;
  onSyncHealth: () => void; healthSyncing: boolean;
}) {
  const goalDate = new Date(`${props.profile.targetDate}T00:00:00`);
  const daysLeft = Math.max(0, Math.ceil((goalDate.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000));
  const kgLeft = Math.max(0, props.latestWeight - props.profile.targetWeight);
  const weightRange = props.profile.startWeight - props.profile.targetWeight;
  const progress = weightRange > 0 ? Math.max(0, Math.min(1, (props.profile.startWeight - props.latestWeight) / weightRange)) : 0;
  const calorieProgress = Math.max(0, Math.min(1, props.intake / props.profile.dailyKcalTarget));
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.dateRow}>
        <View><Text style={styles.eyebrow}>TODAY</Text><Text style={styles.dateText}>{formatDate(props.dayKey)}</Text></View>
        <View style={styles.goalPill}><Text style={styles.goalPillText}>目標まで {daysLeft}日</Text></View>
      </View>
      <View style={styles.heroCard}>
        <View style={styles.heroTop}><View><Text style={styles.cardLabel}>現在の体重</Text><Text style={styles.bigWeight}>{props.latestWeight.toFixed(1)}<Text style={styles.unit}> kg</Text></Text></View><View style={styles.targetBadge}><Text style={styles.targetCaption}>GOAL</Text><Text style={styles.targetNumber}>{props.profile.targetWeight} kg</Text><Text style={styles.targetDate}>{goalDate.getMonth() + 1}月{goalDate.getDate()}日</Text></View></View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
        <View style={styles.progressLabels}><Text style={styles.muted}>スタート {props.profile.startWeight} kg</Text><Text style={styles.muted}>あと {kgLeft.toFixed(1)} kg</Text></View>
      </View>
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>今日のエネルギー</Text><Text style={styles.sectionHint}>推定値</Text></View>
      <View style={styles.energyCard}>
        <View style={styles.energyHead}><Text style={styles.energyNum}>{props.intake.toLocaleString()}</Text><Text style={styles.energyUnit}> / {props.profile.dailyKcalTarget.toLocaleString()} kcal</Text><Text style={styles.energyRemaining}>残り {Math.max(0, props.profile.dailyKcalTarget - props.intake).toLocaleString()}</Text></View>
        <View style={styles.calorieTrack}><View style={[styles.calorieFill, { width: `${calorieProgress * 100}%` }]} /></View>
        <View style={styles.energyBreakdown}>
          <Metric label="摂取" value={`${props.intake.toLocaleString()} kcal`} color={COLORS.orange} />
          <Metric label="消費" value={`${props.totalBurn.toLocaleString()} kcal`} color={COLORS.mint} />
          <Metric label="差し引き" value={`${props.net >= 0 ? '+' : ''}${props.net.toLocaleString()} kcal`} color={props.net <= 0 ? COLORS.mint : COLORS.yellow} />
        </View>
        <Text style={styles.formulaNote}>基礎代謝 {props.bmr.toLocaleString()} + 活動 {props.activeKcal.toLocaleString()} kcal</Text>
      </View>
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>今日の記録</Text><Pressable onPress={() => props.onTab('record')}><Text style={styles.linkText}>一覧を見る ›</Text></Pressable></View>
      <View style={styles.quickActions}>
        <QuickAction icon="＋" label="食事" color={COLORS.orange} onPress={() => props.onAdd('food')} />
        <QuickAction icon="⚖" label="体重" color={COLORS.blue} onPress={() => props.onAdd('weight')} />
        <QuickAction icon="↗" label="筋トレ" color={COLORS.mint} onPress={() => props.onAdd('strength')} />
      </View>
      <Pressable style={styles.sourceCard} onPress={props.onSyncHealth} disabled={props.healthSyncing}>
        <View style={styles.sourceIcon}><Text style={styles.sourceIconText}>♥</Text></View>
        <View style={styles.sourceCopy}><Text style={styles.sourceTitle}>Appleヘルスケア</Text><Text style={styles.sourceDesc}>歩数 {props.today.healthSteps?.toLocaleString() ?? '—'}歩 ・ 活動 {props.today.healthActiveKcal?.toLocaleString() ?? '—'} kcal</Text></View>
        <View style={[styles.statusDot, props.today.healthSyncedAt && { backgroundColor: COLORS.mint }]} /><Text style={styles.statusText}>{props.healthSyncing ? '同期中' : props.today.healthSyncedAt ? '同期' : '接続'}</Text>
      </Pressable>
      <Text style={styles.footnote}>消費カロリーと運動の数値は目安です。実際の記録は「記録」画面で追加できます。</Text>
    </ScrollView>
  );
}

function RecordScreen(props: {
  dayKey: string; today: DayLog; intake: number; onAdd: (kind: EntryModal) => void;
  onRemoveFood: (id: string) => void; onRemoveStrength: (id: string) => void; onWeight: () => void; onSyncHealth: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>記録</Text><Text style={styles.pageSub}>{formatDate(props.dayKey)}</Text>
      <View style={styles.summaryStrip}><SummaryItem label="摂取" value={`${props.intake.toLocaleString()} kcal`} /><SummaryItem label="体重" value={props.today.weight ? `${props.today.weight.toFixed(1)} kg` : '未入力'} /><SummaryItem label="筋トレ" value={`${props.today.strength.length}件`} /></View>
      <View style={styles.recordHeading}><Text style={styles.sectionTitle}>体重</Text><Pressable style={styles.smallAdd} onPress={props.onWeight}><Text style={styles.smallAddText}>＋ 入力</Text></Pressable></View>
      <View style={styles.recordCard}><Text style={styles.recordValue}>{props.today.weight ? `${props.today.weight.toFixed(1)} kg` : 'まだ記録がありません'}</Text><Text style={styles.recordMeta}>朝起きてトイレの後の測定がおすすめ</Text></View>
      <View style={styles.recordHeading}><Text style={styles.sectionTitle}>食事・間食</Text><Pressable style={styles.smallAdd} onPress={() => props.onAdd('food')}><Text style={styles.smallAddText}>＋ 追加</Text></Pressable></View>
      {props.today.foods.length === 0 ? <EmptyRow text="食事の記録はまだありません" /> : props.today.foods.map((food) => <View key={food.id} style={styles.listCard}><View style={styles.listIcon}><Text>●</Text></View><View style={styles.listMain}><Text style={styles.listTitle}>{food.name}</Text><Text style={styles.listMeta}>{food.meal}</Text></View><Text style={styles.listKcal}>{food.kcal} kcal</Text><Pressable onPress={() => props.onRemoveFood(food.id)} hitSlop={10}><Text style={styles.remove}>×</Text></Pressable></View>)}
      <View style={styles.recordHeading}><Text style={styles.sectionTitle}>筋トレ（手入力）</Text><Pressable style={styles.smallAdd} onPress={() => props.onAdd('strength')}><Text style={styles.smallAddText}>＋ 追加</Text></Pressable></View>
      {props.today.strength.length === 0 ? <EmptyRow text="ヘルスケアの運動とは別に記録します" /> : props.today.strength.map((workout) => <View key={workout.id} style={styles.listCard}><View style={[styles.listIcon, { backgroundColor: '#10352F' }]}><Text style={{ color: COLORS.mint }}>↗</Text></View><View style={styles.listMain}><Text style={styles.listTitle}>{workout.name}</Text><Text style={styles.listMeta}>{workout.sets}セット × {workout.reps}回 ・ {workout.minutes}分{workout.alsoInHealth ? ' ・ 重複除外' : ''}</Text></View><Text style={[styles.listKcal, { color: COLORS.mint }]}>~{workout.kcal} kcal</Text><Pressable onPress={() => props.onRemoveStrength(workout.id)} hitSlop={10}><Text style={styles.remove}>×</Text></Pressable></View>)}
      <Text style={styles.footnote}>筋トレの消費カロリーは時間からの概算です。Appleヘルスケアにも同じ運動がある場合は、登録時に重複計上を避けられます。</Text>
      <View style={styles.recordHeading}><Text style={styles.sectionTitle}>Appleヘルスケアの運動</Text><Pressable style={styles.smallAdd} onPress={props.onSyncHealth}><Text style={styles.smallAddText}>同期</Text></Pressable></View>
      {props.today.healthWorkouts.length === 0 ? <EmptyRow text="ヘルスケアから取得した運動はありません" /> : props.today.healthWorkouts.map((workout) => (
        <View key={workout.id} style={styles.listCard}>
          <View style={[styles.listIcon, { backgroundColor: '#38233A' }]}><Text style={{ color: '#D59AFB' }}>♥</Text></View>
          <View style={styles.listMain}><Text style={styles.listTitle}>{workout.activityName}</Text><Text style={styles.listMeta}>{new Date(workout.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ・ {workout.durationMinutes}分</Text></View>
        </View>
      ))}
    </ScrollView>
  );
}

function TrendsScreen({ data, latestWeight, profile }: { data: AppData; latestWeight: number; profile: Profile }) {
  const days: { key: string; weight?: number; intake: number; burn: number; steps?: number }[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(); date.setDate(date.getDate() - offset);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const log = data.logs[key];
    days.push({ key, weight: log?.weight, intake: log?.foods.reduce((s, f) => s + f.kcal, 0) ?? 0,
      burn: (log ? bmrFor(log.weight ?? latestWeight, profile) + (log.healthActiveKcal ?? 0) + log.strength.filter((e) => !e.alsoInHealth).reduce((s, e) => s + e.kcal, 0) : 0),
      steps: log?.healthSteps });
  }
  const weights = Object.entries(data.logs).filter(([, log]) => typeof log.weight === 'number').sort(([a], [b]) => a.localeCompare(b)).slice(-7);
  const lastSeven = weights.map(([, log]) => log.weight as number);
  const average = lastSeven.length ? lastSeven.reduce((a, b) => a + b, 0) / lastSeven.length : latestWeight;
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>推移</Text><Text style={styles.pageSub}>続けた記録を、変化として見る</Text>
      <View style={styles.trendHighlight}><View><Text style={styles.cardLabel}>直近7回の体重平均</Text><Text style={styles.trendBig}>{average.toFixed(1)}<Text style={styles.unit}> kg</Text></Text></View><View style={styles.trendGoal}><Text style={styles.goalCaption}>目標</Text><Text style={styles.goalValue}>{profile.targetWeight} kg</Text></View></View>
      <ChartCard title="体重" subtitle="直近7日・記録した日のみ" data={days.map((d) => ({ label: d.key.slice(5).replace('-', '/'), value: d.weight }))} color={COLORS.orange} suffix="kg" />
      <ChartCard title="摂取カロリー" subtitle={`1日目標 ${profile.dailyKcalTarget.toLocaleString()} kcal`} data={days.map((d) => ({ label: d.key.slice(5).replace('-', '/'), value: d.intake || undefined }))} color={COLORS.blue} suffix="kcal" max={profile.dailyKcalTarget * 1.1} />
      <ChartCard title="推定消費カロリー" subtitle="基礎代謝 + 記録された活動" data={days.map((d) => ({ label: d.key.slice(5).replace('-', '/'), value: d.burn || undefined }))} color={COLORS.mint} suffix="kcal" />
      <ChartCard title="歩数" subtitle="Appleヘルスケアから取得" data={days.map((d) => ({ label: d.key.slice(5).replace('-', '/'), value: d.steps }))} color={COLORS.yellow} suffix="歩" />
    </ScrollView>
  );
}

function SettingsScreen({ latestWeight, profile, onSave }: { latestWeight: number; profile: Profile; onSave: (profile: Profile) => void }) {
  const [fields, setFields] = useState({
    heightCm: String(profile.heightCm),
    ageYears: String(profile.ageYears),
    startWeight: String(profile.startWeight),
    targetWeight: String(profile.targetWeight),
    dailyKcalTarget: String(profile.dailyKcalTarget),
    targetDate: profile.targetDate,
  });
  useEffect(() => {
    setFields({
      heightCm: String(profile.heightCm), ageYears: String(profile.ageYears),
      startWeight: String(profile.startWeight), targetWeight: String(profile.targetWeight),
      dailyKcalTarget: String(profile.dailyKcalTarget), targetDate: profile.targetDate,
    });
  }, [profile]);
  const save = () => {
    const next: Profile = {
      heightCm: Number(fields.heightCm), ageYears: Number(fields.ageYears),
      startWeight: Number(fields.startWeight), targetWeight: Number(fields.targetWeight),
      dailyKcalTarget: Number(fields.dailyKcalTarget), targetDate: fields.targetDate,
    };
    const [year, month, day] = fields.targetDate.split('-').map(Number);
    const parsedDate = new Date(year, month - 1, day);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(fields.targetDate)
      && parsedDate.getFullYear() === year
      && parsedDate.getMonth() === month - 1
      && parsedDate.getDate() === day;
    if (Object.values(next).some((value) => typeof value === 'number' && (!Number.isFinite(value) || value <= 0)) || !validDate || next.targetWeight >= next.startWeight) {
      Alert.alert('入力を確認', '数値を正しく入力してください。目標日はYYYY-MM-DD形式、目標体重は開始体重より小さくしてください。');
      return;
    }
    onSave(next);
    Alert.alert('保存しました', 'プロフィールと目標を端末に保存しました。');
  };
  const field = (label: string, key: keyof typeof fields, keyboardType: 'decimal-pad' | 'number-pad' | 'default' = 'decimal-pad', hint?: string) => (
    <View style={styles.profileField}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput value={fields[key]} onChangeText={(value) => setFields((current) => ({ ...current, [key]: value }))} keyboardType={keyboardType} style={styles.input} placeholderTextColor={COLORS.muted} />
      {hint ? <Text style={styles.profileHint}>{hint}</Text> : null}
    </View>
  );
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>設定</Text><Text style={styles.pageSub}>あなたの目標とアプリの管理</Text>
      <View style={styles.settingsCard}>
        <Text style={styles.infoTitle}>プロフィールと目標</Text>
        {field('身長（cm）', 'heightCm')}
        {field('年齢', 'ageYears', 'number-pad')}
        {field('開始体重（kg）', 'startWeight')}
        <SettingRow label="最新の体重記録" value={`${latestWeight.toFixed(1)} kg`} />
        {field('目標体重（kg）', 'targetWeight')}
        {field('目標日（YYYY-MM-DD）', 'targetDate', 'default', '例：2027-04-05')}
        {field('1日の摂取目安（kcal）', 'dailyKcalTarget', 'number-pad')}
        <PrimaryButton label="設定を保存" onPress={save} />
      </View>
      <View style={styles.infoCard}><Text style={styles.infoTitle}>保存と連携</Text><Text style={styles.infoText}>記録とプロフィールはこの端末に保存します。今日の画面からAppleヘルスケアの歩数・活動エネルギー・ワークアウトを読み取りできます。読み取りにはiPhone用の開発ビルドとアクセス許可が必要です。</Text></View>
      <View style={styles.infoCard}><Text style={styles.infoTitle}>プライバシー</Text><Text style={styles.infoText}>この試作版はアカウント作成や外部サーバーへの送信を行いません。</Text></View>
    </ScrollView>
  );
}

function ChartCard({ title, subtitle, data, color, suffix, max }: { title: string; subtitle: string; data: { label: string; value?: number }[]; color: string; suffix: string; max?: number }) {
  const values = data.map((d) => d.value).filter((v): v is number => typeof v === 'number');
  const top = max ?? (values.length ? Math.max(...values) * 1.12 : 1);
  return (
    <View style={styles.chartCard}>
      <View style={styles.chartTitleRow}><View><Text style={styles.chartTitle}>{title}</Text><Text style={styles.chartSubtitle}>{subtitle}</Text></View><Text style={[styles.chartLatest, { color }]}>{values.length ? `${values[values.length - 1].toLocaleString()} ${suffix}` : '記録待ち'}</Text></View>
      <View style={styles.chartBars}>{data.map((item, index) => {
        const height = item.value ? Math.max(8, item.value / top * 92) : 4;
        return <View key={`${item.label}-${index}`} style={styles.chartColumn}><View style={[styles.chartBar, { height, backgroundColor: item.value ? color : COLORS.line, opacity: item.value ? 0.9 : 0.55 }]} /><Text style={styles.chartLabel}>{item.label}</Text></View>;
      })}</View>
    </View>
  );
}

function EntryDialog(props: {
  modal: EntryModal; onClose: () => void; onSaveFood: () => void; onSaveWeight: () => void; onSaveStrength: () => void;
  foodName: string; setFoodName: (value: string) => void; foodKcal: string; setFoodKcal: (value: string) => void;
  foodMeal: string; setFoodMeal: (value: string) => void; weightValue: string; setWeightValue: (value: string) => void;
  strengthName: string; setStrengthName: (value: string) => void; strengthMinutes: string; setStrengthMinutes: (value: string) => void;
  strengthSets: string; setStrengthSets: (value: string) => void; strengthReps: string; setStrengthReps: (value: string) => void;
  strengthAlsoInHealth: boolean; setStrengthAlsoInHealth: (value: boolean) => void;
  latestWeight: number;
}) {
  const visible = Boolean(props.modal);
  const title = props.modal === 'food' ? '食事を追加' : props.modal === 'weight' ? '体重を記録' : '筋トレを記録';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.modalDismiss} onPress={props.onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} /><View style={styles.modalTitleRow}><Text style={styles.modalTitle}>{title}</Text><Pressable onPress={props.onClose}><Text style={styles.closeButton}>×</Text></Pressable></View>
          {props.modal === 'food' && <>
            <Text style={styles.inputLabel}>食事区分</Text><View style={styles.chips}>{['朝食', '昼食', '夕食', '間食'].map((item) => <Pressable key={item} onPress={() => props.setFoodMeal(item)} style={[styles.chip, props.foodMeal === item && styles.chipActive]}><Text style={[styles.chipText, props.foodMeal === item && styles.chipTextActive]}>{item}</Text></Pressable>)}</View>
            <Text style={styles.inputLabel}>食品名</Text><TextInput value={props.foodName} onChangeText={props.setFoodName} placeholder="例：鶏むね肉、ご飯" placeholderTextColor={COLORS.muted} style={styles.input} />
            <Text style={styles.inputLabel}>カロリー（kcal）</Text><TextInput value={props.foodKcal} onChangeText={props.setFoodKcal} placeholder="例：320" placeholderTextColor={COLORS.muted} keyboardType="decimal-pad" style={styles.input} />
            <Text style={styles.modalHint}>食品検索・写真推定は次の実装段階で追加します。</Text>
            <PrimaryButton label="食事を保存" onPress={props.onSaveFood} />
          </>}
          {props.modal === 'weight' && <>
            <Text style={styles.inputLabel}>体重（kg）</Text><TextInput value={props.weightValue} onChangeText={props.setWeightValue} placeholder={`${props.latestWeight.toFixed(1)}`} placeholderTextColor={COLORS.muted} keyboardType="decimal-pad" style={[styles.input, styles.weightInput]} autoFocus />
            <Text style={styles.modalHint}>できるだけ毎朝、同じ条件で測りましょう。</Text><PrimaryButton label="体重を保存" onPress={props.onSaveWeight} />
          </>}
          {props.modal === 'strength' && <>
            <Text style={styles.inputLabel}>種目名</Text><TextInput value={props.strengthName} onChangeText={props.setStrengthName} placeholder="例：ベンチプレス" placeholderTextColor={COLORS.muted} style={styles.input} />
            <View style={styles.inputRow}><View style={styles.inputHalf}><Text style={styles.inputLabel}>セット</Text><TextInput value={props.strengthSets} onChangeText={props.setStrengthSets} keyboardType="number-pad" style={styles.input} /></View><View style={styles.inputHalf}><Text style={styles.inputLabel}>1セットの回数</Text><TextInput value={props.strengthReps} onChangeText={props.setStrengthReps} keyboardType="number-pad" style={styles.input} /></View></View>
            <Text style={styles.inputLabel}>運動時間（分）</Text><TextInput value={props.strengthMinutes} onChangeText={props.setStrengthMinutes} keyboardType="number-pad" style={styles.input} />
            <Pressable style={styles.duplicateRow} onPress={() => props.setStrengthAlsoInHealth(!props.strengthAlsoInHealth)}>
              <View style={[styles.checkbox, props.strengthAlsoInHealth && styles.checkboxActive]}>{props.strengthAlsoInHealth ? <Text style={styles.checkboxMark}>✓</Text> : null}</View>
              <Text style={styles.duplicateText}>同じ運動をAppleヘルスケアにも記録した</Text>
            </Pressable>
            <Text style={styles.modalHint}>消費カロリーは体重と時間からの大まかな推定です。</Text><PrimaryButton label="筋トレを保存" onPress={props.onSaveStrength} />
          </>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TabButton({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) {
  return <Pressable style={styles.tabButton} onPress={onPress}><Text style={[styles.tabIcon, active && styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text></Pressable>;
}
function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, { color }]}>{value}</Text></View>;
}
function QuickAction({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return <Pressable style={styles.quickAction} onPress={onPress}><View style={[styles.quickIcon, { borderColor: `${color}55`, backgroundColor: `${color}18` }]}><Text style={[styles.quickIconText, { color }]}>{icon}</Text></View><Text style={styles.quickLabel}>{label}</Text></Pressable>;
}
function SummaryItem({ label, value }: { label: string; value: string }) { return <View><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>; }
function EmptyRow({ text }: { text: string }) { return <View style={styles.emptyRow}><Text style={styles.emptyText}>{text}</Text></View>; }
function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{label}</Text></Pressable>; }
function SettingRow({ label, value, last }: { label: string; value: string; last?: boolean }) { return <View style={[styles.settingRow, !last && styles.settingBorder]}><Text style={styles.settingLabel}>{label}</Text><Text style={styles.settingValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  appHeader: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: COLORS.text, fontSize: 20, fontWeight: '900', letterSpacing: 2.5 },
  brandSub: { color: COLORS.muted, fontSize: 10, marginTop: 3, letterSpacing: 0.4 },
  avatar: { width: 38, height: 38, borderRadius: 13, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line },
  avatarText: { color: COLORS.orange, fontWeight: '800', fontSize: 12 },
  content: { flex: 1 }, scrollContent: { paddingHorizontal: 18, paddingBottom: 26 },
  safeArea: { flex: 1 },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, marginBottom: 14 },
  eyebrow: { color: COLORS.orange, fontSize: 9, fontWeight: '800', letterSpacing: 1.7 }, dateText: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginTop: 3 },
  goalPill: { backgroundColor: '#38271F', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20 }, goalPillText: { color: COLORS.orange, fontSize: 11, fontWeight: '700' },
  heroCard: { backgroundColor: COLORS.surface, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: '#203149' }, heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '600' }, bigWeight: { color: COLORS.text, fontSize: 38, fontWeight: '800', marginTop: 6, letterSpacing: -1.1 }, unit: { color: COLORS.muted, fontSize: 16, fontWeight: '600' },
  targetBadge: { minWidth: 78, alignItems: 'center', borderLeftWidth: 1, borderLeftColor: COLORS.line }, targetCaption: { color: COLORS.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.4 }, targetNumber: { color: COLORS.orange, fontSize: 18, fontWeight: '800', marginTop: 3 }, targetDate: { color: COLORS.muted, fontSize: 10, marginTop: 2 },
  progressTrack: { height: 8, borderRadius: 8, backgroundColor: COLORS.surface2, marginTop: 18, overflow: 'hidden' }, progressFill: { height: 8, borderRadius: 8, backgroundColor: COLORS.orange }, progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }, muted: { color: COLORS.muted, fontSize: 10 },
  sectionHeader: { marginTop: 21, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800' }, sectionHint: { color: COLORS.muted, fontSize: 10 },
  energyCard: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#203149' }, energyHead: { flexDirection: 'row', alignItems: 'baseline' }, energyNum: { color: COLORS.text, fontSize: 28, fontWeight: '800' }, energyUnit: { color: COLORS.muted, fontSize: 12 }, energyRemaining: { marginLeft: 'auto', color: COLORS.orange, fontSize: 11, fontWeight: '700' },
  calorieTrack: { height: 7, borderRadius: 8, backgroundColor: COLORS.surface2, marginTop: 10, overflow: 'hidden' }, calorieFill: { height: 7, backgroundColor: COLORS.orange, borderRadius: 8 }, energyBreakdown: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }, metric: { minWidth: 88 }, metricLabel: { color: COLORS.muted, fontSize: 10 }, metricValue: { fontSize: 12, fontWeight: '800', marginTop: 4 }, formulaNote: { color: COLORS.muted, fontSize: 10, marginTop: 13, borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 10 },
  linkText: { color: COLORS.orange, fontSize: 11, fontWeight: '700' }, quickActions: { flexDirection: 'row', gap: 12 }, quickAction: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: '#203149', borderRadius: 17, paddingVertical: 14, alignItems: 'center' }, quickIcon: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, quickIconText: { fontSize: 18, fontWeight: '600' }, quickLabel: { color: COLORS.text, fontSize: 11, fontWeight: '700', marginTop: 7 },
  sourceCard: { marginTop: 15, padding: 12, borderRadius: 16, backgroundColor: COLORS.surface, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#203149' }, sourceIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: '#3A2029', alignItems: 'center', justifyContent: 'center' }, sourceIconText: { color: COLORS.red, fontSize: 15 }, sourceCopy: { marginLeft: 10, flex: 1 }, sourceTitle: { color: COLORS.text, fontSize: 11, fontWeight: '700' }, sourceDesc: { color: COLORS.muted, fontSize: 9, marginTop: 3 }, statusDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: COLORS.yellow }, statusText: { color: COLORS.muted, fontSize: 9, marginLeft: 5 }, footnote: { color: '#71839A', fontSize: 9, lineHeight: 14, marginTop: 12, marginBottom: 4 },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#1D2D42', backgroundColor: COLORS.bg, paddingTop: 9, paddingBottom: Platform.OS === 'ios' ? 2 : 8 }, tabButton: { flex: 1, alignItems: 'center', gap: 3 }, tabIcon: { color: COLORS.muted, fontSize: 19 }, tabLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '600' }, tabActive: { color: COLORS.orange, fontWeight: '800' },
  pageTitle: { color: COLORS.text, fontSize: 27, fontWeight: '800', marginTop: 8 }, pageSub: { color: COLORS.muted, fontSize: 11, marginTop: 5, marginBottom: 18 }, summaryStrip: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, backgroundColor: COLORS.surface, borderRadius: 17, borderWidth: 1, borderColor: '#203149', marginBottom: 20 }, summaryLabel: { color: COLORS.muted, fontSize: 10 }, summaryValue: { color: COLORS.text, fontWeight: '800', fontSize: 13, marginTop: 6 },
  recordHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15, marginBottom: 9 }, smallAdd: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: '#39261F' }, smallAddText: { color: COLORS.orange, fontSize: 10, fontWeight: '800' }, recordCard: { backgroundColor: COLORS.surface, borderRadius: 15, borderWidth: 1, borderColor: '#203149', padding: 14 }, recordValue: { color: COLORS.text, fontSize: 19, fontWeight: '800' }, recordMeta: { color: COLORS.muted, fontSize: 10, marginTop: 5 }, listCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 11, marginBottom: 7, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#1C2C40' }, listIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#38271F' }, listMain: { flex: 1, marginLeft: 9 }, listTitle: { color: COLORS.text, fontSize: 11, fontWeight: '700' }, listMeta: { color: COLORS.muted, fontSize: 9, marginTop: 3 }, listKcal: { color: COLORS.orange, fontSize: 10, fontWeight: '800', marginHorizontal: 6 }, remove: { color: COLORS.muted, fontSize: 18, paddingHorizontal: 2 }, emptyRow: { backgroundColor: '#0D1928', borderRadius: 13, padding: 14, borderWidth: 1, borderColor: '#1A2A3E', borderStyle: 'dashed' }, emptyText: { color: COLORS.muted, fontSize: 10, textAlign: 'center' },
  trendHighlight: { backgroundColor: COLORS.surface, borderRadius: 18, padding: 17, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#203149', marginBottom: 14 }, trendBig: { color: COLORS.text, fontSize: 31, fontWeight: '800', marginTop: 5 }, trendGoal: { alignItems: 'flex-end' }, goalCaption: { color: COLORS.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 }, goalValue: { color: COLORS.orange, fontWeight: '800', fontSize: 17, marginTop: 4 }, chartCard: { backgroundColor: COLORS.surface, borderRadius: 18, padding: 15, marginBottom: 12, borderWidth: 1, borderColor: '#203149' }, chartTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, chartTitle: { color: COLORS.text, fontSize: 13, fontWeight: '800' }, chartSubtitle: { color: COLORS.muted, fontSize: 9, marginTop: 4 }, chartLatest: { fontSize: 12, fontWeight: '800' }, chartBars: { height: 128, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', paddingTop: 20, marginTop: 6, borderBottomWidth: 1, borderBottomColor: COLORS.line }, chartColumn: { alignItems: 'center', justifyContent: 'flex-end', height: 120, flex: 1 }, chartBar: { width: 13, minHeight: 4, borderRadius: 5 }, chartLabel: { color: COLORS.muted, fontSize: 8, marginTop: 6, height: 13 },
  settingsCard: { backgroundColor: COLORS.surface, borderRadius: 17, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1, borderColor: '#203149' }, profileField: { marginBottom: 4 }, profileHint: { color: COLORS.muted, fontSize: 9, marginTop: 4 }, settingRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13 }, settingBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.line }, settingLabel: { color: COLORS.muted, fontSize: 11 }, settingValue: { color: COLORS.text, fontSize: 11, fontWeight: '700' }, infoCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 14, marginTop: 13, borderWidth: 1, borderColor: '#203149' }, infoTitle: { color: COLORS.text, fontSize: 12, fontWeight: '800' }, infoText: { color: COLORS.muted, fontSize: 10, lineHeight: 16, marginTop: 7 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0009' }, modalDismiss: { flex: 1 }, modalSheet: { backgroundColor: '#0D1928', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30, borderTopWidth: 1, borderColor: COLORS.line }, modalHandle: { width: 38, height: 4, borderRadius: 5, alignSelf: 'center', backgroundColor: '#52647A', marginBottom: 14 }, modalTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }, modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' }, closeButton: { color: COLORS.muted, fontSize: 24, paddingHorizontal: 4 }, inputLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700', marginBottom: 6, marginTop: 9 }, input: { borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.surface, color: COLORS.text, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, fontSize: 13 }, weightInput: { fontSize: 24, fontWeight: '800', paddingVertical: 15 }, inputRow: { flexDirection: 'row', gap: 10 }, inputHalf: { flex: 1 }, chips: { flexDirection: 'row', gap: 7, marginBottom: 3 }, chip: { paddingHorizontal: 11, paddingVertical: 7, backgroundColor: COLORS.surface, borderRadius: 15, borderWidth: 1, borderColor: COLORS.line }, chipActive: { backgroundColor: '#39261F', borderColor: COLORS.orange }, chipText: { color: COLORS.muted, fontSize: 10 }, chipTextActive: { color: COLORS.orange, fontWeight: '800' }, modalHint: { color: COLORS.muted, fontSize: 9, marginTop: 10, lineHeight: 14 }, primaryButton: { marginTop: 17, backgroundColor: COLORS.orange, paddingVertical: 14, borderRadius: 14, alignItems: 'center' }, primaryButtonText: { color: '#1B1512', fontSize: 12, fontWeight: '900' },
  duplicateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingVertical: 7 }, checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1, borderColor: COLORS.muted, alignItems: 'center', justifyContent: 'center', marginRight: 9 }, checkboxActive: { backgroundColor: COLORS.mint, borderColor: COLORS.mint }, checkboxMark: { color: COLORS.bg, fontSize: 13, fontWeight: '900' }, duplicateText: { color: COLORS.text, fontSize: 10, flex: 1 },
});

export default App;
