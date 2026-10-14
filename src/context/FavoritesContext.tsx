import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

type FavoritesState = {
  favorites: string[];
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  ready: boolean;
};
const FavoritesContext = createContext<FavoritesState | null>(null);
const STORE_KEY = "aceradio:favorites:v1";
export function FavoritesProvider({ children }: PropsWithChildren) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORE_KEY)
      .then((value) => {
        if (alive && value) {
          const parsed: unknown = JSON.parse(value);
          if (Array.isArray(parsed))
            setFavorites(
              parsed.filter((v): v is string => typeof v === "string"),
            );
        }
      })
      .catch(console.warn)
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (ready)
      AsyncStorage.setItem(STORE_KEY, JSON.stringify(favorites)).catch(
        console.warn,
      );
  }, [favorites, ready]);
  const toggleFavorite = useCallback(
    (id: string) =>
      setFavorites((old) =>
        old.includes(id) ? old.filter((x) => x !== id) : [...old, id],
      ),
    [],
  );
  const isFavorite = useCallback(
    (id: string) => favorites.includes(id),
    [favorites],
  );
  const value = useMemo(
    () => ({ favorites, toggleFavorite, isFavorite, ready }),
    [favorites, toggleFavorite, isFavorite, ready],
  );
  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}
export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context)
    throw new Error("useFavorites must be inside FavoritesProvider");
  return context;
}
