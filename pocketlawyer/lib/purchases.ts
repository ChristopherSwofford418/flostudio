import { Platform } from "react-native";
import { setSubscription } from "./scan-store";

const RC_IOS_KEY = (process.env.REVENUECAT_IOS_KEY as string) ?? "";

let Purchases: any = null;

async function loadPurchases(): Promise<any> {
  if (Platform.OS === "web") return null;
  if (Purchases) return Purchases;
  try {
    Purchases = (await import("react-native-purchases")).default;
    return Purchases;
  } catch {
    return null;
  }
}

export async function configurePurchases(): Promise<void> {
  const P = await loadPurchases();
  if (!P || !RC_IOS_KEY) return;
  try {
    await P.configure({ apiKey: RC_IOS_KEY });
  } catch {
    // Already configured
  }
}

export async function getOfferings(): Promise<any | null> {
  const P = await loadPurchases();
  if (!P) return null;
  try {
    const offerings = await P.getOfferings();
    return offerings.current ?? null;
  } catch {
    return null;
  }
}

export async function purchasePackage(pkg: any): Promise<boolean> {
  const P = await loadPurchases();
  if (!P) {
    const tier = pkg?.product?.productIdentifier?.includes("lawfirm") ? "law_firm" : "pro";
    await setSubscription({ tier });
    return true;
  }
  try {
    const result = await P.purchasePackage(pkg);
    const productId: string = result.productIdentifier ?? "";
    const tier = productId.includes("lawfirm") ? "law_firm" : "pro";
    await setSubscription({ tier });
    return true;
  } catch (err: any) {
    if (err?.userCancelled) return false;
    throw err;
  }
}

export async function restorePurchases(): Promise<boolean> {
  const P = await loadPurchases();
  if (!P) return false;
  try {
    const customerInfo = await P.restorePurchases();
    const entitlements = customerInfo?.entitlements?.active ?? {};
    const hasActive = Object.keys(entitlements).length > 0;
    if (hasActive) {
      const ids = Object.keys(entitlements);
      const tier = ids.some((id: string) => id.includes("law_firm")) ? "law_firm" : "pro";
      await setSubscription({ tier });
    }
    return hasActive;
  } catch {
    return false;
  }
}

export async function getCustomerInfo(): Promise<any | null> {
  const P = await loadPurchases();
  if (!P) return null;
  try {
    return await P.getCustomerInfo();
  } catch {
    return null;
  }
}
