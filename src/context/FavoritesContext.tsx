import { useAccountData } from "@/context/AccountDataContext";

/** Existing cards share the account sync store and the original guest favourites. */
export function useFavorites() {
  const { favorites, toggleFavorite, ready } = useAccountData();
  return {
    favorites,
    toggleFavorite,
    isFavorite: (id: string) => favorites.includes(id),
    ready,
  };
}
