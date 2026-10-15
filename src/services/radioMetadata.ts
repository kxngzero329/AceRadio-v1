import { Asset } from "expo-asset";
import { Platform } from "react-native";
import type { Show } from "@/types/show";
import type { StreamMetadata } from "@/utils/RadioPlayback";

const artworkAssets = new Map<number, Asset>();
const isReadableFile = (uri: string | null) =>
  uri?.startsWith("file://") && !uri.startsWith("file:///android_res/");

function getArtworkAsset(module: number): Asset {
  const cached = artworkAssets.get(module);
  if (cached) return cached;
  const original = Asset.fromModule(module);
  // Expo marks bare Android drawable names as downloaded. Bypass that shortcut
  // and let its native resource copier produce a standard file:// URL.
  const asset = isReadableFile(original.localUri) ? original : new Asset({
    name: original.name, type: original.type, uri: original.uri,
  });
  artworkAssets.set(module, asset);
  return asset;
}

export function getRadioMetadata(show: Show, canSkip: boolean): StreamMetadata {
  const artwork = show.image ?? show.poster;
  const asset = typeof artwork === "number" ? getArtworkAsset(artwork) : null;
  const artworkUrl = asset
    ? asset.localUri ?? asset.uri
    : Array.isArray(artwork)
      ? artwork[0]?.uri
      : typeof artwork === "object" ? artwork?.uri : undefined;
  return { title: show.title, artist: show.presenter, artworkUrl, canSkip };
}

/** Copy packaged Android drawable resources to a file readable by system players. */
export async function resolveRadioArtwork(show: Show): Promise<void> {
  if (Platform.OS === "web") return;
  const artwork = show.image ?? show.poster;
  if (typeof artwork !== "number") return;
  const asset = getArtworkAsset(artwork);
  if (isReadableFile(asset.localUri)) return;
  await asset.downloadAsync();
}
