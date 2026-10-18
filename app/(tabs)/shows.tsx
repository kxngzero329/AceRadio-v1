import { fonts } from "@/theme/fonts";
import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Search } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageScrollView } from "@/components/PageScrollView";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ShowGrid } from "@/components/ShowGrid";
import { useContent } from "@/context/ContentContext";
import { ContentStatus } from "@/components/ContentStatus";
import { useRadio } from "@/context/RadioContext";
import { colors } from "@/theme/colors";
import { layout } from "@/theme/layout";
import { typography } from "@/theme/typography";
import { PageHeading } from "@/components/PageHeading";
import { usePageContentStyle } from "@/hooks/usePageContentStyle";

type ShowFilter = "all" | "live" | "weekdays" | "weekend";
const filters: { id: ShowFilter; label: string }[] = [
  { id: "all", label: "All shows" },
  { id: "live", label: "Live now" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekend", label: "Weekend" },
];

export default function ShowsScreen() {
  const contentStyle = usePageContentStyle();
  const { width, fontScale } = useWindowDimensions();
  const { shows, loading } = useContent();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ShowFilter>("all");
  const { liveShows } = useRadio();
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const liveIds = new Set(liveShows.map((show) => show.id));
    return shows.filter((show) => {
      const matchesSearch = `${show.title} ${show.presenter} ${show.day}`
        .toLowerCase()
        .includes(query);
      const weekend = show.schedules
        ? show.schedules.some((slot) => slot.day === 0 || slot.day === 6)
        : /Saturday|Sunday|Weekend/i.test(show.day);
      const weekday = show.schedules
        ? show.schedules.some((slot) => slot.day >= 1 && slot.day <= 5)
        : !weekend;
      const matchesFilter =
        filter === "all" ||
        (filter === "live" && liveIds.has(show.id)) ||
        (filter === "weekdays" && weekday) ||
        (filter === "weekend" && weekend);
      return matchesSearch && matchesFilter;
    });
  }, [search, filter, liveShows, shows]);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader />
      <PageScrollView
        testID="shows-scroll"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={false}
      >
        <PageHeading
          eyebrow="THE LINEUP"
          title={
            <>
              All shows<Text style={{ color: colors.accent }}>.</Text>
            </>
          }
          subtitle="Discover the voices behind the music."
        />
        <View style={styles.search}>
          <Search size={18} color={colors.muted} />
          <TextInput
            testID="shows-search"
            accessibilityLabel="Search shows or presenters"
            placeholder="Search shows or presenters"
            placeholderTextColor={colors.subtle}
            selectionColor={colors.selection}
            cursorColor={colors.accent}
            value={search}
            onChangeText={setSearch}
            style={styles.input}
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        <View style={styles.filters}>
          {filters.map((option) => (
            <Pressable
              key={option.id}
              testID={`shows-filter-${option.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Filter ${option.label.toLowerCase()}`}
              accessibilityState={{ selected: filter === option.id }}
              {...(Platform.OS === "web"
                ? { "aria-pressed": filter === option.id }
                : {})}
              onPress={() => setFilter(option.id)}
              style={({ pressed }) => [
                styles.filter,
                { flexBasis: width < 390 || fontScale > 1.2 ? "40%" : "20%" },
                filter === option.id && styles.filterSelected,
                pressed && styles.pressed,
              ]}
            >
              {option.id === "live" && (
                <View
                  style={[
                    styles.liveDot,
                    filter === option.id && styles.liveDotSelected,
                  ]}
                />
              )}
              <Text
                style={[
                  styles.filterText,
                  filter === option.id && styles.filterTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.summary}>
          <Text style={styles.listTitle}>Explore the lineup</Text>
          <Text testID="shows-result-count" style={styles.count}>
            {filtered.length} {filtered.length === 1 ? "SHOW" : "SHOWS"}
          </Text>
        </View>
        <ShowGrid shows={filtered} loading={loading && !shows.length} />
        <ContentStatus
          showLoading={false}
          emptyMessage="No shows have been published yet."
        />
        {!filtered.length && shows.length > 0 && (
          <View testID="shows-empty" style={styles.empty}>
            <Text style={styles.emptyTitle}>No shows found</Text>
            <Text style={styles.emptyText}>
              Try a different search or filter to find your show.
            </Text>
            <Pressable
              testID="shows-clear-filters"
              accessibilityRole="button"
              onPress={() => {
                setSearch("");
                setFilter("all");
              }}
              style={({ pressed }) => [
                styles.clearButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.clearText}>Clear search & filters</Text>
            </Pressable>
          </View>
        )}
        <Text style={styles.note}>
          Show times are South African Standard Time (SAST).
        </Text>
      </PageScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  search: {
    minHeight: 52,
    borderRadius: layout.controlRadius,
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  input: { flex: 1, minHeight: 52, color: colors.white, fontSize: 14, outlineColor: colors.accent, fontFamily: fonts.regular },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  filter: {
    flexGrow: 1,
    minHeight: 44,
    borderRadius: layout.controlRadius,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  filterSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterText: { color: colors.muted, fontSize: 12, fontFamily: fonts.semibold },
  filterTextSelected: { color: colors.onAccent },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  liveDotSelected: { backgroundColor: colors.onAccent },
  pressed: { opacity: 0.78 },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 14,
    gap: 12,
    flexWrap: "wrap",
  },
  listTitle: { ...typography.sectionTitle },
  count: {
    ...typography.caption,
    fontVariant: ["tabular-nums"],
  },
  empty: {
    alignItems: "center",
    padding: 24,
    borderRadius: layout.cardRadius,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyTitle: { ...typography.sectionTitle },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8, fontFamily: fonts.regular,
  },
  clearButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  clearText: { color: colors.accent, fontSize: 13, fontFamily: fonts.semibold },
  note: { ...typography.caption, color: colors.subtle, marginTop: 24 },
});
