import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const HOME_PRODUCT_KEY = "workzilla.mobile.home_product_slug";

export async function getHomeProductSlug() {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") {
      return "";
    }
    return window.localStorage.getItem(HOME_PRODUCT_KEY) || "";
  }
  return (await SecureStore.getItemAsync(HOME_PRODUCT_KEY)) || "";
}

export async function setHomeProductSlug(productSlug: string) {
  const value = String(productSlug || "").trim();
  if (Platform.OS === "web") {
    if (typeof window === "undefined") {
      return;
    }
    if (value) {
      window.localStorage.setItem(HOME_PRODUCT_KEY, value);
    } else {
      window.localStorage.removeItem(HOME_PRODUCT_KEY);
    }
    return;
  }
  if (value) {
    await SecureStore.setItemAsync(HOME_PRODUCT_KEY, value);
  } else {
    await SecureStore.deleteItemAsync(HOME_PRODUCT_KEY);
  }
}
