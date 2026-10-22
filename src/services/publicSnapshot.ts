import AsyncStorage from "@react-native-async-storage/async-storage";
import { digestStringAsync, CryptoDigestAlgorithm } from "expo-crypto";
import { Platform } from "react-native";
import { contentConfig } from "@/config/content";
import { createPublicSnapshotClient } from "./publicSnapshotClient";

const project = "https://dbgpfqyighcaquxwzkfe.supabase.co";
const configured = process.env.EXPO_PUBLIC_CONTENT_SNAPSHOT_URL;
export const publicSnapshotEnabled = () =>
  contentConfig.source === "supabase" &&
  contentConfig.url === project &&
  process.env.EXPO_PUBLIC_CONTENT_TRANSPORT !== "legacy";
const pointerUrl =
  configured ||
  "https://pub-ceb0894cfd2d497bb797c252ba0503fc.r2.dev/public-content/v1/current.json";
const browser = Platform.OS === "web";
const url = browser ? `${project}/functions/v1/public-content` : pointerUrl;
const cache = createPublicSnapshotClient({
  url,
  mode: browser ? "proxy" : "pointer",
  fetch: (...args) => fetch(...args),
  hash: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
  read: () => AsyncStorage.getItem(`aceradio:public-snapshot:v1:${url}`),
  write: (value) =>
    AsyncStorage.setItem(`aceradio:public-snapshot:v1:${url}`, value),
});
export const readPublicSnapshot = (signal: AbortSignal) => cache.get(signal);
