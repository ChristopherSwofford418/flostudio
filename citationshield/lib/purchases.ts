/**
 * Native Apple IAP via expo-iap v4 (StoreKit 2)
 *
 * Product IDs must match exactly what's configured in App Store Connect
 * under Monetization → Subscriptions.
 *
 * expo-iap v4 uses an event-based purchase flow:
 *  1. Call requestPurchase() — this is fire-and-forget
 *  2. Listen for purchaseUpdatedListener event to get the result
 *  3. Call finishTransaction() to acknowledge the purchase
 */

import { Platform } from "react-native";
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  getAvailablePurchases,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  type Purchase,
  type ProductOrSubscription,
} from "expo-iap";
import { setSubscription } from "./scan-store";

export const PRODUCT_IDS = {
  pro: "com.citationshield.app.pro.monthly",
  law_firm: "com.citationshield.app.lawfirm.monthly",
};

let connectionInitialized = false;

export async function configurePurchases(): Promise<void> {
  if (Platform.OS === "web") return;
  if (connectionInitialized) return;
  try {
    await initConnection();
    connectionInitialized = true;
  } catch {
    // Connection failed — IAP unavailable on this device
  }
}

export async function getOfferings(): Promise<ProductOrSubscription[] | null> {
  if (Platform.OS === "web") return null;
  try {
    const products = await fetchProducts({
      skus: Object.values(PRODUCT_IDS),
      type: "subs",
    });
    return products && products.length > 0 ? products : null;
  } catch {
    return null;
  }
}

/**
 * Purchase a subscription product.
 * Returns true if purchase succeeded, false if user cancelled.
 * Throws on real errors.
 */
export async function purchasePackage(productId: string): Promise<boolean> {
  if (Platform.OS === "web") {
    throw new Error("In-app purchases are not available on web.");
  }
  if (!connectionInitialized) {
    throw new Error("In-app purchases are not available on this device. Please try again.");
  }

  return new Promise<boolean>((resolve, reject) => {
    // Set up one-time listeners for this purchase
    const successSub = purchaseUpdatedListener(async (purchase: Purchase) => {
      successSub.remove();
      errorSub.remove();

      try {
        // Finish the transaction to acknowledge it with Apple
        await finishTransaction({ purchase, isConsumable: false });

        // Determine tier from product ID and save subscription
        const purchaseProductId = (purchase as any).productId ?? (purchase as any).id ?? "";
        const tier = purchaseProductId.includes("lawfirm") ? "law_firm" : "pro";
        await setSubscription({ tier });

        resolve(true);
      } catch (err) {
        reject(err);
      }
    });

    const errorSub = purchaseErrorListener((error) => {
      successSub.remove();
      errorSub.remove();

      // User cancelled — resolve false instead of rejecting
      if ((error as any)?.code === "E_USER_CANCELLED" || (error as any)?.userCancelled) {
        resolve(false);
      } else {
        reject(new Error((error as any)?.message || "Purchase failed"));
      }
    });

    // Trigger the purchase (event-based — result comes via listeners above)
    requestPurchase({
      request: {
        apple: { sku: productId },
        google: { skus: [productId] },
      },
      type: "subs",
    }).catch((err) => {
      successSub.remove();
      errorSub.remove();
      if ((err as any)?.code === "E_USER_CANCELLED" || (err as any)?.userCancelled) {
        resolve(false);
      } else {
        reject(err);
      }
    });
  });
}

export async function restorePurchases(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (!connectionInitialized) return false;

  try {
    const purchases = await getAvailablePurchases();
    if (!purchases || purchases.length === 0) return false;

    // Find the most recent active subscription
    const productIds = Object.values(PRODUCT_IDS);
    const activePurchase = purchases.find((p) =>
      productIds.includes((p as any).productId ?? (p as any).id)
    );

    if (activePurchase) {
      const purchaseProductId = (activePurchase as any).productId ?? (activePurchase as any).id ?? "";
      const tier = purchaseProductId.includes("lawfirm") ? "law_firm" : "pro";
      await setSubscription({ tier });
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export async function cleanupPurchases(): Promise<void> {
  if (Platform.OS === "web") return;
  if (!connectionInitialized) return;
  try {
    await endConnection();
    connectionInitialized = false;
  } catch {
    // Ignore cleanup errors
  }
}
