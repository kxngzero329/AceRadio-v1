import { useMemo, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable } from "react-native";
import { Search } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageScrollView } from "@/components/PageScrollView";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ShowGrid } from "@/components/ShowGrid";
import { shows } from "@/data/shows";
import { useRadio } from "@/context/RadioContext";
import { colors } from "@/theme/colors";

type ShowFilter = "all" | "live" | "weekdays" | "weekend";
const filters: { id: ShowFilter; label: string }[] = [
  { id: "all", label: "All shows" },
  { id: "live", label: "Live now" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekend", label: "Weekend" },
];

export default function ShowsScreen() {
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
      const weekend = /Saturday|Sunday|Weekend/i.test(show.day);
      const matchesFilter =
        filter === "all" ||
        (filter === "live" && liveIds.has(show.id)) ||
        (filter === "weekdays" && !weekend) ||
        (filter === "weekend" && weekend);
      return matchesSearch && matchesFilter;
    });
  }, [search, filter, liveShows]);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader />
      <PageScrollView
        testID="shows-scroll"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>THE LINEUP</Text>
        <Text style={styles.title}>
          All shows<Text style={styles.green}>.</Text>
        </Text>
        <Text style={styles.sub}>Discover the voices behind the music.</Text>
        <View style={styles.search}>
          <Search size={18} color={colors.muted} />
          <TextInput
            testID="shows-search"
            accessibilityLabel="Search shows or presenters"
            placeholder="Search shows or presenters"
            placeholderTextColor={colors.subtle}
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
              onPress={() => setFilter(option.id)}
              style={({ pressed }) => [
                styles.filter,
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
        <ShowGrid shows={filtered} />
        {!filtered.length && (
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
  content: { paddingHorizontal: 20, paddingBottom: 178 },
  eyebrow: {
    color: colors.green,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.2,
    marginTop: 14,
  },
  title: {
    color: colors.white,
    fontWeight: "900",
    fontSize: 39,
    letterSpacing: -1.5,
    marginTop: 7,
  },
  green: { color: colors.green },
  sub: { color: colors.muted, fontSize: 14, marginTop: 4 },
  search: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    marginTop: 26,
  },
  input: { flex: 1, minHeight: 52, color: colors.white, fontSize: 14 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  filter: {
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  filterSelected: { backgroundColor: colors.green, borderColor: colors.green },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  filterTextSelected: { color: colors.background },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.green,
  },
  liveDotSelected: { backgroundColor: colors.background },
  pressed: { opacity: 0.78 },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 26,
    marginBottom: 16,
  },
  listTitle: { color: colors.white, fontSize: 18, fontWeight: "800" },
  count: {
    fontSize: 10,
    letterSpacing: 1.3,
    fontWeight: "800",
    color: colors.green,
  },
  empty: { alignItems: "center", paddingVertical: 34 },
  emptyTitle: { color: colors.white, fontSize: 18, fontWeight: "800" },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
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
  clearText: { color: colors.green, fontSize: 13, fontWeight: "700" },
  note: { color: colors.subtle, fontSize: 11, lineHeight: 17, marginTop: 26 },
});
